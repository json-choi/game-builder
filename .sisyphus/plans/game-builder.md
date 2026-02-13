# Game Builder — AI-Powered Godot Game Creation Tool

## TL;DR

> **Quick Summary**: Build an Electron desktop app where users create Godot games via AI chatbot. OpenCode SDK runs locally with user's API keys, powering a multi-agent system (inspired by oh-my-opencode) that writes GDScript/.tscn files, validates them, and runs them in Godot. Backend (Elysia/Bun) handles auth and user data.
> 
> **Deliverables**:
> - Electron desktop app (React) with split-panel UI (game preview + chat)
> - Multi-agent AI system for game generation (Orchestrator, Game Designer, GDScript Coder, Scene Builder, Asset Generator, Debugger, Reviewer)
> - Godot engine integration (local install, managed by app)
> - PixelLab MCP for asset generation
> - Elysia + Better Auth + Bun + PostgreSQL backend
> - Web landing page with login + deep link to native app
> 
> **Estimated Effort**: XL (6-12 weeks for full vision)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Phase 0 Spike → Phase 1 Skeleton → Phase 2 Single Agent → Phase 3 Multi-Agent → Phase 4 Polish → Phase 5 Backend → Phase 6+ Expansion

---

## Context

### Original Request
사용자 요청: Electron + OpenCode SDK + oh-my-opencode 멀티에이전트 시스템 구조를 활용한 AI 게임빌더. 웹에서 로그인 후 네이티브 앱으로 접근, 우측에 챗봇, 좌측에 게임 프리뷰(탭 지원). Godot 엔진으로 최종빌드(모바일/PC)까지 가능하게.

### Interview Summary
**Key Discussions**:
- Game Engine: Phaser → **Godot** (모바일/PC 최종빌드 용이)
- Backend: **Elysia + Better Auth + Bun + PostgreSQL** (사용자 선택)
- Frontend: **React** in Electron
- Auth: **하이브리드** (웹 로그인 + 네이티브 로그인 둘 다 지원)
- AI: **OpenCode SDK** running locally with user's API keys
- Agents: **풀 구성** (7+ agents)
- Scope: **풀 비전** (not MVP)
- Tests: **없음** (no automated tests)
- Godot Install: **둘 다 지원** (auto-download + detect existing)
- PixelLab: **포함**
- Web: **랜딩 + 로그인만** (게임빌딩은 네이티브 앱 전용)
- Preview: **앱에 내장** (사용자 PC에서 직접 실행)

**Research Findings**:
- OpenCode SDK v1.1.60: HTTP+SSE client-server, `createOpencode()`, `session.prompt()`, 75+ LLM providers
- oh-my-opencode (31K stars): 11 agents, category system, 100+ hooks, background tasks, tool restrictions
- Godot .tscn: Text-based scene format → AI-friendly, GDScript is Python-like → LLMs excel
- LibGodot (4.5): Future native embedding via shared library (not yet stable)
- Better Auth: Official Elysia integration via `.mount(auth.handler)`, PostgreSQL via Drizzle
- Electron deep links: `app.setAsDefaultProtocolClient()` for web→native auth
- gdai-mcp-plugin-godot: MCP server for AI→Godot integration
- Godot HTML5 export: WASM+WebGL2, needs SharedArrayBuffer/COOP/COEP headers

### Metis Review
**Identified Gaps** (addressed):
- 🔴 SharedArrayBuffer/COOP/COEP blocker for Godot iframe preview → **Phase 0 spike required**
- 🔴 Concurrent agent file writes → **sequential execution with turn-taking**
- 🔴 AI generates broken GDScript → **`godot --check-only` validation gate**
- 🟡 macOS Gatekeeper quarantine for auto-downloaded Godot → **detect existing + manual install fallback**
- 🟡 Resource requirements (Electron+OpenCode+Godot = 2-4GB RAM) → **documented system requirements**
- 🟡 OpenCode SDK multi-session reliability → **Phase 0 spike validation**
- 🟡 Cost visibility for multi-agent LLM usage → **usage tracking UI**

---

## Work Objectives

### Core Objective
Build a production-quality Electron desktop application that enables users to create complete Godot games through natural language conversation with AI agents.

### Concrete Deliverables
- `packages/electron/` — Electron + React desktop app with split-panel UI
- `packages/backend/` — Elysia + Bun + Better Auth + PostgreSQL API server
- `packages/shared/` — Shared types, constants, utilities
- `packages/agents/` — Multi-agent system definitions (system prompts, tool configs, orchestration)
- `packages/godot-manager/` — Godot binary management, CLI wrapper, project scaffolding
- `packages/web/` — Landing page + login (Next.js or static)
- `templates/` — Godot project templates/scaffolds for AI to build upon
- `docs/` — System requirements, architecture docs

### Definition of Done
- [ ] User can log in (web deep link or native login)
- [ ] Chat input generates a working 2D Godot game
- [ ] Game preview runs within/alongside the Electron app
- [ ] Multiple specialized agents collaborate on game creation
- [ ] PixelLab generates game sprites/tiles on demand
- [ ] User can run/build the game via Godot CLI
- [ ] Project files persist on local filesystem

