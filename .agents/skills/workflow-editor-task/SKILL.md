---
name: workflow-editor-task
description: Plan and deliver a scoped feature in the Production Workflow Editor repository. Use when starting a task, deciding what to test, creating its branch, or preparing integration into develop.
---

# Workflow editor task workflow

Use this skill only for work in the Production Workflow Editor repository.

## Before implementation

- Read the relevant code and repository instructions; check the current branch and working tree first.
- Restate the requested outcome, its acceptance behavior, open assumptions, and a short test plan before editing. Keep the plan understandable to the user, who is learning both the client and server.
- Keep the task within the brief: one editor with a selector for the two supplied workflows; do not add general workflow management, authentication, deployment, or resource scheduling.
- Create a task branch from the latest `develop` using the repository's `codex/` prefix. Do not work directly on `develop` or `main`.

## Test-first implementation

- Derive tests from the product behavior and invariants, not from the current implementation's structure.
- For pure workflow logic, write the tests before implementing the rule. Keep tests in dedicated `tests/` directories, separate from production files.
- Implement the smallest coherent vertical slice. Keep domain rules in `shared`, UI and graph interaction in `client`, and HTTP/persistence concerns in `server`.
- Run the targeted tests while developing, then the relevant full checks before proposing integration. Do not claim a check passed unless it was run and its result was observed.

## Integration

- Summarize changed behavior, design choices, tests run, and any remaining limitations in plain language.
- Open a pull request from the task branch to `develop`; do not merge it without the user's direction.
- After the feature is integrated into `develop`, run the full test suite again. Keep `main` stable and update it only through a reviewed PR from `develop`, with checks rerun on the integrated result.
- If the user asks to review a PR rather than implement a task, review it without changing branch or merging.
