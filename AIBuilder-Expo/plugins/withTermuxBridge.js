const {
  withAndroidManifest,
  withMainApplication,
  withDangerousMod,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Мост между приложением и отдельно установленным Termux (+ Termux:API).
 *
 * ВАЖНО, что этот плагин НЕ делает и не может делать:
 *  - не встраивает исходники/ядро самого Termux в это приложение (это
 *    отдельное Android-приложение с собственным bootstrap'ом, см. README.md,
 *    раздел "Termux-сессия — как это работает на самом деле");
 *  - не может обойти сознательное ограничение самого Termux: сторонние
 *    приложения могут выполнять в нём команды ТОЛЬКО если пользователь сам
 *    один раз включил allow-external-apps=true в ~/.termux/termux.properties
 *    внутри Termux. Это защита от того, чтобы любое приложение на телефоне
 *    втихую слало команды в чужой терминал без ведома владельца устройства —
 *    и данный плагин намеренно её не обходит.
 *
 * Что реально делает:
 *  - добавляет нативный модуль TermuxBridgeModule (Kotlin), который посылает
 *    официальный документированный Intent Termux:API RUN_COMMAND в сервис
 *    com.termux.app.RunCommandService и ждёт результат, читая файлы
 *    (stdout/stderr/exit-код), которые сам Termux пишет в общую папку на
 *    внешнем хранилище (см. lib/termux-bridge.ts на JS-стороне);
 *  - добавляет разрешение com.termux.permission.RUN_COMMAND (его отдельно
 *    запрашивает com.termux.permission.RUN_COMMAND у пользователя во время
 *    выполнения — как обычное "опасное" разрешение Android);
 *  - добавляет <queries> на пакет com.termux, иначе на Android 11+ наше
 *    приложение не сможет даже проверить, установлен ли Termux;
 *  - не требует MANAGE_EXTERNAL_STORAGE: результаты RUN_COMMAND приходят
 *    через официальный PendingIntent callback Termux, поэтому приложению не
 *    нужен общий каталог на /storage/emulated/0 только ради stdout/stderr.
 */


function moduleKotlin(pkg) {
  return `package ${pkg}

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.security.MessageDigest
import android.app.PendingIntent
import java.util.UUID

/**
 * Мост JS -> Termux:API (RUN_COMMAND). Используется только когда
 * пользователь сам включил "Termux-сессию" в приложении — см.
 * lib/termux-bridge.ts и components/TermuxContext.tsx на JS-стороне.
 *
 * Каждый вызов runCommand():
 *  1) запускает команду через официальный RUN_COMMAND Intent;
 *  2) получает stdout/stderr/exitCode обратно через PendingIntent callback;
 *  3) ждёт callback с ограниченным таймаутом. Общая папка на
 *     /storage/emulated/0 для передачи результатов больше не используется.
 */
private data class TermuxCommandCallback(
    val commandId: String,
    val stdout: String,
    val stderr: String,
    val exitCode: Int,
    val errCode: Int,
    val errMsg: String
)

private object TermuxResultStore {
    private val waiters = java.util.concurrent.ConcurrentHashMap<String, java.util.concurrent.CountDownLatch>()
    private val results = java.util.concurrent.ConcurrentHashMap<String, TermuxCommandCallback>()

    fun register(id: String) {
        waiters[id] = java.util.concurrent.CountDownLatch(1)
    }

    fun publish(id: String, result: TermuxCommandCallback) {
        results[id] = result
        waiters.remove(id)?.countDown()
    }

    fun await(id: String, timeoutMs: Long): TermuxCommandCallback? {
        val latch = waiters[id] ?: return results.remove(id)
        latch.await(timeoutMs, java.util.concurrent.TimeUnit.MILLISECONDS)
        return results.remove(id)
    }

    fun cancel(id: String) {
        waiters.remove(id)?.countDown()
        results.remove(id)
    }
}

class TermuxResultReceiver : android.content.BroadcastReceiver() {
    companion object {
        const val EXTRA_EXECUTION_ID = "aibuilder.termux.execution_id"
    }

    override fun onReceive(context: Context?, intent: Intent?) {
        if (intent == null) return
        val id = intent.getStringExtra(EXTRA_EXECUTION_ID) ?: return
        val bundle = intent.getBundleExtra("result")
        if (bundle == null) {
            TermuxResultStore.publish(id, TermuxCommandCallback(id, "", "TERMUX_RESULT_BUNDLE_MISSING", -1, -1, "result bundle missing"))
            return
        }
        TermuxResultStore.publish(
            id,
            TermuxCommandCallback(
                commandId = id,
                stdout = bundle.getString("stdout", ""),
                stderr = bundle.getString("stderr", ""),
                exitCode = bundle.getInt("exitCode", -1),
                errCode = bundle.getInt("err", -1),
                errMsg = bundle.getString("errmsg", "")
            )
        )
    }
}

class TermuxLiveOutputReceiver(private val module: TermuxBridgeModule) : android.content.BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        if (intent == null) return
        module.forwardLiveOutput(
            intent.getStringExtra("cmdId") ?: "",
            intent.getStringExtra("stream") ?: "stdout",
            intent.getStringExtra("chunk") ?: ""
        )
    }
}

class TermuxBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var liveReceiver: TermuxLiveOutputReceiver? = null
    private var pendingModelExportPromise: Promise? = null
    private var pendingModelExportFiles: Array<String>? = null
    private var pendingModelExportNames: Array<String>? = null
    private val modelExportRequestCode = 48321

    private val activityEventListener = object : ActivityEventListener {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode != modelExportRequestCode) return
            val promise = pendingModelExportPromise
            val files = pendingModelExportFiles
            val names = pendingModelExportNames
            pendingModelExportPromise = null
            pendingModelExportFiles = null
            pendingModelExportNames = null
            if (promise == null) return
            if (resultCode != Activity.RESULT_OK || data?.data == null || files == null || names == null || files.isEmpty() || names.isEmpty()) {
                promise.resolve(false)
                return
            }
            val treeUri = data.data!!
            try {
                val flags = data.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                if (flags != 0) {
                    try { reactApplicationContext.contentResolver.takePersistableUriPermission(treeUri, flags) } catch (_: Exception) { }
                }
            } catch (_: Exception) { }
            Thread {
                val created = mutableListOf<Uri>()
                try {
                    val n = minOf(files.size, names.size)
                    for (i in 0 until n) {
                        val src = files[i]
                        val name = names[i]
                        if (src.isBlank() || name.isBlank()) continue
                        created += copyModelFileToTree(src, name, treeUri)
                    }
                    if (created.isEmpty()) {
                        promise.reject("MODEL_EXPORT_FAILED", "Нет файлов для экспорта", null)
                    } else {
                        promise.resolve(true)
                    }
                } catch (e: Exception) {
                    for (uri in created) {
                        try { reactApplicationContext.contentResolver.delete(uri, null, null) } catch (_: Exception) { }
                    }
                    promise.reject("MODEL_EXPORT_FAILED", e.message ?: e.toString(), e)
                }
            }.start()
        }

        override fun onNewIntent(intent: Intent) { }
    }

    init {
        reactApplicationContext.addActivityEventListener(activityEventListener)
        liveReceiver = TermuxLiveOutputReceiver(this)
        val filter = android.content.IntentFilter(ACTION_LIVE_OUTPUT)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactContext.registerReceiver(liveReceiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            reactContext.registerReceiver(liveReceiver, filter)
        }
    }

    override fun getName() = "TermuxBridge"

    companion object {
        const val ACTION_LIVE_OUTPUT = "${pkg}.TERMUX_LIVE_OUTPUT"
    }

    fun forwardLiveOutput(cmdId: String, stream: String, chunk: String) {
        if (chunk.isEmpty()) return
        emitOutput(cmdId, stream, chunk)
    }

    override fun invalidate() {
        try { liveReceiver?.let { reactApplicationContext.unregisterReceiver(it) } } catch (_: Exception) { }
        liveReceiver = null
        pendingModelExportPromise = null
        pendingModelExportFiles = null
        pendingModelExportNames = null
        try { reactApplicationContext.removeActivityEventListener(activityEventListener) } catch (_: Exception) { }
        super.invalidate()
    }

    // RN требует эти методы для NativeEventEmitter
    @ReactMethod
    fun addListener(eventName: String) { }

    @ReactMethod
    fun removeListeners(count: Int) { }

    private fun emitLifecycle(cmdId: String, event: String, detail: String = "") {
        try {
            val params: WritableMap = Arguments.createMap()
            params.putString("cmdId", cmdId)
            params.putString("stream", "lifecycle")
            params.putString("event", event)
            params.putString("chunk", detail)
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("TermuxCommandOutput", params)
        } catch (e: Exception) {
            android.util.Log.w("TermuxBridge", "emitLifecycle failed: \${e.message}")
        }
    }

    private fun emitOutput(cmdId: String, stream: String, chunk: String) {
        if (chunk.isEmpty()) return
        try {
            val params: WritableMap = Arguments.createMap()
            params.putString("cmdId", cmdId)
            params.putString("stream", stream)
            params.putString("chunk", chunk)
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("TermuxCommandOutput", params)
        } catch (e: Exception) {
            android.util.Log.w("TermuxBridge", "emitOutput failed: \${e.message}")
        }
    }

    private fun emitHeartbeat(cmdId: String, elapsedSec: Long, stdoutBytes: Long) {
        try {
            val params: WritableMap = Arguments.createMap()
            params.putString("cmdId", cmdId)
            params.putString("stream", "heartbeat")
            params.putString("chunk", "… выполняется \${elapsedSec}s (stdout \${stdoutBytes} байт)")
            params.putDouble("elapsedSec", elapsedSec.toDouble())
            params.putDouble("stdoutBytes", stdoutBytes.toDouble())
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("TermuxCommandOutput", params)
        } catch (e: Exception) { }
    }

    private val TERMUX_PACKAGE = "com.termux"
    private val TERMUX_RUN_COMMAND_SERVICE = "com.termux.app.RunCommandService"
    private val TERMUX_BASH = "/data/data/com.termux/files/usr/bin/bash"
    private val TERMUX_HOME = "/data/data/com.termux/files/home"
    private val RUN_COMMAND_PERMISSION = "com.termux.permission.RUN_COMMAND"

    @ReactMethod
    fun isTermuxInstalled(promise: Promise) {
        try {
            reactApplicationContext.packageManager.getPackageInfo(TERMUX_PACKAGE, 0)
            promise.resolve(true)
        } catch (e: PackageManager.NameNotFoundException) {
            promise.resolve(false)
        } catch (e: Exception) {
            promise.reject("TERMUX_CHECK_FAILED", e)
        }
    }

    @ReactMethod
    fun hasRunCommandPermission(promise: Promise) {
        val granted = reactApplicationContext.checkCallingOrSelfPermission(RUN_COMMAND_PERMISSION) ==
            PackageManager.PERMISSION_GRANTED
        promise.resolve(granted)
    }

    @ReactMethod
    fun getSupportedAbis(promise: Promise) {
        try {
            val arr = Arguments.createArray()
            Build.SUPPORTED_ABIS.forEach { arr.pushString(it) }
            promise.resolve(arr)
        } catch (e: Exception) {
            promise.reject("ABI_CHECK_FAILED", e)
        }
    }

    @ReactMethod
    fun sha256File(fileUri: String, promise: Promise) {
        try {
            val rawStripped = fileUri.removePrefix("file://")
            val decoded = try { java.net.URLDecoder.decode(rawStripped, "UTF-8") } catch (_: Exception) { rawStripped }
            var file = File(decoded)
            if (!file.exists()) {
                val direct = File(rawStripped)
                if (direct.exists()) file = direct
            }
            if (!file.exists() || !file.isFile || file.length() <= 0L) {
                promise.reject("FILE_NOT_FOUND", "Файл не найден или пуст")
                return
            }
            val digest = MessageDigest.getInstance("SHA-256")
            FileInputStream(file).use { input ->
                val buffer = ByteArray(1024 * 1024)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    if (read > 0) digest.update(buffer, 0, read)
                }
            }
            promise.resolve(digest.digest().joinToString("") { "%02x".format(it) })
        } catch (e: Exception) {
            promise.reject("SHA256_FAILED", e)
        }
    }

    @ReactMethod
    fun getPackageVersion(packageName: String, promise: Promise) {
        try {
            val info = reactApplicationContext.packageManager.getPackageInfo(packageName, 0)
            promise.resolve(info.versionName ?: info.longVersionCode.toString())
        } catch (e: PackageManager.NameNotFoundException) {
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("PACKAGE_VERSION_FAILED", e)
        }
    }

    @ReactMethod
    fun canInstallPackages(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                promise.resolve(reactApplicationContext.packageManager.canRequestPackageInstalls())
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun openUnknownSourcesSettings(promise: Promise) {
        try {
            val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                    data = Uri.parse("package:" + reactApplicationContext.packageName)
                }
            } else {
                Intent(Settings.ACTION_SECURITY_SETTINGS)
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OPEN_UNKNOWN_SOURCES_FAILED", e)
        }
    }

    @ReactMethod
    fun installApk(fileUri: String, promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                !reactApplicationContext.packageManager.canRequestPackageInstalls()) {
                promise.reject("INSTALL_PERMISSION_REQUIRED", "Разрешите этому приложению устанавливать неизвестные приложения.")
                return
            }
            val rawPath = fileUri.removePrefix("file://")
            val file = File(rawPath)
            if (!file.exists() || !file.isFile || file.length() <= 0L) {
                promise.reject("APK_NOT_FOUND", "APK не найден или пуст: " + rawPath)
                return
            }
            val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                FileProvider.getUriForFile(
                    reactApplicationContext,
                    reactApplicationContext.packageName + ".fileprovider",
                    file
                )
            } else {
                Uri.fromFile(file)
            }
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                // Без ClipData часть прошивок Android 10–14 не передаёт grant
                // installer'у и окно установки молча не открывается.
                clipData = android.content.ClipData.newRawUri("", uri)
            }
            // Явно выдаём read grant пакетному установщику, если он известен.
            try {
                val installer = "com.android.packageinstaller"
                reactApplicationContext.grantUriPermission(
                    installer, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            } catch (_: Exception) { }
            try {
                val installer = "com.google.android.packageinstaller"
                reactApplicationContext.grantUriPermission(
                    installer, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            } catch (_: Exception) { }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("APK_INSTALL_LAUNCH_FAILED", e)
        }
    }

    @ReactMethod
    fun openPackage(packageName: String, promise: Promise) {
        try {
            val intent = reactApplicationContext.packageManager.getLaunchIntentForPackage(packageName)
                ?: throw IllegalArgumentException("Пакет не установлен или не имеет launcher activity: " + packageName)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OPEN_PACKAGE_FAILED", e)
        }
    }

    private fun decodeFileUri(fileUri: String): String {
        val raw = fileUri.removePrefix("file://")
        return try { java.net.URLDecoder.decode(raw, "UTF-8") } catch (_: Exception) { raw }
    }

    @ReactMethod
    fun getContentUriSize(sourceUri: String, promise: Promise) {
        try {
            val size = if (sourceUri.startsWith("content://")) {
                val uri = Uri.parse(sourceUri)
                reactApplicationContext.contentResolver.query(
                    uri,
                    arrayOf(OpenableColumns.SIZE),
                    null,
                    null,
                    null
                )?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val index = cursor.getColumnIndex(OpenableColumns.SIZE)
                        if (index >= 0 && !cursor.isNull(index)) cursor.getLong(index) else -1L
                    } else -1L
                } ?: -1L
            } else {
                File(decodeFileUri(sourceUri)).length()
            }
            promise.resolve(size)
        } catch (e: Exception) {
            promise.reject("MODEL_SOURCE_SIZE_FAILED", e.message ?: e.toString(), e)
        }
    }

    @ReactMethod
    fun importModelFile(sourceUri: String, destinationUri: String, promise: Promise) {
        Thread {
            val destination = File(decodeFileUri(destinationUri))
            val temp = File(destination.parentFile ?: reactApplicationContext.cacheDir, destination.name + ".import.part")
            try {
                destination.parentFile?.mkdirs()
                if (temp.exists()) temp.delete()
                val resolver = reactApplicationContext.contentResolver
                val input = if (sourceUri.startsWith("content://")) {
                    resolver.openInputStream(Uri.parse(sourceUri))
                        ?: throw IllegalStateException("MODEL_IMPORT_SOURCE_OPEN_FAILED")
                } else {
                    FileInputStream(File(decodeFileUri(sourceUri)))
                }
                input.use { rawInput ->
                    BufferedInputStream(rawInput, 1024 * 1024).use { bufferedIn ->
                        FileOutputStream(temp).use { rawOutput ->
                            BufferedOutputStream(rawOutput, 1024 * 1024).use { bufferedOut ->
                                val buffer = ByteArray(1024 * 1024)
                                while (true) {
                                    val read = bufferedIn.read(buffer)
                                    if (read < 0) break
                                    if (read > 0) bufferedOut.write(buffer, 0, read)
                                }
                                bufferedOut.flush()
                            }
                        }
                    }
                }
                if (!temp.exists() || temp.length() <= 0L) {
                    throw IllegalStateException("MODEL_IMPORT_EMPTY_SOURCE")
                }
                if (destination.exists()) destination.delete()
                if (!temp.renameTo(destination)) {
                    FileInputStream(temp).use { inputStream ->
                        BufferedInputStream(inputStream, 1024 * 1024).use { bufferedIn ->
                            FileOutputStream(destination).use { outputStream ->
                                BufferedOutputStream(outputStream, 1024 * 1024).use { bufferedOut ->
                                    val buffer = ByteArray(1024 * 1024)
                                    while (true) {
                                        val read = bufferedIn.read(buffer)
                                        if (read < 0) break
                                        if (read > 0) bufferedOut.write(buffer, 0, read)
                                    }
                                    bufferedOut.flush()
                                }
                            }
                        }
                    }
                    temp.delete()
                }
                promise.resolve(true)
            } catch (e: Exception) {
                try { temp.delete() } catch (_: Exception) { }
                try { destination.delete() } catch (_: Exception) { }
                promise.reject("MODEL_IMPORT_FAILED", e.message ?: e.toString(), e)
            }
        }.start()
    }

    private fun copyModelFileToTree(sourceUri: String, fileName: String, treeUri: Uri): Uri {
        val source = File(decodeFileUri(sourceUri))
        if (!source.exists() || !source.isFile || source.length() <= 0L) {
            throw IllegalArgumentException("MODEL_EXPORT_SOURCE_NOT_FOUND: \${source.absolutePath}")
        }
        val resolver = reactApplicationContext.contentResolver
        // SAF: createDocument needs a *document* URI of the parent folder, not the raw tree URI.
        val treeDocId = DocumentsContract.getTreeDocumentId(treeUri)
        val parentDocUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, treeDocId)
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, treeDocId)
        // Replace an existing exported file instead of letting SAF silently rename to "(1)".
        resolver.query(
            children,
            arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME),
            null,
            null,
            null
        )?.use { cursor ->
            val idIdx = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
            val nameIdx = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
            while (cursor.moveToNext()) {
                if (nameIdx >= 0 && idIdx >= 0 && fileName == cursor.getString(nameIdx)) {
                    val existingId = cursor.getString(idIdx)
                    try {
                        resolver.delete(
                            DocumentsContract.buildDocumentUriUsingTree(treeUri, existingId),
                            null, null
                        )
                    } catch (_: Exception) { }
                }
            }
        }
        val target = DocumentsContract.createDocument(
            resolver,
            parentDocUri,
            "application/octet-stream",
            fileName
        ) ?: throw IllegalStateException("MODEL_EXPORT_TARGET_CREATE_FAILED: $fileName")
        try {
            val output = resolver.openOutputStream(target, "w")
                ?: throw IllegalStateException("MODEL_EXPORT_OUTPUT_OPEN_FAILED: $fileName")
            FileInputStream(source).use { input ->
                BufferedInputStream(input, 1024 * 1024).use { bufferedIn ->
                    BufferedOutputStream(output, 1024 * 1024).use { bufferedOut ->
                        val buffer = ByteArray(1024 * 1024)
                        while (true) {
                            val read = bufferedIn.read(buffer)
                            if (read < 0) break
                            if (read > 0) bufferedOut.write(buffer, 0, read)
                        }
                        bufferedOut.flush()
                    }
                }
            }
            return target
        } catch (e: Exception) {
            try { resolver.delete(target, null, null) } catch (_: Exception) { }
            throw e
        }
    }

    @ReactMethod
    fun exportModelToDirectory(
        llmUri: String,
        llmName: String,
        mmprojUri: String,
        mmprojName: String,
        promise: Promise
    ) {
        try {
            if (pendingModelExportPromise != null) {
                promise.reject("MODEL_EXPORT_BUSY", "Экспорт модели уже выполняется")
                return
            }
            val activity = reactApplicationContext.currentActivity
            if (activity == null) {
                promise.reject("MODEL_EXPORT_NO_ACTIVITY", "Не удалось открыть системный выбор папки")
                return
            }
            pendingModelExportPromise = promise
            pendingModelExportFiles = arrayOf(llmUri, mmprojUri)
            pendingModelExportNames = arrayOf(llmName, mmprojName)
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
            }
            activity.startActivityForResult(intent, modelExportRequestCode)
        } catch (e: Exception) {
            pendingModelExportPromise = null
            pendingModelExportFiles = null
            pendingModelExportNames = null
            promise.reject("MODEL_EXPORT_LAUNCH_FAILED", e.message ?: e.toString(), e)
        }
    }

    @ReactMethod
    fun runCommand(command: String, workdir: String?, timeoutMs: Double, promise: Promise) {
        Thread {
            val id = UUID.randomUUID().toString().replace("-", "")
            try {
                // Termux >= 0.109 supports returning stdout/stderr/exitCode through
                // a PendingIntent. This avoids a shared /storage result directory and
                // therefore removes the need for MANAGE_EXTERNAL_STORAGE.
                TermuxResultStore.register(id)
                val effectiveWorkdir = if (workdir.isNullOrBlank()) TERMUX_HOME else workdir

                // Execute through coreutils timeout so the timeout terminates the
                // command in Termux itself rather than merely stopping our wait.
                val timeoutSec = maxOf(1L, kotlin.math.ceil(timeoutMs / 1000.0).toLong())
                val timeoutCmd =
                    "if ! command -v timeout >/dev/null 2>&1; then echo 'AIBUILDER_TIMEOUT_UNAVAILABLE: install coreutils in Termux' >&2; exit 126; fi; " +
                    "timeout --signal=TERM --kill-after=10s " + timeoutSec + "s bash --noprofile --norc -c " + shellQuote(command)

                val liveAction = shellQuote(ACTION_LIVE_OUTPUT)
                val livePackage = shellQuote("${pkg}")
                val liveId = shellQuote(id)
                val wrapped = "cd " + shellQuote(effectiveWorkdir) +
                    " 2>/dev/null || { echo 'AIBUILDER_WORKDIR_ERROR: ' >&2; exit 125; }; " +
                    "set -o pipefail; " +
                    "if command -v stdbuf >/dev/null 2>&1; then runner() { stdbuf -oL -eL bash -c " + shellQuote(timeoutCmd) + "; }; " +
                    "else runner() { bash -c " + shellQuote(timeoutCmd) + "; }; fi; " +
                    "runner 2> >(while IFS= read -r line; do /system/bin/am broadcast -a " + liveAction +
                    " -p " + livePackage + " --es cmdId " + liveId + " --es stream stderr --es chunk \\\"\\$line\\\" >/dev/null 2>&1 || true; done) | " +
                    "while IFS= read -r line; do /system/bin/am broadcast -a " + liveAction +
                    " -p " + livePackage + " --es cmdId " + liveId + " --es stream stdout --es chunk \\\"\\$line\\\" >/dev/null 2>&1 || true; printf '%s\\\\n' \\\"\\$line\\\"; done; " +
                    "rc=\\\${PIPESTATUS[0]}; exit \\\"\\$rc\\\""

                val resultIntent = Intent().apply {
                    setClass(reactApplicationContext, TermuxResultReceiver::class.java)
                    putExtra(TermuxResultReceiver.EXTRA_EXECUTION_ID, id)
                }
                val pendingFlags = PendingIntent.FLAG_ONE_SHOT or
                    (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
                val pendingIntent = PendingIntent.getBroadcast(
                    reactApplicationContext,
                    id.hashCode(),
                    resultIntent,
                    pendingFlags
                )

                val intent = Intent()
                intent.setClassName(TERMUX_PACKAGE, TERMUX_RUN_COMMAND_SERVICE)
                intent.action = "com.termux.RUN_COMMAND"
                intent.putExtra("com.termux.RUN_COMMAND_PATH", TERMUX_BASH)
                intent.putExtra("com.termux.RUN_COMMAND_ARGUMENTS", arrayOf("-c", wrapped))
                intent.putExtra("com.termux.RUN_COMMAND_WORKDIR", effectiveWorkdir)
                intent.putExtra("com.termux.RUN_COMMAND_BACKGROUND", true)
                intent.putExtra("com.termux.RUN_COMMAND_SESSION_ACTION", "0")
                intent.putExtra("com.termux.RUN_COMMAND_PENDING_INTENT", pendingIntent)
                intent.addFlags(Intent.FLAG_INCLUDE_STOPPED_PACKAGES)

                val ctx: Context = reactApplicationContext
                try {
                    emitLifecycle(id, "dispatch", "")  // workdir not shown in console; JS paints "$ cmd"
                    ctx.startService(intent)
                } catch (se: SecurityException) {
                    TermuxResultStore.cancel(id)
                    promise.reject(
                        "TERMUX_RUN_COMMAND_FAILED",
                        "SecurityException: нет разрешения RUN_COMMAND или в Termux не включён allow-external-apps=true. Откройте Termux, перейдите в ~/.termux/termux.properties и добавьте строку: allow-external-apps=true. Затем выполните: termux-reload-settings. " + se.message
                    )
                    return@Thread
                } catch (ise: IllegalStateException) {
                    TermuxResultStore.cancel(id)
                    promise.reject(
                        "TERMUX_RUN_COMMAND_FAILED",
                        "IllegalStateException: не удалось запустить RunCommandService. 1) Откройте Termux один раз. 2) Установите: apt update && apt install termux-api. 3) В ~/.termux/termux.properties добавьте: allow-external-apps=true. 4) Выполните: termux-reload-settings. " + ise.message
                    )
                    return@Thread
                } catch (e: Exception) {
                    TermuxResultStore.cancel(id)
                    promise.reject(
                        "TERMUX_RUN_COMMAND_FAILED",
                        "Не удалось запустить службу Termux RUN_COMMAND: " + (e.message ?: e.toString()) + ". Убедитесь, что Termux установлен и разрешение allow-external-apps=true включено."
                    )
                    return@Thread
                }

                emitLifecycle(id, "started", "timeoutMs=" + timeoutMs.toLong())
                val waitMs = timeoutMs.toLong() + 15_000L
                val startedAt = System.currentTimeMillis()
                var lastHeartbeat = 0L
                var result: TermuxCommandCallback? = null
                while (System.currentTimeMillis() - startedAt < waitMs) {
                    result = TermuxResultStore.await(id, 5_000L)
                    if (result != null) break
                    val now = System.currentTimeMillis()
                    if (now - lastHeartbeat >= 5_000L) {
                        lastHeartbeat = now
                        emitHeartbeat(id, (now - startedAt) / 1000L, 0L)
                    }
                }

                if (result == null) {
                    TermuxResultStore.cancel(id)
                    emitLifecycle(id, "timeout", "callback deadline exceeded")
                    val map = Arguments.createMap()
                    map.putString("commandId", id)
                    map.putString("stdout", "")
                    map.putString("stderr", "TERMUX_RESULT_CALLBACK_TIMEOUT")
                    map.putInt("exitCode", -1)
                    map.putBoolean("timedOut", true)
                    promise.resolve(map)
                    return@Thread
                }

                val timedOut = result.exitCode == 124
                val map = Arguments.createMap()
                map.putString("commandId", result.commandId)
                map.putString("stdout", result.stdout)
                map.putString("stderr", result.stderr)
                map.putInt("exitCode", if (timedOut) -1 else result.exitCode)
                map.putBoolean("timedOut", timedOut)
                emitLifecycle(id, if (timedOut) "timeout" else "finished", "exit=" + if (timedOut) -1 else result.exitCode)
                promise.resolve(map)
            } catch (e: Exception) {
                TermuxResultStore.cancel(id)
                emitLifecycle(id, "exception", e.message ?: e.toString())
                promise.reject("TERMUX_RUN_COMMAND_FAILED", "Исключение при выполнении команды: " + e.message, e)
            }
        }.start()
    }

    private fun shellQuote(value: String): String {
        return "'" + value.replace("'", "'\\\\''") + "'"
    }

}
`;
}

function packageKotlin(pkg) {
  return `package ${pkg}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class TermuxBridgePackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(TermuxBridgeModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;
}

function withTermuxBridgeFiles(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const pkg = config.android?.package || "com.sakana.aibuilder";
      const pkgPath = pkg.replace(/\./g, "/");
      const dir = path.join(
        config.modRequest.platformProjectRoot,
        "app/src/main/java",
        pkgPath
      );
      fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(path.join(dir, "TermuxBridgeModule.kt"), moduleKotlin(pkg), "utf8");
      fs.writeFileSync(path.join(dir, "TermuxBridgePackage.kt"), packageKotlin(pkg), "utf8");

      const resXml = path.join(config.modRequest.platformProjectRoot, "app/src/main/res/xml");
      fs.mkdirSync(resXml, { recursive: true });
      fs.writeFileSync(
        path.join(resXml, "aib_file_paths.xml"),
        '<?xml version="1.0" encoding="utf-8"?>\n' +
        '<paths xmlns:android="http://schemas.android.com/apk/res/android">\n' +
        '  <cache-path name="apk_cache" path="." />\n' +
        '  <files-path name="apk_files" path="." />\n' +
        '  <external-cache-path name="apk_ext_cache" path="." />\n' +
        '</paths>\n',
        "utf8"
      );

      return config;
    },
  ]);
}

function withTermuxBridgeManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Разрешение на выполнение команд в Termux — отдельное "опасное"
    // разрешение, которое Termux:API проверяет у вызывающего приложения.
    if (!Array.isArray(manifest["uses-permission"])) manifest["uses-permission"] = [];
    const permNames = manifest["uses-permission"].map((p) => p?.$?.["android:name"]);
    const addPermission = (name) => {
      if (!permNames.includes(name)) {
        manifest["uses-permission"].push({ $: { "android:name": name } });
        permNames.push(name);
      }
    };
    addPermission("com.termux.permission.RUN_COMMAND");
    // Android 8+: the system APK installer requires the user to explicitly
    // allow this app to install unknown applications. We only request the
    // capability here; the actual permission is enabled in system settings
    // immediately before an APK installation.
    addPermission("android.permission.REQUEST_INSTALL_PACKAGES");

    // Android 11+ package visibility. ВАЖНО: только ДОПОЛНЯЕМ queries,
    // не затираем блоки expo-speech-recognition и других плагинов.
    if (!manifest.queries) manifest.queries = [{}];
    const queries = manifest.queries[0];
    if (!Array.isArray(queries.package)) queries.package = [];
    const needPackages = [
      "com.termux",
      "com.termux.boot",
      "moe.shizuku.privileged.api",
      // Speech / микрофон в чате (иначе isRecognitionAvailable=false на Android 11+)
      "com.google.android.googlequicksearchbox",
      "com.google.android.as",
      "com.google.android.tts",
      "com.samsung.android.bixby.agent",
    ];
    for (const name of needPackages) {
      const has = queries.package.some((p) => p?.$?.["android:name"] === name);
      if (!has) queries.package.push({ $: { "android:name": name } });
    }
    if (!Array.isArray(queries.intent)) queries.intent = [];
    const hasApkView = queries.intent.some(
      (i) =>
        Array.isArray(i.action) &&
        i.action.some((a) => a?.$?.["android:name"] === "android.intent.action.VIEW") &&
        Array.isArray(i.data) &&
        i.data.some((d) => d?.$?.["android:mimeType"] === "application/vnd.android.package-archive")
    );
    if (!hasApkView) {
      queries.intent.push({
        action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
        data: [{ $: { "android:mimeType": "application/vnd.android.package-archive" } }],
      });
    }
    // RecognitionService — системное STT (Google / on-device)
    const hasSpeechIntent = queries.intent.some(
      (i) =>
        Array.isArray(i.action) &&
        i.action.some((a) => a?.$?.["android:name"] === "android.speech.RecognitionService")
    );
    if (!hasSpeechIntent) {
      queries.intent.push({
        action: [{ $: { "android:name": "android.speech.RecognitionService" } }],
      });
    }

    // The application node is also used for the private result receiver and
    // FileProvider below. Initialize it BEFORE either access; keeping this
    // declaration above those blocks avoids a JavaScript TDZ failure during
    // Expo prebuild, which could otherwise leave the generated native bridge
    // out of the APK or abort config evaluation.
    if (!Array.isArray(manifest.application)) manifest.application = [{}];
    const application = manifest.application[0];

    // Termux >= 0.109 returns RUN_COMMAND results through PendingIntent.
    // Keep the receiver private to this app; no external broadcast surface.
    if (!Array.isArray(application.receiver)) application.receiver = [];
    const receiverName = `${config.android?.package || "com.sakana.aibuilder"}.TermuxResultReceiver`;
    const hasReceiver = application.receiver.some((r) => r?.$?.["android:name"] === receiverName || r?.$?.["android:name"] === ".TermuxResultReceiver");
    if (!hasReceiver) {
      application.receiver.push({
        $: {
          "android:name": ".TermuxResultReceiver",
          "android:exported": "false"
        }
      });
    }

    // Secure APK installation through Android's package installer. The APK
    // stays in the app cache and is exposed through FileProvider on Android 7+.
    if (!Array.isArray(application.provider)) application.provider = [];
    const authority = `${config.android?.package || "com.sakana.aibuilder"}.fileprovider`;
    const hasProvider = application.provider.some((p) => p?.$?.["android:authorities"] === authority);
    if (!hasProvider) {
      application.provider.push({
        $: {
          "android:name": "androidx.core.content.FileProvider",
          "android:authorities": authority,
          "android:exported": "false",
          "android:grantUriPermissions": "true"
        },
        "meta-data": [{
          $: {
            "android:name": "android.support.FILE_PROVIDER_PATHS",
            "android:resource": "@xml/aib_file_paths"
          }
        }]
      });
    }

    return config;
  });
}

function withTermuxBridgeMainApplication(config) {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;
    if (
      contents.includes("TermuxBridgePackage()") ||
      contents.includes("new TermuxBridgePackage()") ||
      contents.includes("add(TermuxBridgePackage())")
    ) {
      return config;
    }

    const isKotlin = config.modResults.language === "kt";
    let matched = false;

    if (isKotlin) {
      // Expo SDK 54 / RN 0.81 шаблон использует:
      //   PackageList(this).packages.apply {
      //     // add(MyReactNativePackage())
      //   }
      // Старые шаблоны — val packages = PackageList(...).packages
      // Пробуем все известные варианты.
      if (
        contents.includes("PackageList(this).packages.apply {") ||
        contents.includes("PackageList(this).packages.apply{")
      ) {
        // Вставляем add() сразу после открывающей скобки apply {
        contents = contents.replace(
          /PackageList\(this\)\.packages\.apply\s*\{/,
          "PackageList(this).packages.apply {\n              add(TermuxBridgePackage())"
        );
        matched = true;
      } else {
        const ktPatterns = [
          "val packages = PackageList(this).packages",
          "val packages = PackageList(this).packages.toMutableList()",
          "return PackageList(this).packages",
        ];
        for (const pattern of ktPatterns) {
          if (contents.includes(pattern)) {
            if (pattern.startsWith("return ")) {
              contents = contents.replace(
                pattern,
                "val packages = " +
                  pattern.slice("return ".length) +
                  "\n            packages.add(TermuxBridgePackage())\n            return packages"
              );
            } else {
              contents = contents.replace(
                pattern,
                pattern + "\n            packages.add(TermuxBridgePackage())"
              );
            }
            matched = true;
            break;
          }
        }
      }
    } else {
      const javaPatterns = [
        "List<ReactPackage> packages = new PackageList(this).getPackages();",
      ];
      for (const pattern of javaPatterns) {
        if (contents.includes(pattern)) {
          contents = contents.replace(
            pattern,
            pattern + "\n      packages.add(new TermuxBridgePackage());"
          );
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      // Намеренно валим сборку с понятной ошибкой вместо того, чтобы молча
      // собрать APK без зарегистрированного нативного модуля — именно так
      // раньше терялась ошибка "нативный модуль недоступен" в рантайме,
      // хотя сама сборка проходила без единой ошибки.
      throw new Error(
        "[withTermuxBridge] Не удалось найти в " +
          (isKotlin ? "MainApplication.kt" : "MainApplication.java") +
          " ожидаемое место для регистрации TermuxBridgePackage. " +
          "Содержимое файла (пришлите этот фрагмент лога, чтобы поправить плагин под вашу версию шаблона):\n" +
          contents
      );
    }

    config.modResults.contents = contents;
    return config;
  });
}

function withTermuxBridge(config) {
  config = withTermuxBridgeFiles(config);
  config = withTermuxBridgeManifest(config);
  config = withTermuxBridgeMainApplication(config);
  return config;
}

module.exports = withTermuxBridge;