### Must Have
- Electron app with React split-panel UI (chat + preview + tabs)
- OpenCode SDK integration (local server, user's API keys)
- Multi-agent system with at least: Orchestrator, Coder, SceneBuilder, Debugger
- Godot binary detection and management
- Godot project scaffold system
- GDScript/Scene validation via `godot --check-only`
- Error feedback loop (Godot errors → agent correction)
- Auth system (Better Auth + Elysia)
- Deep link auth flow (web → native)
- Chat history and project persistence
- PixelLab MCP integration for asset generation

### Must NOT Have (Guardrails)
- ❌ 3D game support in v1 (2D only — 3D is v2+)
- ❌ Team collaboration / real-time multiplayer editing (v2+)
- ❌ Cross-platform mobile export in v1 (local "Run" button only — export is v2+)
- ❌ Concurrent agent file writes (sequential turn-taking only)
- ❌ Web-based game builder (web is landing+login only)
- ❌ Unvalidated AI output written to project files
- ❌ AI writing files outside project directory
- ❌ Supporting multiple Godot versions simultaneously

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks MUST be verifiable WITHOUT any human action.

### Test Decision
- **Infrastructure exists**: NO (greenfield project)
- **Automated tests**: NONE (user decision)
- **Framework**: N/A

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **Electron UI** | Playwright (playwright skill) | Navigate, interact, assert DOM, screenshot |
| **Backend API** | Bash (curl) | Send requests, parse JSON, assert fields |
| **Godot Pipeline** | Bash (godot CLI) | Run `--check-only`, validate output, check exit code |
| **OpenCode SDK** | Bash (bun/node) | Create sessions, send prompts, verify responses |
| **File Generation** | Bash (ls, cat) | Verify files exist, check content structure |

---

## Execution Strategy

### Phase Structure (Mandatory — Metis Directive)

```
Phase 0 — Technical Spike (GATE: All spikes pass)
├── Task 1: OpenCode SDK Multi-Session Spike
├── Task 2: Godot Preview Strategy Spike
└── Task 3: AI→Godot Pipeline Spike

Phase 1 — Project Skeleton (GATE: App launches, services start)
├── Task 4: Monorepo Setup (Bun workspace)
├── Task 5: Electron + React Shell
├── Task 6: Godot Manager Module
└── Task 7: OpenCode SDK Integration

Phase 2 — Single Agent Flow (GATE: User types prompt → valid game created)
├── Task 8: Godot Project Scaffold System
├── Task 9: Game Coder Agent (single agent)
├── Task 10: Chat UI + Streaming Response
└── Task 11: Game Preview Integration

Phase 3 — Multi-Agent System (GATE: Orchestrator delegates, game compiles)
├── Task 12: Agent Architecture (oh-my-opencode pattern)
├── Task 13: Orchestrator Agent
├── Task 14: Game Designer Agent
├── Task 15: Scene Builder Agent
├── Task 16: Debugger Agent
├── Task 17: Reviewer Agent
└── Task 18: Agent Coordination & Turn-Taking

Phase 4 — Polish & Error Handling (GATE: Graceful errors, progress UI)
├── Task 19: Error Feedback Loop (Godot→Agent)
├── Task 20: Progress UI & Generation Status
├── Task 21: Chat History Persistence
├── Task 22: Project Management (create/open/delete)
└── Task 23: Settings & API Key Management

Phase 5 — Backend & Auth (GATE: Login works, data persists)
├── Task 24: Elysia + Bun Backend Setup
├── Task 25: Better Auth Integration
├── Task 26: PostgreSQL + Drizzle Schema
├── Task 27: Deep Link Auth Flow
├── Task 28: Web Landing Page

Phase 6 — Asset Generation & Expansion (GATE: PixelLab generates assets)
├── Task 29: PixelLab MCP Integration
├── Task 30: Asset Generator Agent
├── Task 31: Godot Auto-Download System
├── Task 32: Tab System (Left Panel)
├── Task 33: Cost Tracking & Usage UI
└── Task 34: Godot Build/Export Integration
```

### Parallel Execution Waves

```
Wave 1 (Phase 0 — Sequential, blocking):
└── Tasks 1, 2, 3 (sequential — each informs next)

Wave 2 (Phase 1 — Parallel after Phase 0):
├── Task 4: Monorepo Setup [no dependencies]
├── Task 5: Electron + React Shell [depends: 4]
├── Task 6: Godot Manager [depends: 4]
└── Task 7: OpenCode Integration [depends: 4]

Wave 3 (Phase 2-3 — Sequential core, parallel expansion):
├── Tasks 8-11: Sequential (each builds on previous)
├── Tasks 12-18: Phase 3 after Phase 2 complete

Wave 4 (Phase 4-6 — Mixed parallel):
├── Tasks 19-23: Phase 4 (after Phase 3)
├── Tasks 24-28: Phase 5 (can parallel with Phase 4)
├── Tasks 29-34: Phase 6 (after Phase 5)
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3 | None (sequential spike) |
| 2 | 1 | 3 | None |
| 3 | 2 | 4-7 | None |
| 4 | 3 | 5, 6, 7 | None |
| 5 | 4 | 10, 11 | 6, 7 |
| 6 | 4 | 8, 11 | 5, 7 |
| 7 | 4 | 9, 12 | 5, 6 |
| 8 | 6 | 9 | 5, 7 |
| 9 | 7, 8 | 10 | None |
| 10 | 5, 9 | 11 | None |
| 11 | 5, 6, 10 | 12 | None |
| 12 | 7, 11 | 13-18 | None |
| 13-18 | 12 | 19 | Some internal parallelism |
| 19-23 | 18 | None | 24-28 |
| 24-28 | 4 | 29 | 19-23 |
| 29-34 | 25, 18 | None | Some internal parallelism |

---

## TODOs

### Phase 0 — Technical Spike (MANDATORY GATE)

- [x] 1. OpenCode SDK Multi-Session Spike

  **What to do**:
  - Create `spike/opencode-multi-session/` directory
  - Install `@opencode-ai/sdk`
  - Write a script that:
    1. Calls `createOpencode()` to start server+client
    2. Creates 3 separate sessions via `client.session.create()`
    3. Sends different prompts to each session via `client.session.prompt()`
    4. Verifies all 3 return valid AI responses
    5. Tests `agent` parameter to verify agent-specific behavior
    6. Tests `tools` parameter to verify tool restriction works
    7. Tests SSE event stream via `client.event.subscribe()`
  - Document: concurrent session limit, response times, memory usage
  - Write decision document: `spike/decisions/opencode-multi-session.md`

  **Must NOT do**:
  - Build production code
  - Create complex abstractions

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Goal-oriented autonomous problem-solving with thorough research
  - **Skills**: [`playwright`]
    - `playwright`: May need browser for OpenCode web UI testing

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Phase 0)
  - **Blocks**: Task 2, 3
  - **Blocked By**: None

  **References**:
  - OpenCode SDK docs: `https://open-code.ai/docs/en/sdk` — Full API reference
  - `@opencode-ai/sdk` npm: `https://www.npmjs.com/package/@opencode-ai/sdk` — Package info
  - OpenCode server docs: `https://open-code.ai/docs/en/server` — HTTP API endpoints
  - oh-my-opencode agent tools: `https://github.com/code-yeongyu/oh-my-opencode/blob/dev/src/shared/agent-tool-restrictions.ts` — Tool restriction pattern
  - oh-my-opencode delegate task: `https://github.com/code-yeongyu/oh-my-opencode/blob/dev/src/tools/delegate-task/tools.test.ts` — Agent dispatch tests

  **Acceptance Criteria**:

  ```
  Scenario: OpenCode SDK starts and responds to health check
    Tool: Bash (bun)
    Steps:
      1. bun run spike/opencode-multi-session/index.ts
      2. Assert: stdout contains "Server healthy: true"
      3. Assert: stdout contains "Session 1 created: true"
      4. Assert: stdout contains "Session 2 created: true"
      5. Assert: stdout contains "Session 3 created: true"
      6. Assert: stdout contains "All 3 sessions returned valid responses"
      7. Assert: exit code 0
    Expected Result: 3 concurrent sessions all work
    Evidence: Terminal output captured to .sisyphus/evidence/task-1-multi-session.txt

  Scenario: SSE event stream works
    Tool: Bash (bun)
    Steps:
      1. bun run spike/opencode-multi-session/events.ts
      2. Assert: stdout contains "Event received: message.created"
      3. Assert: exit code 0
    Expected Result: SSE events arrive in real-time
    Evidence: .sisyphus/evidence/task-1-sse-events.txt
  ```

  **Commit**: YES
  - Message: `spike(opencode): validate multi-session SDK capabilities`
  - Files: `spike/opencode-multi-session/`

---

- [x] 2. Godot Preview Strategy Spike

  **What to do**:
  - Create `spike/godot-preview/` directory
  - Test 3 approaches (pick winner):
    **Approach A — Godot as child process (separate window)**:
    1. Spawn Godot via `child_process.spawn()` with `--path` pointing to test project
    2. Measure: startup time, memory, communication options
    3. Test window positioning alongside Electron
    **Approach B — Godot HTML5 export in iframe**:
    1. Export a simple Godot project to HTML5/WASM
    2. Embed in Electron BrowserWindow with `crossOriginIsolated: true`
    3. Test: SharedArrayBuffer works, game renders, input works
    **Approach C — Godot HTML5 in separate BrowserWindow**:
    1. Open HTML5 export in a separate Electron BrowserWindow
    2. Test: IPC between main window and preview window
  - Write decision document: `spike/decisions/godot-preview.md`
  - Include: latency measurements, resource usage, UX trade-offs

  **Must NOT do**:
  - Build production preview system
  - Implement LibGodot (not yet stable)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires thorough investigation of platform-specific behaviors
  - **Skills**: [`playwright`]
    - `playwright`: For testing Electron windows and screenshots

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Phase 0, after Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - Electron deep links: `https://electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app`
  - Godot HTML5 export: `https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html`
  - Godot custom HTML shell: `https://docs.godotengine.org/en/4.4/tutorials/platform/web/customizing_html5_shell.html`
  - SharedArrayBuffer issue: `https://github.com/nicolo-ribaudo/tc39-proposal-structs/issues/3` — Cross-origin isolation requirement
  - Electron crossOriginIsolated: Search Electron docs for `webPreferences.crossOriginIsolated`
  - Godot embedded window (4.4): `https://github.com/godotengine/godot-proposals/issues/7213`
  - Godot headless mode: `https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_dedicated_servers.html`

  **Acceptance Criteria**:

  ```
  Scenario: At least one preview approach works
    Tool: Bash (bun) + Playwright
    Steps:
      1. bun run spike/godot-preview/test-all.ts
      2. Assert: stdout contains "Approach [A|B|C]: PASS" for at least one approach
      3. Assert: spike/decisions/godot-preview.md exists and contains "CHOSEN:"
    Expected Result: One viable preview strategy identified and documented
    Evidence: .sisyphus/evidence/task-2-preview-spike.txt + screenshots

  Scenario: Decision document is complete
    Tool: Bash (cat)
    Steps:
      1. cat spike/decisions/godot-preview.md
      2. Assert: contains "CHOSEN:" section
      3. Assert: contains "Latency:" measurements
      4. Assert: contains "Memory:" measurements
    Expected Result: Clear decision with data
    Evidence: spike/decisions/godot-preview.md
  ```

  **Commit**: YES
  - Message: `spike(godot): evaluate preview strategies for Electron embedding`
  - Files: `spike/godot-preview/`

---

- [x] 3. AI→Godot Pipeline Spike

  **What to do**:
  - Create `spike/ai-godot-pipeline/` directory
  - Write prompts that ask LLM to generate:
    1. A minimal Godot `project.godot` file
    2. A `.tscn` scene file with a Player node
    3. A `.gd` GDScript file for player movement
    4. A `.tscn` scene file with a TileMap
  - Send these prompts via OpenCode SDK `session.prompt()`
  - Parse AI output, extract file contents
  - Write files to `spike/ai-godot-pipeline/test-project/`
  - Validate ALL generated files with `godot --headless --check-only`
  - Measure: success rate (target: 80%+ on first try)
  - Test error→correction loop: if validation fails, feed error back to AI
  - Write decision document: `spike/decisions/ai-godot-pipeline.md`

  **Must NOT do**:
  - Build the full agent system
  - Handle complex game types

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires iterative testing and analysis
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Phase 0, after Task 2)
  - **Blocks**: Tasks 4-7 (all Phase 1)
  - **Blocked By**: Task 2

  **References**:
  - Godot .tscn format: `https://docs.godotengine.org/en/stable/contributing/development/file_formats/tscn.html`
  - Godot CLI check-only: `godot --headless --check-only --path <dir>` validates scripts
  - GDScript reference: `https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_basics.html`
  - Godot AI Assistant Hub: `https://github.com/FlamxGames/godot-ai-assistant-hub` — Existing AI+Godot patterns
  - gdai-mcp-plugin: `https://github.com/3ddelano/gdai-mcp-plugin-godot` — MCP for Godot

  **Acceptance Criteria**:

  ```
  Scenario: AI generates valid Godot project files
    Tool: Bash (bun + godot)
    Steps:
      1. bun run spike/ai-godot-pipeline/generate.ts
      2. Assert: spike/ai-godot-pipeline/test-project/project.godot exists
      3. Assert: at least 2 .tscn files exist in test-project/
      4. Assert: at least 2 .gd files exist in test-project/
      5. godot --headless --check-only --path spike/ai-godot-pipeline/test-project/
      6. Assert: exit code 0 (no validation errors)
    Expected Result: AI-generated Godot project passes validation
    Evidence: .sisyphus/evidence/task-3-ai-pipeline.txt

  Scenario: Error correction loop works
    Tool: Bash (bun)
    Steps:
      1. bun run spike/ai-godot-pipeline/error-correction.ts
      2. Assert: stdout contains "Attempt 1: FAIL" (intentionally broken code)
      3. Assert: stdout contains "Error fed back to AI"
      4. Assert: stdout contains "Attempt 2: PASS" (corrected)
    Expected Result: AI can fix errors when given Godot validation output
    Evidence: .sisyphus/evidence/task-3-error-correction.txt
  ```

  **Commit**: YES
  - Message: `spike(ai-godot): validate AI-generated GDScript/tscn pipeline`
  - Files: `spike/ai-godot-pipeline/`

