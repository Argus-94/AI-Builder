# OP-03.03 — ProjectMetadata

Introduces the runtime-only `ProjectMetadataStore`.

Metadata is persisted under:

`AIBuilderTermux/.ai-builder/metadata/projects/<project>.json`

Properties:
- uses the canonical `HomeLayout.metadata` root;
- validates project names through `ProjectManager` validation;
- requires `metadata.projectName` to match the project path;
- uses an injected filesystem adapter;
- does not create or manage containers;
- does not modify Android/Gradle/Expo compilation configuration.
