---
name: workflow-editor-validation
description: Implement or review validation for Production Workflow Editor workflow data and graph rules. Use when changing shared workflow validation, cycle handling, or validation feedback contracts.
---

# Workflow validation

Use this skill only for validation behavior in this repository.

## Source of truth

- Keep workflow rules in `shared`; do not implement a second rule set in React or Express.
- Treat values received from JSON or HTTP as `unknown` until runtime validation succeeds. TypeScript types and casts do not validate external data.
- Have the client use shared validation for immediate feedback and the server call the same shared validation before every save.
- Keep error results deterministic and useful to both UI and API: identify the affected step or connection when possible, and separate a stable error code/path from user-facing wording.

## Current confirmed rules

- A step name cannot be empty.
- Estimated duration must be a positive number of minutes.
- Directed connections encode prerequisites.
- A workflow containing a cycle is invalid and cannot be saved.
- Scheduling calculations are valid only for a valid acyclic graph; never leave stale timing or critical-path results presented as current after invalid edits.

Do not silently add unconfirmed constraints such as unique names, integer-only duration, a maximum duration, self-edge policy, or duplicate-edge policy. If one is needed, surface it as a product decision or clearly recorded assumption before enforcing it.

## Tests

- Keep tests in a dedicated shared test directory, separate from production modules.
- Derive cases from the brief and domain semantics. Cover valid minimal data, missing/empty names, non-positive or non-finite durations, malformed shapes, missing connection endpoints, cycle detection, and disconnected or multi-start graphs as those rules are implemented.
- Assert observable validation results, not private helper call sequences.
- Ensure invalid data is rejected server-side even when it bypasses the client.
- Do not duplicate the same validation conditions in frontend forms; forms may improve input ergonomics but shared validation remains authoritative.