---

### Phase 1 — Project Skeleton

- [x] 4. Monorepo Setup (Bun Workspace)

  **What to do**:
  - Initialize Bun workspace at root with `package.json` workspaces
  - Create package structure:
    ```
    packages/
      electron/     — Electron + React app
      backend/      — Elysia + Bun API
      shared/       — Shared types, constants
      agents/       — Agent definitions, system prompts
      godot-manager/ — Godot binary & project management
    templates/
      basic-2d/     — Godot project scaffold template
    spike/          — Keep spike code for reference
    ```
  - Setup TypeScript config (tsconfig.json per package + root)
  - Setup shared eslint config
  - Setup Bun scripts: `dev`, `build`, `lint`
  - Add `.gitignore` (node_modules, dist, .godot, etc.)

  **Must NOT do**:
  - Install all dependencies upfront
  - Build CI/CD pipeline

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward scaffolding task
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (first in Phase 1)
  - **Blocks**: Tasks 5, 6, 7
  - **Blocked By**: Task 3 (Phase 0 gate)

  **References**:
  - Bun workspace docs: `https://bun.sh/docs/install/workspaces`
  - oh-my-opencode monorepo: `https://github.com/code-yeongyu/oh-my-opencode` — `packages/` directory structure

  **Acceptance Criteria**:

  ```
  Scenario: Monorepo builds successfully
    Tool: Bash
    Steps:
      1. bun install
      2. Assert: exit code 0
      3. ls packages/
      4. Assert: output contains "electron", "backend", "shared", "agents", "godot-manager"
      5. bun run --filter '*' build
      6. Assert: exit code 0
    Expected Result: All packages install and build
    Evidence: .sisyphus/evidence/task-4-monorepo.txt
  ```

  **Commit**: YES
  - Message: `feat(repo): initialize Bun monorepo with package structure`
  - Files: All root config + package.json files

