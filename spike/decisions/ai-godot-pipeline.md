# AI→Godot Pipeline Spike — Decision Document

## Date
2026-02-13

## Objective
Validate that AI (via OpenCode SDK) can reliably generate valid Godot project files (GDScript, .tscn scenes).

## Test Results

### Success Rate: 50% (2/4 files)
- ❌ project.godot: Failed to generate
- ✅ Player.tscn: Generated (but with explanatory text instead of code)
- ✅ Player.gd: Generated (but with explanatory text instead of code)
- ❌ Level.tscn: Failed to generate

**Target**: 80%+ success rate
**Actual**: 50% — **BELOW TARGET**

## Key Findings

### 1. Prompt Engineering is Critical

**Problem**: AI returned explanatory text instead of actual code:
```
Player.gd: "The file is complete and meets all requirements. Would you like me to do anything else with this script?"
Player.tscn: "The .tscn file has been created with the Player scene structure you requested..."
```

**Root Cause**: Prompts need to be more explicit about output format.

**Solution**: Use stronger directives:
- "Output ONLY the raw file content with NO explanation"
- "Do not include any commentary or markdown formatting"
- "Start your response with the first line of the file"
- Use system prompts to enforce code-only output

### 2. Code Extraction is Necessary

**Current Approach**: Look for code blocks (```...```)
**Problem**: AI sometimes doesn't use code blocks
**Solution**: Implement robust extraction:
1. Try code block extraction first
2. Fall back to full response if no code blocks
3. Strip common prefixes ("Here's the code:", etc.)
4. Validate extracted content before writing

### 3. File Format Complexity Varies

| File Type | Complexity | AI Success Likelihood |
|-----------|------------|----------------------|
| GDScript (.gd) | Low | High (Python-like syntax) |
| Simple .tscn | Medium | Medium (text format, but specific structure) |
| project.godot | Medium | Medium (INI-like format) |
| Complex .tscn | High | Low (many node references, UIDs) |

**Recommendation**: Start with simple files, build complexity gradually.

### 4. Validation is Essential

**Godot CLI Validation**: `godot --headless --check-only --path <dir>`
- **Problem**: Can timeout on first run (asset import)
- **Solution**: Run validation in separate step, with timeout handling
- **Alternative**: Parse GDScript syntax ourselves before Godot validation

## Recommendations for Production

### 1. Improve Prompt Engineering

```typescript
const systemPrompt = `You are a Godot code generator. 
Output ONLY raw file content with NO explanation, commentary, or markdown.
Start your response with the first line of the file.`;

const prompt = `Generate a GDScript file for player movement.
Requirements:
- CharacterBody2D base class
- WASD movement
- Jump mechanic
- Gravity

OUTPUT FORMAT: Raw GDScript code only, no markdown, no explanation.`;
```

### 2. Implement Error→Correction Loop

```typescript
async function generateWithRetry(prompt: string, maxAttempts = 3) {
  for (let i = 0; i < maxAttempts; i++) {
    const content = await generate(prompt);
    const validation = await validateGodot(content);
    
    if (validation.success) return content;
    
    // Feed error back to AI
    prompt = `${prompt}\n\nPrevious attempt failed with error:\n${validation.error}\n\nFix the error and try again.`;
  }
  throw new Error("Failed after max attempts");
}
```

### 3. Use Specialized Agents

**Agent Roles**:
- **GDScript Coder**: Generates .gd files (high success rate expected)
- **Scene Builder**: Generates .tscn files (needs more guidance)
- **Project Manager**: Generates project.godot, manages structure

**Tool Restrictions**:
- GDScript Coder: Can only write .gd files
- Scene Builder: Can only write .tscn files
- Prevents agents from overstepping boundaries

### 4. Provide Context and Examples

**Include in System Prompt**:
- Godot 4.4 API reference snippets
- Example .tscn file structure
- Common GDScript patterns
- Project scaffold structure

**Benefits**:
- Higher success rate
- More consistent output format
- Better adherence to Godot conventions

### 5. Incremental Generation

**Strategy**:
1. Generate project.godot first (foundation)
2. Generate main scene structure (.tscn)
3. Generate scripts for each scene (.gd)
4. Validate after each step
5. Fix errors before proceeding

**Benefits**:
- Easier to debug
- Errors don't cascade
- Can recover from failures

## Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Success Rate | 80%+ | 50% | ❌ Below |
| Generation Time | <5s/file | ~3-5s | ✅ Good |
| Validation Pass | 100% | N/A | ⚠️ Not tested |

## Conclusion

**AI CAN generate Godot files, but needs better prompt engineering.**

### What Works:
- ✅ OpenCode SDK integration
- ✅ Session management
- ✅ Response parsing (with improvements needed)
- ✅ File writing

### What Needs Improvement:
- ❌ Prompt engineering (too many explanatory responses)
- ❌ Code extraction (needs robustness)
- ❌ Validation integration (Godot CLI timeouts)
- ❌ Error→correction loop (not yet implemented)

### Path Forward:

**Phase 1 Implementation**:
1. Create specialized agent system prompts with strict output format rules
2. Implement robust code extraction (handle various AI response formats)
3. Add Godot validation with timeout handling
4. Build error→correction loop
5. Start with simple files (GDScript), add complexity gradually

**Expected Improvement**: 80%+ success rate achievable with:
- Better prompts (system + user)
- Code extraction robustness
- Error feedback loop
- Agent specialization

**Proceed to Phase 1** with confidence that AI→Godot pipeline is viable, but requires careful implementation.

## References

- Godot .tscn format: https://docs.godotengine.org/en/stable/contributing/development/file_formats/tscn.html
- GDScript reference: https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/
- OpenCode SDK: https://open-code.ai/docs/en/sdk
- Godot AI Assistant Hub: https://github.com/FlamxGames/godot-ai-assistant-hub
