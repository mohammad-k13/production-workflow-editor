# Production Workflow Editor

```sh
npm install
npm run dev
```

## Workflow behavior

- The workflow selector loads one of the two supplied workflows from the API. Changes are saved automatically after a short pause and the header shows the save state.
- A connection that would create a cycle is rejected immediately with an error on the graph. Steps without connections are allowed; disconnected branches are treated as parallel, so total time is the duration of the longest path. An empty workflow has a total duration of zero.
- The server accepts the latest save for a workflow and cancels older queued saves. The editor checks for updates from other editors; if another user saves while local changes are pending, it pauses autosave and offers to load the latest version or explicitly keep and save the local version.

The Vite development server proxies `/api` to the local Express server on port `3001`.
