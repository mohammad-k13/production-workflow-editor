---
name: workflow-editor-frontend
description: Implement or review the React and React Flow workflow editor UI in this repository. Use for graph interactions, editor state, timing display, save feedback, and responsive behavior.
---

# Workflow editor frontend

Use this skill only for the React client in this repository.

## State and boundaries

- Keep the canonical editable workflow in client state; derive React Flow nodes and edges through a focused adapter. Avoid maintaining unrelated copies of names, durations, connections, and positions that can drift.
- Keep calculations and business validation in `shared`. The UI may call them for immediate feedback but must not reimplement their rules.
- Keep API calls behind a small client API module and keep visual components focused (for example: editor shell, graph canvas, step node, summary, and step details). Avoid a large all-in-one component and avoid abstractions that do not support a real need.
- Use React Flow for graph rendering, pan/zoom, and pointer interactions; translate its events into explicit workflow state updates.

## Required editor behavior

- Support adding, editing, deleting, and moving steps, and creating/removing directed prerequisite connections.
- Show each step's earliest start and finish, identify steps with no prerequisites, show total workflow duration, and highlight one valid critical path.
- Keep timing and critical-path display synchronized with current edits. When the graph is invalid, explain the error and avoid showing outdated calculations as current.
- Make save state visible (saving, saved, unsaved/error) and ensure a late response from an older save cannot make newer edits appear saved.
- Keep UI copy in English. Make core actions keyboard reachable and provide accessible labels and validation feedback.
- Preserve responsive interaction with the supplied fixture of about 100 steps and 200 connections; avoid recalculating unrelated presentation state or recreating the full graph needlessly.
- Provide a selector for the two supplied workflows; do not build a separate multi-workflow management screen.

## Verification

- Prefer shared pure-logic tests for calculations and validation. Add UI tests only when they give meaningful coverage of user-visible behavior.
- When changing graph interactions, manually verify the affected interaction and its resulting workflow state; describe checks actually performed.
