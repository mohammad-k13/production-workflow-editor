# Production Workflow Editor

Edit production steps and their prerequisites, then see when each step can start and finish and what determines the total duration.

## Run locally

The repository pins Node.js 24.21.0 in `.node-version` and `.nvmrc`. The project also supports Node.js `^20.19.0`, `^22.13.0`, and `>=24.0.0`, as declared in `package.json`. Use npm 11. From the project root:

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Vite proxies `/api` to Express on port 3001. To run the two processes in separate terminals, use `npm run dev:client` and `npm run dev:server`. The API watches its source files and restarts on changes. After pulling this version into an already running session, restart both processes once to pick up the new development command.

```sh
npm test
npm run typecheck
npm run lint
```

The default configuration needs no environment file. Optional shell variables are `WORKFLOW_DATA_DIR` for the saved JSON directory, `PORT` for the API port, and `VITE_PORT` for the editor port. Export the same `PORT` in both terminals if you run the processes separately.

## Editor behavior

- Select the example or the larger fixture. Use **Add step**, drag a step to move it, and drag from the prerequisite's output handle to the dependent step's input handle. Select a step or connection and use **Delete**, or use the corresponding on-screen action. **Undo** or **Ctrl+Z** (**Cmd+Z** on macOS) reverses up to five local edits during the current editor session.
- A connection `A → B` means B waits for A. Steps may be isolated, and independent paths can run in parallel. Start and finish are measured from the start of the workflow. Longer times display hours, days, or 30-day months alongside the exact minute values for each step's start and finish. An empty workflow takes zero minutes. The editor highlights one path that determines the total duration.
- The editor rejects a connection that would create a cycle. Invalid names and durations are explained next to the fields. Timing is unavailable and autosave pauses until valid input is restored.
- The editor saves after a short pause and serializes saves from the same tab. Each save uses the version of the last loaded or saved document. If a different editor saved first, the draft stays available and the user can load the latest or explicitly keep and save their draft. This is document-level conflict resolution for clients connected to one server process.
- The bundled fixtures are used on first load. Later changes are saved as separate JSON files under `data/workflows/` by default. Writes replace the previous file only after the new JSON is written completely.

## Code organization

- **Modules and directories.** `shared/` owns workflow data, validation, graph traversal and scheduling. `client/` owns the editor and its HTTP adapter, and `server/` owns the HTTP routes and file persistence.
- **Interfaces and boundaries.** React Flow emits graph events and renders a projection of the workflow. The workflow API module validates endpoint payloads and uses one Axios client with a response interceptor for HTTP and network errors. The server router delegates file operations to a repository that tests can substitute.
- **Readability.** The graph view, step form, workflow selector, edit history and load/save session live in named modules. Tests describe workflow outcomes such as a dependent step waiting for its last prerequisite.
- **Maintainability.** Both sides call the same validator. One workflow document drives graph rendering, calculations, persistence and undo, and repeated graph updates preserve unchanged nodes and edges.
- **Extensibility.** Start new scheduling behavior in the shared model or scheduler and add a focused domain test. Change the client projection for new display needs or replace the repository to introduce a different storage backend.
- **Tools.** React and TypeScript provide the typed UI, and React Flow supplies drag, viewport, and connection interactions. Axios gives the client a shared response interceptor and configurable adapter for tests. Vite runs the local client, Express handles routing and JSON, and Vitest runs the TypeScript domain, client transport, and real HTTP tests without relying on Node's experimental TypeScript loader. A small topological traversal handles scheduling without a graph dependency.

## Performance verification

I opened the supplied 100-step, 200-connection fixture in Chromium on Windows and exercised adding a visible step, editing its duration, dragging it, creating a connection, deleting the step with its connection and restoring both with Undo. The graph and summary updated without a noticeable interaction delay in that session. This was a manual browser check, not a frame-rate measurement.

As a separate check on the scheduling logic, I warmed up the scheduler with 100 runs and measured 1,000 runs of `calculateSchedule` on that same fixture with Node 26.3.0. Median was about 0.11 ms and p95 about 0.31 ms on the development machine. These numbers cover validation and scheduling, without rendering or autosave.

## How I used AI

I used OpenAI Codex as a coding assistant. I gave it the assignment brief and repository context, then asked it to diagnose why the TypeScript tests did not start and migrate the suite to Vitest while preserving the existing test behavior. I reviewed the changes to the test setup and cleanup, updated the README to reflect the chosen runner and supported Node versions, and ran the full test suite and TypeScript checks.