---

- [x] 5. Electron + React Shell

  **What to do**:
  - Setup Electron with React (Vite + electron-vite or electron-forge)
  - Create main process (main.ts): window creation, IPC handlers
  - Create renderer process (React app):
    - Split-panel layout using `react-resizable-panels` or `allotment`
    - Left panel: Preview area + tab system (empty placeholders)
    - Right panel: Chat area (empty placeholder)
  - Setup preload script for secure IPC
  - Configure Electron security: contextIsolation, sandbox
  - Hot reload for development
  - Basic window management (size, position, minimize/maximize)

  **Must NOT do**:
  - Implement chat functionality
  - Implement preview functionality
  - Add auth

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI shell with split panels, tab system
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Split panel layout, tab system design

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7)
  - **Blocks**: Tasks 10, 11
  - **Blocked By**: Task 4

  **References**:
  - electron-vite: `https://electron-vite.org/` — Electron + Vite integration
  - react-resizable-panels: `https://github.com/bvaughn/react-resizable-panels` — Split panel library
  - Electron security: `https://electronjs.org/docs/latest/tutorial/security`
  - Electron preload: `https://electronjs.org/docs/latest/tutorial/tutorial-preload`

  **Acceptance Criteria**:

  ```
  Scenario: Electron app launches with split panel
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running
    Steps:
      1. Launch Electron app
      2. Wait for: .split-panel visible (timeout: 10s)
      3. Assert: .left-panel exists and is visible
      4. Assert: .right-panel exists and is visible
      5. Assert: .tab-bar exists in .left-panel
      6. Screenshot: .sisyphus/evidence/task-5-shell.png
    Expected Result: Split panel app visible with left/right panels
    Evidence: .sisyphus/evidence/task-5-shell.png
  ```

  **Commit**: YES
  - Message: `feat(electron): create React shell with split-panel layout`
  - Files: `packages/electron/`

---

