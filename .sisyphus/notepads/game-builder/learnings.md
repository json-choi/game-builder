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


## [2026-02-13] Task 3 — AI→Godot Pipeline Spike

### Key Findings

1. **AI Can Generate Godot Files (with caveats)**
   - Success rate: 50% (below 80% target)
   - Main issue: Prompt engineering
   - AI often returns explanatory text instead of raw code

2. **Prompt Engineering is Critical**
   - Need explicit directives: "Output ONLY raw code, NO explanation"
   - System prompts should enforce code-only output
   - Examples in prompts improve success rate

3. **Code Extraction Needs Robustness**
   - Current: Look for ```code blocks```
   - Problem: AI doesn't always use code blocks
   - Solution: Multi-strategy extraction (code blocks → full response → strip prefixes)

4. **File Complexity Affects Success**
   - GDScript (.gd): High success (Python-like syntax)
   - Simple .tscn: Medium success (text format)
   - Complex .tscn: Low success (many references, UIDs)
   - project.godot: Medium success (INI-like)

5. **Validation is Essential**
   - `godot --headless --check-only` validates scripts
   - Problem: Can timeout on first run (asset import)
   - Solution: Separate validation step with timeout handling

### Patterns to Follow

```typescript
// Strict prompt for code generation
const systemPrompt = `You are a Godot code generator.
Output ONLY raw file content with NO explanation.
Start your response with the first line of the file.`;

// Error→correction loop
async function generateWithRetry(prompt: string, maxAttempts = 3) {
  for (let i = 0; i < maxAttempts; i++) {
    const content = await generate(prompt);
    const validation = await validateGodot(content);
    if (validation.success) return content;
    prompt += `\n\nError: ${validation.error}\nFix and try again.`;
  }
}

// Robust code extraction
function extractCode(response: string): string {
  // Try code block first
  const codeBlock = response.match(/```(?:gdscript|ini|tscn)?\n([\s\S]*?)\n```/);
  if (codeBlock) return codeBlock[1];
  
  // Fall back to full response, strip common prefixes
  return response
    .replace(/^(Here's|Here is|The code is).*?:\s*/i, '')
    .trim();
}
```

### Recommendations for Phase 1

1. **Specialized Agent System Prompts**
   - GDScript Coder: Focus on .gd files only
   - Scene Builder: Focus on .tscn files only
   - Include Godot API reference snippets in prompts

2. **Error→Correction Loop**
   - Validate after generation
   - Feed Godot errors back to AI
   - Retry up to 3 times

3. **Incremental Generation**
   - Generate project.godot first
   - Then main scene structure
   - Then scripts for each scene
   - Validate after each step

4. **Tool Restrictions**
   - GDScript Coder: Can only write .gd files
   - Scene Builder: Can only write .tscn files
   - Prevents boundary violations

### Gotchas

- AI returns explanatory text instead of code (50% of time)
- Code blocks not always used by AI
- Godot validation can timeout on first run
- Complex .tscn files have low success rate
- Need to provide Godot API context in prompts

### Decision

**AI→Godot pipeline is VIABLE but needs careful implementation**:
- 50% success rate → 80%+ achievable with better prompts
- Error correction loop is essential
- Agent specialization will improve quality
- Start with simple files, build complexity gradually

**Proceed to Phase 1** with focus on prompt engineering and validation.


## Task 4: Monorepo Setup (Bun Workspace)

### Key Learnings

1. **Bun Workspace Configuration**
   - Bun workspaces use `"workspaces": ["packages/*"]` in root package.json
   - Workspace dependencies use `"workspace:*"` syntax
   - Each package needs its own package.json with name, version, type: "module"

2. **Workspace Dependency Resolution**
   - Avoid circular dependencies in workspace references
   - Root devDependencies are shared across all packages
   - Packages reference each other via workspace protocol

3. **TypeScript Path Aliases**
   - Root tsconfig.json defines paths for all packages
   - Paths use `@game-builder/*` convention for clarity
   - Each package can have its own tsconfig.json extending root

4. **Build Script Pattern**
   - Use `bun run --filter '*' build` to run build in all packages
   - Each package defines its own build script
   - Packages with no build script can use echo placeholder

5. **Monorepo Structure**
   - packages/ contains all workspace packages
   - templates/ contains project scaffolds (separate from packages)
   - spike/ kept for reference (not part of workspace)
   - Each package has src/ directory for TypeScript sources

### Successful Setup
- 5 packages created: electron, backend, shared, agents, godot-manager
- Root configuration: package.json, tsconfig.json, .eslintrc.json, .gitignore
- All packages build successfully with exit code 0
- Bun lockfile created and workspace recognized

### Next Steps
- Implement actual build scripts for each package
- Add dependencies as needed (React, Elysia, etc.)
- Create shared types in @game-builder/shared

## Task 5: Electron + React Shell

### Key Learnings

1. **Electron-Vite Setup**
   - electron-vite provides seamless Vite integration for Electron
   - Separate build targets: main, preload, renderer
   - Hot reload works out of the box in dev mode

2. **Split Panel with Allotment**
   - Allotment library provides resizable panels
   - Requires `import 'allotment/dist/style.css'`
   - Pane sizing: minSize, preferredSize props

3. **CSS Height Cascade Critical**
   - Must set height: 100% on: html, body, #root, .app, .split-panel
   - Missing .app height caused split-panel to be hidden
   - Allotment requires parent container to have explicit height

4. **Electron Security Configuration**
   - contextIsolation: true (required)
   - sandbox: true (recommended)
   - Preload script for secure IPC bridge

5. **Playwright Testing for Electron**
   - Use @playwright/test with _electron import
   - Launch with args pointing to built main.js
   - Can verify UI elements and take screenshots

### Successful Setup
- Electron app launches with split panel
- Left panel: Preview area + tab bar
- Right panel: Chat area placeholder
- Resizable panels working
- Playwright test passes with screenshot evidence

### Gotchas
- .app container needs explicit height: 100% for Allotment to work
- Must rebuild before running tests (out/ directory)
- Playwright test requires built files, not dev server

