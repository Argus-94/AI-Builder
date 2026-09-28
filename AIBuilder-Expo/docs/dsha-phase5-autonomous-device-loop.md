# DSHA Phase 5 — Autonomous Android Development Loop

AI Builder now has a guarded end-to-end device development loop:

```text
existing project
  -> Gradle assembleDebug + APK/signing verification
  -> policy-gated AgentManager adb capability
  -> ADB install
  -> ADB launch
  -> binary-safe PNG screenshot
  -> existing AI Builder Vision provider
  -> strict JSON UI decision
  -> validated tap/swipe
  -> screenshot + logcat
  -> if failed: existing Termux agent repairs the real project
  -> rebuild
  -> repeat (bounded attempts)
```

## Provider integration

The loop deliberately does not create a second LLM client. It reuses `useLLM().analyzeImage`, so the active provider can be:

- OpenRouter
- Custom/OpenCode
- DeepSeek
- local multimodal model

Screenshot bytes are written to the app cache as base64 for providers that need a file URI and removed immediately after analysis.

## Security boundary

Vision output is parsed as a constrained action protocol. The model cannot directly execute arbitrary shell commands through the UI loop. Device automation is exposed through `AgentManager` under the `adb` capability and the existing `RuntimeFacade` policy path.

Build/repair actions remain separate from device actions:

- deterministic build verification is done by `runAssembleDebug`;
- model-assisted repair is executed by the existing Termux agent;
- device input is executed only by `DeviceAgentTools`/`DeviceAgentBridge`.

## UI

Runtime screen now exposes:

- Android package name
- AI device test goal
- `AI: Build → Install → Vision → Fix`

The loop requires an active project and a connected ADB device.

## Bounds

- maximum build/repair cycles: 6 (UI uses 3)
- maximum device actions per test: 20 (UI uses 8)
- swipe duration: 50–5000 ms
- device coordinates are validated by the ADB bridge
- no root escalation is introduced
- no proprietary `proroot` binary is bundled