- [ ] 6. Godot Manager Module

  **What to do**:
  - Create `packages/godot-manager/` module:
    - `detect.ts` — Find Godot binary (PATH, common locations, user config)
    - `download.ts` — Download Godot binary from official releases (with SHA-512 verification)
    - `cli.ts` — Wrapper for Godot CLI commands (`--check-only`, `--headless`, `--export`, `--path`)
    - `project.ts` — Create/validate/manage Godot project directories
    - `version.ts` — Parse and compare Godot versions (pin to 4.4.x)
  - Platform-specific binary paths:
    - macOS: `Godot.app/Contents/MacOS/Godot` + handle Gatekeeper (`xattr -cr`)
    - Windows: `Godot_v4.4-stable_win64.exe`
    - Linux: `Godot_v4.4-stable_linux.x86_64`
  - Architecture detection: ARM64 vs x86_64

  **Must NOT do**:
  - Build UI for Godot management (Phase 4)
  - Support multiple Godot versions

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Cross-platform binary management, CLI integration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7)
  - **Blocks**: Tasks 8, 11
  - **Blocked By**: Task 4

  **References**:
  - Godot releases: `https://github.com/godotengine/godot-builds/releases`
  - Godot CLI reference: `https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html`
  - Godot headless: `https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_dedicated_servers.html`
  - gdman (version manager): `https://github.com/hbread00/gdman` — Reference for download patterns
  - macOS Gatekeeper: `xattr -cr Godot.app` to remove quarantine

  **Acceptance Criteria**:

  ```
  Scenario: Godot binary detected on system
    Tool: Bash (bun)
    Steps:
      1. bun run packages/godot-manager/src/detect.ts
      2. Assert: stdout contains "Godot found:" OR "Godot not found"
      3. If found: stdout contains version number matching "4.4"
    Expected Result: Detection works on current platform
    Evidence: .sisyphus/evidence/task-6-detect.txt

  Scenario: Godot CLI wrapper validates project
    Tool: Bash (bun)
    Steps:
      1. bun run packages/godot-manager/src/cli.ts check-only templates/basic-2d/
      2. Assert: exit code 0 (valid project)
    Expected Result: CLI wrapper correctly invokes Godot
    Evidence: .sisyphus/evidence/task-6-cli.txt
  ```

  **Commit**: YES
  - Message: `feat(godot-manager): Godot binary detection, download, and CLI wrapper`
  - Files: `packages/godot-manager/`

---

- [ ] 7. OpenCode SDK Integration

  **What to do**:
  - Create OpenCode SDK wrapper in `packages/agents/src/opencode/`:
    - `server.ts` — Start/stop OpenCode server via `createOpencode()`
    - `client.ts` — Session management, prompt sending, event subscription
    - `config.ts` — OpenCode configuration (model, providers, API keys)
  - Integrate with Electron main process:
    - Start OpenCode server on app launch
    - Expose SDK methods via IPC to renderer
    - Handle server lifecycle (start, health check, graceful shutdown)
  - Setup OpenCode config at `~/.config/opencode/opencode.json` if not exists
  - SSE event forwarding from OpenCode to renderer (for streaming responses)

  **Must NOT do**:
  - Build agent system (Task 12+)
  - Build chat UI (Task 10)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: SDK integration, IPC bridging, process management
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Tasks 9, 12
  - **Blocked By**: Task 4

  **References**:
  - OpenCode SDK: `https://open-code.ai/docs/en/sdk` — Full API reference
  - OpenCode server: `https://open-code.ai/docs/en/server` — Server mode docs
  - `createOpencode()` API: Start server+client, options: hostname, port, config
  - `createOpencodeClient()` API: Connect to existing server, options: baseUrl
  - `client.session.prompt()`: Send message with model, agent, tools, parts
  - `client.event.subscribe()`: SSE stream for real-time events
  - oh-my-opencode opencode-server-auth: `https://github.com/code-yeongyu/oh-my-opencode/blob/dev/src/shared/opencode-server-auth.ts`

  **Acceptance Criteria**:

  ```
  Scenario: OpenCode server starts with Electron
    Tool: Bash (curl)
    Preconditions: Electron app running
    Steps:
      1. curl -s http://localhost:4096/global/health
      2. Assert: response contains "healthy": true
      3. Assert: response contains "version"
    Expected Result: OpenCode server healthy
    Evidence: .sisyphus/evidence/task-7-health.txt

  Scenario: Session creation works via IPC
    Tool: Bash (bun)
    Steps:
      1. bun run packages/agents/src/opencode/test-integration.ts
      2. Assert: stdout contains "Session created:"
      3. Assert: stdout contains "Prompt response received"
    Expected Result: SDK integration works end-to-end
    Evidence: .sisyphus/evidence/task-7-sdk.txt
  ```

  **Commit**: YES
  - Message: `feat(agents): OpenCode SDK server lifecycle and IPC bridge`
  - Files: `packages/agents/src/opencode/`

---

### Phase 2 — Single Agent Flow

- [ ] 8. Godot Project Scaffold System

  **What to do**:
  - Create `templates/basic-2d/` with minimal Godot 4.4 project:
    - `project.godot` — Project settings (2D mode, input actions, display)
    - `scenes/Main.tscn` — Empty main scene
    - `scripts/` — Empty scripts directory
    - `assets/` — Placeholder assets directory
    - `.godot/` — Godot cache directory
  - Create scaffold manager in `packages/godot-manager/src/scaffold.ts`:
    - Copy template to new project directory
    - Customize project.godot (name, resolution, etc.)
    - Define "extension points" where AI can add scenes/scripts
  - Document the scaffold structure for agent system prompts

  **Must NOT do**:
  - Create 3D templates
  - Create complex game templates

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Template creation and file scaffolding
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5, 7 if Task 6 done)
  - **Blocks**: Task 9
  - **Blocked By**: Task 6

  **References**:
  - Godot project.godot format: `https://docs.godotengine.org/en/stable/tutorials/io/data_paths.html`
  - Godot 2D tutorial: `https://docs.godotengine.org/en/stable/getting_started/first_2d_game/index.html`

  **Acceptance Criteria**:

  ```
  Scenario: Scaffold creates valid Godot project
    Tool: Bash (bun + godot)
    Steps:
      1. bun run packages/godot-manager/src/scaffold.ts create /tmp/test-game "My Test Game"
      2. Assert: /tmp/test-game/project.godot exists
      3. godot --headless --check-only --path /tmp/test-game
      4. Assert: exit code 0
    Expected Result: Scaffolded project passes Godot validation
    Evidence: .sisyphus/evidence/task-8-scaffold.txt
  ```

  **Commit**: YES
  - Message: `feat(godot): project scaffold system with basic-2d template`
  - Files: `templates/basic-2d/`, `packages/godot-manager/src/scaffold.ts`

---

