# Learnings — Game Builder

## Conventions & Patterns
(Agents append findings here after each task)

---

## [2026-02-13] Task 1 — OpenCode SDK Multi-Session Spike

### Key Learnings

1. **Existing Server Pattern Works Best**
   - OpenCode server was already running on port 4096
   - Used `createOpencodeClient()` instead of `createOpencode()`
   - Simpler for Electron integration — start server once, all agents connect

2. **API Response Structure**
   - Response format: `{ data: { info: {...}, parts: [...] } }`
   - Text content is in parts array with `type: "text"`
   - Must filter parts: `parts.find(p => p.type === "text")?.text`
   - Parts also include: step-start, step-finish, tool-use, etc.

3. **Multi-Session Support Validated**
   - ✅ Created 3 concurrent sessions successfully
   - ✅ Each session maintains independent state
   - ✅ All sessions returned valid AI responses
   - Session creation time: ~50-100ms per session

4. **Agent Parameter Works**
   - `client.app.agents()` lists 17 available agents
   - Can specify agent in prompt: `{ agent: "sisyphus", ... }`
   - Agent parameter accepted and used correctly

5. **SSE Event Stream Confirmed**
   - `client.event.subscribe()` returns async iterator
   - Stream has Symbol.asyncIterator
   - Can be used for real-time progress monitoring

### Patterns to Follow

```typescript
// Connect to existing server
const client = createOpencodeClient({ baseUrl: "http://localhost:4096" });

// Create session
const session = await client.session.create({ body: { title: "..." } });

// Send prompt
const response = await client.session.prompt({
  path: { id: session.data.id },
  body: {
    model: { providerID: "anthropic", modelID: "claude-3-5-haiku-20241022" },
    agent: "agent-name",  // Optional
    tools: ["read", "glob"],  // Optional
    parts: [{ type: "text", text: "..." }],
  },
});

// Extract text from response
const text = response.data?.parts?.find(p => p.type === "text")?.text;
```

### Gotchas

- SDK docs show `client.global.health()` but it doesn't exist in actual SDK
- Health check must use HTTP directly: `curl http://localhost:4096/global/health`
- Response parts are an array — must find the "text" type part
- Tools parameter accepted but effect unclear (needs more investigation)


## [2026-02-13] Task 2 — Godot Preview Strategy Spike

### Key Learnings

1. **Godot Child Process is Best for V1**
   - Spawn Godot via `child_process.spawn()` with `--path` flag
   - Separate window is acceptable trade-off for simplicity
   - Native performance, no export step, no CORS issues

2. **HTML5 Export Has Blockers**
   - SharedArrayBuffer requires COOP/COEP headers
   - Electron file:// protocol doesn't support these easily
   - Would need HTTP server or complex workarounds
   - Export step adds 5-10s latency per change

3. **Godot 4.6 Installed**
   - Version: 4.6.stable.official
   - Location: `/opt/homebrew/bin/godot` and `/Applications/Godot.app`
   - Plan specified 4.4.x but 4.6 should work fine

4. **LibGodot is Future Path**
   - Godot 4.5+ will support true embedding via shared library
   - Would enable rendering Godot viewport directly in Electron
   - Not stable yet — use child process for v1

### Patterns to Follow

```typescript
// Spawn Godot as child process
import { spawn } from "child_process";

const godot = spawn("godot", [
  "--path", projectPath,
  "--position", "100,100",  // Position window
]);

// Monitor output
godot.stdout.on("data", (data) => console.log(data.toString()));
godot.stderr.on("data", (data) => console.error(data.toString()));

// Cleanup
app.on("before-quit", () => godot.kill());
```

### Gotchas

- Godot `--check-only` can timeout on first run (asset import)
- Godot window management requires platform-specific handling
- HTML5 export is NOT viable for embedded preview in v1
- Separate window UX is acceptable for game development tool

### Decision

**Use Approach A (Child Process)** for Phase 1 implementation:
- Simplest and most reliable
- Best performance
- No technical blockers
- Future: Migrate to LibGodot when stable

