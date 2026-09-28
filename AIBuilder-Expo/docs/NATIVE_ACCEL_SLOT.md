# aib-native-accel (plan G) — **in-repo MIT module**

## Status (1.6.25+)

| Component | Location | Role |
|-----------|----------|------|
| Config plugin | `plugins/withAibNativeAccel.js` | Injects RN package at prebuild |
| RN module | `AibNativeAccelModule.kt` | `NativeModules.AibNativeAccel` |
| C/JNI sources | `native/aib-native-accel/` | Optional `libaibaccel.so` path-map |
| Loader | `core/runtime/native-accel-loader.ts` | Probe / exec bridge |
| Backend | `NativeAccelBackend` priority 5 | Router prefers when healthy |

## API

```ts
NativeModules.AibNativeAccel.isAvailable()
NativeModules.AibNativeAccel.probe()  // { ok, detail, jni, version }
NativeModules.AibNativeAccel.mapPath(path, from, to)
NativeModules.AibNativeAccel.exec(command)
```

## License

MIT — redistributable, modifiable. **Not** DSHA proroot.

## Build notes

- Plugin does **not** change `gradle.properties` / compileSdk / NDK settings.
- Kotlin path-map works without NDK; `System.loadLibrary("aibaccel")` is optional.
- To link `.so`: enable `externalNativeBuild` on the jni/aibaccel CMakeLists copied at prebuild (optional).