- [ ] 9. Game Coder Agent (Single Agent)

  **What to do**:
  - Create the first AI agent in `packages/agents/src/game-coder/`:
    - `system-prompt.md` — Detailed system prompt for GDScript/scene generation
    - `tools.ts` — Tool definitions (file write, file read, godot validate)
    - `agent.ts` — Agent execution logic via OpenCode SDK
  - System prompt must include:
    - Godot 4.4 API reference snippets
    - .tscn file format specification
    - GDScript coding standards
    - Project scaffold structure awareness
    - Error handling patterns
  - Tool chain: User prompt → AI generates code → Write to project → Validate with `godot --check-only` → If error, feed back to AI → Repeat
  - Implement the validation-feedback loop from spike findings

  **Must NOT do**:
  - Build multi-agent orchestration
  - Handle complex game types (RPG, multiplayer, etc.)

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Complex system prompt engineering, AI pipeline logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 7, 8

  **References**:
  - oh-my-opencode agent definition pattern: `https://github.com/code-yeongyu/oh-my-opencode/blob/dev/docs/features.md` — Agent model, purpose, tool config
  - oh-my-opencode tool restrictions: `https://github.com/code-yeongyu/oh-my-opencode/blob/dev/src/shared/agent-tool-restrictions.ts`
  - Godot GDScript docs: `https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/`
  - Godot .tscn format: `https://docs.godotengine.org/en/stable/contributing/development/file_formats/tscn.html`
  - OpenCode SDK `session.prompt()` with agent parameter

  **Acceptance Criteria**:

  ```
  Scenario: Agent generates working platformer from prompt
    Tool: Bash (bun + godot)
    Steps:
      1. bun run packages/agents/src/game-coder/test-generate.ts "Create a simple platformer with a player that can jump"
      2. Assert: Generated project directory contains at least 1 .tscn and 1 .gd file
      3. godot --headless --check-only --path <generated-project>
      4. Assert: exit code 0 (validation passes)
    Expected Result: AI-generated Godot game compiles
    Evidence: .sisyphus/evidence/task-9-game-coder.txt

  Scenario: Error correction works within 3 attempts
    Tool: Bash (bun)
    Steps:
      1. bun run packages/agents/src/game-coder/test-error-correction.ts
      2. Assert: stdout shows validation passing within 3 attempts
    Expected Result: Agent self-corrects errors
    Evidence: .sisyphus/evidence/task-9-error-correction.txt
  ```

  **Commit**: YES
  - Message: `feat(agents): Game Coder agent with GDScript generation and validation loop`
  - Files: `packages/agents/src/game-coder/`

---

- [ ] 10. Chat UI + Streaming Response

  **What to do**:
  - Build chat UI in right panel (`packages/electron/src/renderer/chat/`):
    - Message input with send button (Ctrl+Enter to send)
    - Message list with user/assistant message bubbles
    - Streaming response display (tokens arrive one by one via SSE)
    - Code blocks with syntax highlighting (GDScript)
    - File operation indicators (when agent writes files)
    - Loading/typing indicator
  - Connect to OpenCode SDK via IPC:
    - Send user message → `session.prompt()` → stream response → display
    - Show tool usage (file writes, validation) in real-time
  - Basic error display (network errors, AI errors)

  **Must NOT do**:
  - Chat history persistence (Task 21)
  - Multiple conversations
  - Agent selection UI

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Chat UI with streaming, code blocks, animations
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Chat interface design, streaming UX

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 5, 9

  **References**:
  - OpenCode SSE events: `client.event.subscribe()` — Real-time event stream
  - oh-my-opencode streaming pattern: SSE → real-time token display
  - react-syntax-highlighter or shiki: For GDScript code highlighting

  **Acceptance Criteria**:

  ```
  Scenario: Chat sends message and receives streamed response
    Tool: Playwright (playwright skill)
    Preconditions: Electron app running with OpenCode server
    Steps:
      1. Focus: input.chat-input
      2. Type: "Create a simple bouncing ball game"
      3. Click: button.send-message
      4. Wait for: .message-bubble.assistant visible (timeout: 30s)
      5. Assert: .message-bubble.assistant text length > 100
      6. Assert: .code-block visible (GDScript code shown)
      7. Screenshot: .sisyphus/evidence/task-10-chat.png
    Expected Result: Chat shows streamed AI response with code
    Evidence: .sisyphus/evidence/task-10-chat.png
  ```

  **Commit**: YES
  - Message: `feat(ui): chat interface with streaming AI responses`
  - Files: `packages/electron/src/renderer/chat/`

---

- [ ] 11. Game Preview Integration

  **What to do**:
  - Implement the preview strategy chosen in spike (Task 2)
  - Integrate preview into left panel of Electron app
  - "Run" button that launches Godot with current project
  - If iframe approach: auto-export to HTML5 and embed
  - If child process approach: spawn Godot, manage window
  - Show "Building..." state during export/compilation
  - Handle Godot process lifecycle (start, stop, crash recovery)
  - Basic error display when Godot fails

  **Must NOT do**:
  - Hot-reload (auto-preview on code change)
  - Advanced debugging integration

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Platform-specific process management, preview integration
  - **Skills**: [`playwright`]
    - `playwright`: For testing preview rendering

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 5, 6, 10

  **References**:
  - Spike decision: `spike/decisions/godot-preview.md` — Chosen approach
  - Node.js child_process: `https://nodejs.org/api/child_process.html`
  - Godot HTML5 export: `https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html`
  - Electron BrowserView/webContents for iframe approach

  **Acceptance Criteria**:

  ```
  Scenario: Run button launches game preview
    Tool: Playwright (playwright skill)
    Preconditions: Electron app running, Godot project exists
    Steps:
      1. Click: button.run-game
      2. Wait for: .preview-loading visible then hidden (timeout: 30s)
      3. Assert: .game-preview visible OR Godot window detected
      4. Screenshot: .sisyphus/evidence/task-11-preview.png
    Expected Result: Game runs and is visible to user
    Evidence: .sisyphus/evidence/task-11-preview.png
  ```

  **Commit**: YES
  - Message: `feat(preview): Godot game preview integration in left panel`
  - Files: `packages/electron/src/renderer/preview/`, `packages/godot-manager/src/preview.ts`

---

### Phase 3 — Multi-Agent System

