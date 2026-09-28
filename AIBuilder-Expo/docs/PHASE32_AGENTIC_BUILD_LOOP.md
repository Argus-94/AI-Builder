# Phase 32 — Agentic Build Loop

Phase 32 connects the LLM Coding Brain and bounded Coding Agent to the existing Android build/device QA loop.

Flow: coding plan -> bounded file edits -> install/build/test -> APK -> device automation/Vision -> bounded repair -> rebuild/retest.

Security boundaries remain enforced by `AICodingAgent`, `ProotContainerManager`, and the existing device automation policy. Device repair is routed back through the Coding Agent rather than granting the LLM arbitrary shell access.

Limits: coding iterations <= 3, device build attempts <= 4, device actions <= 10. Device repair uses one bounded coding iteration per recovery attempt.
