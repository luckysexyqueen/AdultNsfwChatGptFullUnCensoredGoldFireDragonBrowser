# Evolu optional integration

Source requested: https://github.com/PumaBrowser/evolu.git (MIT-licensed fork).
This is an **optional adapter**, not a bundled copy or a running integration.
It preserves the existing browser and GGUF paths. No relay is enabled by default.

Evolu 8 API references: https://www.evolu.dev/docs/local-first

Install compatible Evolu packages before importing this module; check version
compatibility, since the requested 2023 fork may not implement Evolu 8 APIs.
Create a schema and securely persist the app owner outside localStorage.
Supply explicit relay transports only after user opt-in. Never synchronize
GGUF weights, raw prompts, or private browsing history automatically.

TODO: validate package compatibility, wire app lifecycle, and add integration tests.