- [ ] 12. Agent Architecture (oh-my-opencode pattern)

  **What to do**:
  - Design and implement the multi-agent framework in `packages/agents/`:
    - `src/framework/agent-registry.ts` — Register/lookup agents by name
    - `src/framework/agent-base.ts` — Base class/interface for all agents
    - `src/framework/orchestrator.ts` — Turn-taking coordinator
    - `src/framework/tool-restrictions.ts` — Per-agent tool allow/deny lists
    - `src/framework/category-system.ts` — Agent categories (like oh-my-opencode)
    - `src/framework/session-manager.ts` — OpenCode session per agent
  - Agent definition schema (inspired by oh-my-opencode):
    ```typescript
    interface AgentDefinition {
      name: string
      model: { providerID: string, modelID: string }
      systemPrompt: string
      tools: Record<string, boolean>  // tool allow/deny
      category: string
      maxTokens: number
    }
    ```
  - Sequential execution: Orchestrator → Agent A → Orchestrator → Agent B
  - Inter-agent communication: via shared project state (files on disk)

  **Must NOT do**:
  - Concurrent agent execution
  - Complex agent negotiation protocols

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Complex orchestration architecture design
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Tasks 13-18
  - **Blocked By**: Tasks 7, 11

  **References**:
  - oh-my-opencode agent system: `https://github.com/code-yeongyu/oh-my-opencode/blob/dev/docs/features.md`
  - oh-my-opencode categories: `https://github.com/code-yeongyu/oh-my-opencode/blob/dev/docs/category-skill-guide.md`
  - oh-my-opencode agent overrides: `https://github.com/code-yeongyu/oh-my-opencode/blob/dev/src/config/schema/agent-overrides.ts`
  - oh-my-opencode delegate task: `https://github.com/code-yeongyu/oh-my-opencode/blob/dev/src/tools/delegate-task/category-resolver.ts`
  - oh-my-opencode tool restrictions: `https://github.com/code-yeongyu/oh-my-opencode/blob/dev/src/shared/agent-tool-restrictions.ts`
  - oh-my-opencode orchestration guide: `https://github.com/code-yeongyu/oh-my-opencode/blob/dev/docs/orchestration-guide.md`

  **Acceptance Criteria**:

  ```
  Scenario: Agent registry works
    Tool: Bash (bun)
    Steps:
      1. bun run packages/agents/src/framework/test-registry.ts
      2. Assert: stdout contains "Registered 7 agents"
      3. Assert: stdout contains agent names: orchestrator, game-designer, gdscript-coder, scene-builder, asset-generator, debugger, reviewer
    Expected Result: All agents registered and retrievable
    Evidence: .sisyphus/evidence/task-12-registry.txt
  ```

  **Commit**: YES
  - Message: `feat(agents): multi-agent framework with registry, categories, and tool restrictions`
  - Files: `packages/agents/src/framework/`

---

- [ ] 13. Orchestrator Agent
- [ ] 14. Game Designer Agent
- [ ] 15. Scene Builder Agent
- [ ] 16. Debugger Agent
- [ ] 17. Reviewer Agent

  **(Tasks 13-17 follow the same pattern — each creates a specialized agent)**

  **What to do for each**:
  - Create agent definition in `packages/agents/src/<agent-name>/`
  - Write system prompt (`system-prompt.md`) with:
    - Role description and responsibilities
    - Godot-specific knowledge
    - Tool restrictions
    - Output format expectations
  - Define tool allow/deny list
  - Integrate with agent framework from Task 12

  **Agent Specifications**:

  | Agent | Model (Default) | Purpose | Tools Allowed |
  |-------|----------------|---------|---------------|
  | Orchestrator | Claude Opus 4.6 | Decompose user request, delegate to specialists, validate results | read, orchestrate |
  | Game Designer | GPT 5.2 | Analyze request, create game design doc, define scenes/mechanics | read, write (design docs only) |
  | Scene Builder | Claude Sonnet 4.5 | Generate .tscn scene files, node trees, UI layout | read, write (.tscn), godot-validate |
  | Debugger | GPT 5.2 | Analyze Godot errors, fix broken scripts/scenes | read, write, godot-validate, godot-run |
  | Reviewer | Claude Sonnet 4.5 | Review generated code quality, suggest improvements | read, godot-validate |

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
  - **Skills**: []

  **Parallelization**: Tasks 13-17 can be partially parallelized (system prompts are independent)
  - **Blocked By**: Task 12

  **Commit**: YES (one per agent or grouped)
  - Message: `feat(agents): add <agent-name> specialized agent`

---

- [ ] 18. Agent Coordination & Turn-Taking

  **What to do**:
  - Implement the orchestration loop:
    1. User message → Orchestrator receives
    2. Orchestrator creates plan (which agents, in what order)
    3. Execute agents sequentially (turn-taking)
    4. Each agent: get project state → do work → validate → report back
    5. Orchestrator reviews results → next agent or done
  - File locking: only one agent writes at a time
  - Shared project state: agents read files to understand current project
  - Progress reporting: which agent is working, what they're doing
  - Error escalation: if agent fails 3x, escalate to Orchestrator

  **Must NOT do**:
  - Parallel agent execution
  - Complex negotiation between agents

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Tasks 19+
  - **Blocked By**: Tasks 13-17

  **Acceptance Criteria**:

  ```
  Scenario: Multi-agent creates a complete game
    Tool: Bash (bun + godot)
    Steps:
      1. bun run packages/agents/src/framework/test-orchestration.ts "Create a space invaders clone"
      2. Assert: stdout shows Orchestrator delegating to Game Designer
      3. Assert: stdout shows GDScript Coder writing scripts
      4. Assert: stdout shows Scene Builder creating scenes
      5. Assert: stdout shows Reviewer checking quality
      6. godot --headless --check-only --path <generated-project>
      7. Assert: exit code 0
    Expected Result: Multiple agents collaborate to create a valid game
    Evidence: .sisyphus/evidence/task-18-orchestration.txt
  ```

  **Commit**: YES
  - Message: `feat(agents): orchestration loop with sequential turn-taking`
  - Files: `packages/agents/src/framework/orchestrator.ts`

---

### Phase 4 — Polish & Error Handling

