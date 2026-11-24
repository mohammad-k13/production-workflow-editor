---
name: workflow-editor-api
description: Design, implement, or review HTTP load/save endpoints for the Production Workflow Editor. Use when changing Express routes, API contracts, or workflow persistence.
---

# Workflow API and persistence

Use this skill only for the local Express backend in this repository.

## Scope and boundaries

- Keep Express request/response handling in the server layer; keep workflow rules in `shared` and storage mechanics behind a small repository boundary.
- Support the two supplied workflow choices with stable identifiers. Do not add generic workflow creation/deletion or account and permission features; those are outside the brief.
- Define a consistent JSON contract for success and errors. Handle malformed JSON, unknown workflow identifiers, invalid payloads, missing storage, and I/O failures without exposing stack traces or filesystem details to the client.
- Treat request bodies as untrusted runtime data. Validate using the shared workflow validator before persistence; do not rely on client checks or TypeScript casts.

## Reliable persistence

- Preserve the last known-good workflow if a save is interrupted. Prefer writing a complete temporary file in the same directory and atomically renaming it into place, with cleanup on failure.
- Consider overlapping saves explicitly: serialize writes per workflow or use a revision/sequence check so an older save cannot replace newer data. Keep UI save status consistent with the accepted revision.
- Keep file paths controlled by server configuration or a fixed workflow registry; never derive arbitrary filesystem paths from unchecked request values.

## Tests

- Keep API and repository tests under dedicated server test directories, separate from production modules.
- Test successful load/save and round trips, server rejection of invalid workflow data, malformed and unexpected requests, unknown workflow keys, storage read/write failures, and overlapping writes where implemented.
- Assert HTTP status, stable response shape, and persisted state. Tests should fail if invalid data is stored or a previous good file is corrupted.
- Keep the health endpoint behavior intact unless the task specifically changes it.
