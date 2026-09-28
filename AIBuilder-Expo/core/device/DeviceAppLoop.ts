import type { DeviceAgentBridge, DeviceCommandResult } from "./DeviceAgentBridge";

export type DeviceAppLoopOptions = {
  apkPath: string;
  packageName?: string;
  screenshot?: boolean;
  screenshotPath?: string;
  settleMs?: number;
};

export type DeviceAppLoopResult = {
  installed: DeviceCommandResult;
  launched: DeviceCommandResult;
  screenshotBase64?: string;
  screenshotPath?: string;
  logcat?: DeviceCommandResult;
  packageName: string;
};

/** Deterministic build→install→launch→capture primitive for the Agent. */
export async function runDeviceAppLoop(bridge: DeviceAgentBridge, options: DeviceAppLoopOptions): Promise<DeviceAppLoopResult> {
  if (!(await bridge.isAvailable())) throw new Error("DEVICE_BRIDGE_UNAVAILABLE");
  const packageName = options.packageName?.trim() || await detectPackageName(bridge, options.apkPath);
  if (!packageName) throw new Error("APK_PACKAGE_NAME_NOT_DETECTED");
  const installed = await bridge.install(options.apkPath);
  if (installed.exitCode !== 0) throw new Error(installed.stderr || "DEVICE_INSTALL_FAILED");
  const launched = await bridge.launch(packageName);
  if (launched.exitCode !== 0) throw new Error(launched.stderr || "DEVICE_LAUNCH_FAILED");
  if (options.settleMs && options.settleMs > 0) await new Promise((r) => setTimeout(r, Math.min(options.settleMs!, 10_000)));
  const result: DeviceAppLoopResult = { installed, launched, packageName };
  if (options.screenshot) {
    result.screenshotBase64 = await bridge.screenshotBase64();
    if (options.screenshotPath) result.screenshotPath = await bridge.screenshot(options.screenshotPath);
  }
  result.logcat = await bridge.logcat(["-d", "-t", "200"]);
  return result;
}


async function detectPackageName(bridge: DeviceAgentBridge, apkPath: string): Promise<string> {
  const result = await bridge.detectPackageName(apkPath);
  if (result.exitCode !== 0) throw new Error(result.stderr || "APK_PACKAGE_NAME_DETECTION_FAILED");
  const text = result.stdout.trim();
  const match = text.match(/package:\s+name='([^']+)'/) || text.match(/^([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)$/m);
  const value = match?.[1] || "";
  if (!/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(value)) throw new Error("APK_PACKAGE_NAME_INVALID");
  return value;
}
