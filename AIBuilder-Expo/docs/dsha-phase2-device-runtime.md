# DSHA Phase 2 — Device Runtime Integration

This phase turns the DSHA-inspired runtime contracts into an Android device automation path without bundling proprietary `proroot` binaries or bypassing Android security boundaries.

## Device path

```text
AI Builder Agent
  -> RuntimeFacade.deviceTools
  -> DeviceAgentBridge
  -> TermuxAdbDeviceBridge
  -> Termux RUN_COMMAND
  -> adb
  -> USB / Wireless debugging device
```

Supported operations:

- device.status
- device.shell
- device.screenshot
- device.install
- device.launch
- device.logcat
- device.tap
- device.swipe

ADB is deliberately executed through the existing user-authorized Termux bridge. The application does not silently enable debugging, root, Shizuku, or external-app execution.

## Native watchdog

`AibDeviceWatchdogService` is a small Android foreground service for an explicitly started ADB/device session. It uses the `connectedDevice` foreground-service type and is `START_NOT_STICKY`; it is not used as a generic background keep-alive for models or builds.

JS API:

```ts
startDeviceWatchdog()
stopDeviceWatchdog()
```

## Agent integration

`RuntimeFacade.deviceTools` exposes a policy-neutral device tool boundary. Agent policy remains responsible for deciding whether a model/session may invoke device capabilities.

## Security rules

- Shell commands are quoted before being passed to `adb shell`.
- Package names are restricted to Android package-name characters.
- Logcat arguments are allow-listed.
- Coordinates and swipe duration are bounded and finite.
- No proprietary DSHA binaries are bundled.
- No root/Shizuku escalation is performed by the bridge.

## Next stage

The next native layer can add a binary-safe screenshot export from the device into the app sandbox. The current screenshot contract writes to a path visible to Termux, which avoids pretending that a Termux path is an Expo sandbox URI.

## Phase 4: AI device automation loop

`DeviceAutomationAgent` closes the guarded device loop: install -> launch -> screenshot -> vision observation -> validated tap/swipe -> screenshot/logcat -> repeat. The vision host is injected as a function so existing OpenRouter/custom-provider/local multimodal engines can be reused without coupling the runtime layer to a specific model provider.

The model must return JSON with `completed`, `reason`, and an optional `tap` or `swipe` action. Actions are parsed and bounded before reaching `DeviceAgentTools`; maximum iterations are capped at 20. Shell is intentionally not accepted from the vision JSON parser.
