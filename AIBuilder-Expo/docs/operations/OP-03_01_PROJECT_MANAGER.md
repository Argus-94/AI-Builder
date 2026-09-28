# Operation 3.1 — ProjectManager abstraction

Adds a runtime-only `ProjectManager` rooted at `HomeLayout.projects`.

Properties:
- project data belongs to `AIBuilderTermux/projects`;
- creation is independent from Ubuntu/Kali/container state;
- project names are validated against path traversal and unsafe separators;
- filesystem access is injected for portability and testing;
- no Android/Gradle/Expo compilation configuration is modified.