- [ ] 19. Error Feedback Loop (Godot→Agent)
- [ ] 20. Progress UI & Generation Status
- [ ] 21. Chat History Persistence
- [ ] 22. Project Management (create/open/delete)
- [ ] 23. Settings & API Key Management

  **(Detailed specs for Phase 4 tasks)**

  **Task 19**: Capture Godot stderr, parse error messages, format for AI context, auto-retry with corrections
  **Task 20**: Show which agent is working, progress bar, file change indicators, generation timeline
  **Task 21**: Save chat messages to local SQLite (via Bun), load on app restart, search history
  **Task 22**: Project list view, create new project (name, template), open existing, delete with confirmation
  **Task 23**: UI for API key entry (OpenAI, Anthropic, Google, etc.), model selection per agent, cost display

  **Recommended Agent Profile**: `visual-engineering` for UI tasks (20, 22, 23), `unspecified-high` for backend tasks (19, 21)

  **Parallelization**: Tasks 19-23 can largely run in parallel after Phase 3

---

### Phase 5 — Backend & Auth

- [ ] 24. Elysia + Bun Backend Setup
- [ ] 25. Better Auth Integration
- [ ] 26. PostgreSQL + Drizzle Schema
- [ ] 27. Deep Link Auth Flow
- [ ] 28. Web Landing Page

  **(Detailed specs for Phase 5 tasks)**

  **Task 24**: Elysia app with CORS, WebSocket, health endpoint. Docker compose for PostgreSQL.
  **Task 25**: `auth.mount(auth.handler)`, social logins (Google, GitHub), session management, token-based auth for Electron.
  **Task 26**: Drizzle ORM schema: users, projects, sessions. Migrations.
  **Task 27**: `app.setAsDefaultProtocolClient('gamebuilder')`, handle `gamebuilder://auth?token=xxx`, store token via `safeStorage`.
  **Task 28**: Static landing page (Next.js or Astro), login form, download links, redirect to deep link after auth.

  **References**:
  - Better Auth Elysia integration: `https://www.better-auth.com/docs/integrations/elysia`
  - Electron deep links: `https://electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app`
  - Electron safeStorage: `https://www.electronjs.org/docs/latest/api/safe-storage`
  - Drizzle ORM: `https://orm.drizzle.team/docs/overview`

  **Recommended Agent Profile**: `unspecified-high` for backend, `visual-engineering` for web landing page

  **Parallelization**: Phase 5 can run in parallel with Phase 4

---

### Phase 6 — Asset Generation & Expansion

- [ ] 29. PixelLab MCP Integration
- [ ] 30. Asset Generator Agent
- [ ] 31. Godot Auto-Download System
- [ ] 32. Tab System (Left Panel)
- [ ] 33. Cost Tracking & Usage UI
- [ ] 34. Godot Build/Export Integration

  **(Detailed specs for Phase 6 tasks)**

  **Task 29**: Connect PixelLab MCP tools (create_character, create_isometric_tile, create_topdown_tileset). Call from agent system.
  **Task 30**: Asset Generator agent using PixelLab. System prompt for game art style, sprite sheet generation, tileset creation.
  **Task 31**: Auto-download Godot binary with platform detection, SHA-512 verification, progress UI, Gatekeeper handling.
  **Task 32**: Tab bar in left panel: Preview, File Explorer, Assets, Console tabs. Show/hide tabs dynamically.
  **Task 33**: Track LLM token usage per session, cost estimation, spending alerts.
  **Task 34**: "Export" button: Godot CLI export to desktop/web/mobile presets. Export template management.

  **References**:
  - PixelLab MCP: Available tools in this environment (create_character, create_isometric_tile, etc.)
  - Godot export: `https://docs.godotengine.org/en/stable/tutorials/export/`

  **Recommended Agent Profile**: Various per task

---

## Commit Strategy

| After Task | Message | Files |
|------------|---------|-------|
| 1 | `spike(opencode): validate multi-session SDK capabilities` | spike/opencode-multi-session/ |
| 2 | `spike(godot): evaluate preview strategies for Electron embedding` | spike/godot-preview/ |
| 3 | `spike(ai-godot): validate AI-generated GDScript/tscn pipeline` | spike/ai-godot-pipeline/ |
| 4 | `feat(repo): initialize Bun monorepo with package structure` | Root configs, packages/ |
| 5 | `feat(electron): create React shell with split-panel layout` | packages/electron/ |
| 6 | `feat(godot-manager): Godot binary detection, download, and CLI wrapper` | packages/godot-manager/ |
| 7 | `feat(agents): OpenCode SDK server lifecycle and IPC bridge` | packages/agents/src/opencode/ |
| 8 | `feat(godot): project scaffold system with basic-2d template` | templates/, packages/godot-manager/src/scaffold.ts |
| 9 | `feat(agents): Game Coder agent with validation loop` | packages/agents/src/game-coder/ |
| 10 | `feat(ui): chat interface with streaming AI responses` | packages/electron/src/renderer/chat/ |
| 11 | `feat(preview): Godot game preview integration` | packages/electron/src/renderer/preview/ |
| 12 | `feat(agents): multi-agent framework` | packages/agents/src/framework/ |
| 13-17 | `feat(agents): add <name> specialized agent` | packages/agents/src/<agent>/ |
| 18 | `feat(agents): orchestration loop with turn-taking` | packages/agents/src/framework/orchestrator.ts |
| 19-23 | `feat(polish): <feature>` | Various |
| 24-28 | `feat(backend): <feature>` | packages/backend/, packages/web/ |
| 29-34 | `feat(expansion): <feature>` | Various |

---

## Success Criteria

### System Requirements
- **Minimum**: 8GB RAM, macOS/Windows/Linux, Godot 4.4 installed
- **Recommended**: 16GB RAM, SSD

### Verification Commands
```bash
# Health check
curl -s http://localhost:4096/global/health | jq '.healthy'
# Expected: true

# Godot validation
godot --headless --check-only --path <project-dir>
# Expected: exit code 0

# Backend health
curl -s http://localhost:3001/api/health
# Expected: {"status":"ok"}
```

### Final Checklist
- [ ] All "Must Have" items present
- [ ] All "Must NOT Have" items absent
- [ ] Electron app launches and shows split panel
- [ ] Chat produces working Godot games
- [ ] Multiple agents collaborate on game creation
- [ ] Auth works (web deep link + native)
- [ ] PixelLab generates game assets
- [ ] System requirements documented
