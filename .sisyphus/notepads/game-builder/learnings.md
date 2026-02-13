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

