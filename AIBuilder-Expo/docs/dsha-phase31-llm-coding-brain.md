# DSHA Phase 31 — LLM Coding Brain

Phase 31 connects the bounded Phase 30 coding agent to the already configured OpenAI-compatible provider.

## Flow

`goal → LLM context → structured JSON edits → Phase 30 validation → workspace → install/build/test → repair`

The model never receives a direct shell tool and never writes files directly. It only returns complete-file edits. Phase 30 remains the enforcement boundary for path traversal, file size, edit count, total edit size and iteration limits.

## Provider

The brain uses the existing `customProviderEngine` configuration. API keys are not stored by Phase 31 and are not included in prompts, workspace files, audit output or model context. If no provider is configured, the deterministic Phase 30 planner remains the fallback.

## Model output contract

```json
{"summary":"...","edits":[{"path":"relative/path","content":"complete file content"}]}
```

Markdown fences are tolerated for compatibility, but the model is instructed to return JSON only.
