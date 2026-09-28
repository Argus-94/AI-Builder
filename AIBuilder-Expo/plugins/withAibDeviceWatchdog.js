const { withAndroidManifest, withMainApplication, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function moduleKotlin(pkg) { return `package ${pkg}

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.*

class AibDeviceWatchdogModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "AibDeviceWatchdog"

  @ReactMethod
  fun start(promise: Promise) {
    try {
      val intent = Intent(context, AibDeviceWatchdogService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("AIB_WATCHDOG_START", e.message ?: e.toString(), e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      val success = context.stopService(Intent(context, AibDeviceWatchdogService::class.java))
      promise.resolve(success)
    } catch (e: Exception) {
      promise.reject("AIB_WATCHDOG_STOP", e.message ?: e.toString(), e)
    }
  }
}
` }

function packageKotlin(pkg) { return `package ${pkg}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager

class AibDeviceWatchdogPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = 
    listOf(AibDeviceWatchdogModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = 
    emptyList()
}
` }

function serviceKotlin(pkg) { return `package ${pkg}

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/** Lightweight native watchdog for an active device/ADB session. */
class AibDeviceWatchdogService : Service() {
  override fun onCreate() {
    super.onCreate()
    val channelId = "aib-device-watchdog"
    if (Build.VERSION.SDK_INT >= 26) {
      getSystemService(NotificationManager::class.java)?.createNotificationChannel(
        NotificationChannel(channelId, "AI Builder device session", NotificationManager.IMPORTANCE_LOW)
      )
    }
    val notification: Notification = NotificationCompat.Builder(this, channelId)
      .setSmallIcon(android.R.drawable.stat_sys_warning)
      .setContentTitle("AI Builder")
      .setContentText("Device session is active")
      .setOngoing(true)
      .build()
    try {
      startForeground(7301, notification)
    } catch (e: Exception) {
      // Fallback for older devices
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
` }

module.exports = function withAibDeviceWatchdog(config) {
  config = withDangerousMod(config, ['android', async (config) => {
    try {
      const pkg = config.android?.package || 'com.sakana.aibuilder';
      const dir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/java', pkg.replace(/\./g, '/'));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'AibDeviceWatchdogModule.kt'), moduleKotlin(pkg), 'utf8');
      fs.writeFileSync(path.join(dir, 'AibDeviceWatchdogPackage.kt'), packageKotlin(pkg), 'utf8');
      fs.writeFileSync(path.join(dir, 'AibDeviceWatchdogService.kt'), serviceKotlin(pkg), 'utf8');
    } catch (e) {
      console.warn(`[withAibDeviceWatchdog] Warning creating files: ${e.message}`);
    }
    return config;
  }]);

  config = withAndroidManifest(config, (config) => {
    try {
      const app = config.modResults.manifest.application?.[0];
      if (!app) {
        console.warn('[withAibDeviceWatchdog] application not found in manifest');
        return config;
      }
      app.service = app.service || [];
      if (!app.service.some((s) => s?.$?.['android:name'] === '.AibDeviceWatchdogService')) {
        app.service.push({
          $: {
            'android:name': '.AibDeviceWatchdogService',
            'android:exported': 'false',
            'android:foregroundServiceType': 'connectedDevice'
          }
        });
      }
    } catch (e) {
      console.warn(`[withAibDeviceWatchdog] Warning updating manifest: ${e.message}`);
    }
    return config;
  });

  config = withMainApplication(config, (config) => {
    try {
      let c = config.modResults.contents;
      if (c.includes('AibDeviceWatchdogPackage()') || c.includes('new AibDeviceWatchdogPackage()')) {
        return config;
      }
      const isKotlin = config.modResults.language === 'kt';
      if (isKotlin) {
        const marker = 'PackageList(this).packages.apply {';
        if (c.includes(marker)) {
          c = c.replace(marker, marker + '\n              add(AibDeviceWatchdogPackage())');
        } else if (c.includes('val packages = PackageList(this).packages')) {
          c = c.replace('val packages = PackageList(this).packages', 'val packages = PackageList(this).packages\n            packages.add(AibDeviceWatchdogPackage())');
        } else {
          console.warn('[withAibDeviceWatchdog] Kotlin MainApplication package list not found');
          return config;
        }
      } else {
        const marker = 'List<ReactPackage> packages = new PackageList(this).getPackages();';
        if (!c.includes(marker)) {
          console.warn('[withAibDeviceWatchdog] Java package list not found');
          return config;
        }
        c = c.replace(marker, marker + '\n      packages.add(new AibDeviceWatchdogPackage());');
      }
      config.modResults.contents = c;
    } catch (e) {
      console.warn(`[withAibDeviceWatchdog] Warning updating MainApplication: ${e.message}`);
    }
    return config;
  });

  return config;
};
