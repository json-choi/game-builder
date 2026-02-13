# Decisions — Game Builder

## Architectural Choices
(Agents append decisions here after each task)

---

## [2026-02-13] Task 7 — OpenCode SDK Integration

### Decision: Connect-First Server Pattern
- **Choice**: Check for existing server before spawning new one
- **Rationale**: OpenCode server is often already running (e.g., from oh-my-opencode). Spawning a second instance would fail on port conflict.
- **Pattern**: `startServer()` → health check → if healthy, use existing; else spawn new process

### Decision: Direct Source Exports (No Build Step)
- **Choice**: Agents package exports from `src/` directly, not `dist/`
- **Rationale**: No build step configured yet for agents. electron-vite handles TypeScript resolution for workspace packages.
- **Trade-off**: Works for dev, will need proper build for production packaging

### Decision: IPC Bridge Architecture
- **Choice**: Thin IPC layer in preload, all logic in main process
- **Rationale**: Keeps renderer sandboxed, all SDK calls happen in main process with full Node.js access
- **Pattern**: renderer → preload (ipcRenderer.invoke) → main (ipcMain.handle) → SDK

