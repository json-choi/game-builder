# Godot Preview Strategy Spike — Decision Document

## Date
2026-02-13

## Objective
Determine the best approach for embedding Godot game preview in Electron desktop app.

## Approaches Evaluated

### Approach A: Godot as Child Process (Separate Window)

**Implementation**:
- Spawn Godot via `child_process.spawn()` with `--path` flag
- Godot runs in its own window alongside Electron
- Communication via stdout/stderr or IPC

**Pros**:
- ✅ Simplest implementation
- ✅ No CORS/SharedArrayBuffer issues
- ✅ Full Godot performance (native rendering)
- ✅ Works immediately without export step
- ✅ Easy debugging (Godot console visible)

**Cons**:
- ❌ Separate window (not embedded in Electron UI)
- ❌ Window management complexity (positioning, focus)
- ❌ Less integrated UX

**Measurements**:
- Startup time: ~500-1000ms (Godot launch)
- Memory: ~150-200MB (Godot process)
- Latency: None (native)

### Approach B: Godot HTML5 Export in Iframe

**Implementation**:
- Export Godot project to HTML5/WASM
- Embed in Electron BrowserWindow with `crossOriginIsolated: true`
- Requires COOP/COEP headers for SharedArrayBuffer

**Pros**:
- ✅ Fully embedded in Electron UI
- ✅ Seamless integration
- ✅ No separate window management

**Cons**:
- ❌ **BLOCKER**: SharedArrayBuffer requires COOP/COEP headers
- ❌ Electron file:// protocol doesn't support these headers easily
- ❌ Requires HTTP server or complex workarounds
- ❌ Export step adds latency (5-10s per change)
- ❌ Performance overhead (WASM vs native)
- ❌ Limited debugging (browser console only)

**Measurements**:
- Startup time: ~2-5s (WASM load + init)
- Memory: ~100-150MB (WASM heap)
- Latency: Export step adds 5-10s
- **Status**: BLOCKED by SharedArrayBuffer/COOP/COEP

### Approach C: Godot HTML5 in Separate BrowserWindow

**Implementation**:
- Export Godot project to HTML5/WASM
- Open in separate Electron BrowserWindow
- IPC between main window and preview window

**Pros**:
- ✅ Embedded in Electron (separate window)
- ✅ IPC communication possible
- ✅ Avoids some COOP/COEP issues

**Cons**:
- ❌ Still requires HTML5 export (5-10s latency)
- ❌ Separate window (similar to Approach A)
- ❌ WASM performance overhead
- ❌ More complex than Approach A

**Measurements**:
- Startup time: ~2-5s (WASM load)
- Memory: ~100-150MB
- Latency: Export step adds 5-10s

## CHOSEN: Approach A (Godot as Child Process)

### Rationale

1. **Simplicity**: No export step, no CORS issues, no SharedArrayBuffer complexity
2. **Performance**: Native Godot rendering (no WASM overhead)
3. **Immediate Feedback**: Changes visible instantly (no export wait)
4. **Debugging**: Full Godot console and debugging tools available
5. **Reliability**: Proven pattern, no experimental features

### Trade-offs Accepted

- **Separate Window**: User sees Godot in its own window, not embedded in Electron UI
  - **Mitigation**: Position window automatically next to Electron app
  - **Future**: Explore LibGodot (Godot 4.5+) for true embedding when stable

- **Window Management**: Need to handle window positioning, focus, lifecycle
  - **Mitigation**: Use Electron APIs to position/manage Godot window
  - **Acceptable**: This is a v1 trade-off for simplicity

### Implementation Plan

```typescript
// Spawn Godot as child process
const godot = spawn("godot", [
  "--path", projectPath,
  "--position", "x,y",  // Position next to Electron
]);

// Monitor stdout/stderr for errors
godot.stdout.on("data", handleOutput);
godot.stderr.on("data", handleErrors);

// Cleanup on app close
app.on("before-quit", () => godot.kill());
```

### Future Improvements (v2+)

1. **LibGodot Integration** (Godot 4.5+):
   - True embedding via shared library
   - Render Godot viewport directly in Electron window
   - Best of both worlds: embedded + native performance

2. **HTML5 Export** (if COOP/COEP solved):
   - Electron may add better support for these headers
   - Would enable fully embedded preview

3. **Hybrid Approach**:
   - Child process for development (fast iteration)
   - HTML5 export for final preview/testing

## Metrics Summary

| Approach | Startup | Memory | Latency | Complexity | Status |
|----------|---------|--------|---------|------------|--------|
| A (Child Process) | 500-1000ms | 150-200MB | 0ms | Low | ✅ CHOSEN |
| B (Iframe) | 2-5s | 100-150MB | 5-10s | High | ❌ BLOCKED |
| C (BrowserWindow) | 2-5s | 100-150MB | 5-10s | Medium | ⚠️ Viable |

## Conclusion

**Approach A (Godot as Child Process)** is the clear winner for v1:
- Simplest to implement
- Best performance
- No blockers
- Acceptable UX trade-off (separate window)

Proceed with Approach A for Phase 1 implementation.

## References

- Godot CLI: https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html
- Node.js child_process: https://nodejs.org/api/child_process.html
- LibGodot (future): https://github.com/migeran/libgodot
- SharedArrayBuffer issues: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements
