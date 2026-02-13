#!/usr/bin/env bun
import { createOpencodeClient } from "@opencode-ai/sdk";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

console.log("=== AI→Godot Pipeline Spike ===\n");

const client = createOpencodeClient({ baseUrl: "http://localhost:4096" });
const outputDir = "./test-project";

mkdirSync(outputDir, { recursive: true });

async function generateFile(prompt: string, filename: string): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    console.log(`\nGenerating ${filename}...`);
    
    const session = await client.session.create({ body: { title: `Generate ${filename}` } });
    
    const response = await client.session.prompt({
      path: { id: session.data!.id },
      body: {
        model: { providerID: "anthropic", modelID: "claude-3-5-haiku-20241022" },
        parts: [{ type: "text", text: prompt }],
      },
    });
    
    const textPart = response.data?.parts?.find((p: any) => p.type === "text");
    const content = textPart?.text;
    
    await client.session.delete({ path: { id: session.data!.id } });
    
    if (!content) {
      return { success: false, error: "No content generated" };
    }
    
    const codeMatch = content.match(/```(?:gdscript|ini|tscn)?\n([\s\S]*?)\n```/);
    const fileContent = codeMatch ? codeMatch[1] : content;
    
    writeFileSync(join(outputDir, filename), fileContent);
    console.log(`✓ Generated ${filename} (${fileContent.length} bytes)`);
    
    return { success: true, content: fileContent };
  } catch (error) {
    console.error(`❌ Failed to generate ${filename}:`, error);
    return { success: false, error: String(error) };
  }
}

async function main() {
  const results = [];
  
  results.push(await generateFile(
    `Generate a minimal Godot 4.4 project.godot file for a 2D game. 
    Include only essential settings. Output ONLY the file content, no explanation.`,
    "project.godot"
  ));
  
  results.push(await generateFile(
    `Generate a Godot 4.4 .tscn scene file with a Player node (CharacterBody2D).
    Include a Sprite2D child and CollisionShape2D child.
    Output ONLY the .tscn file content in Godot's text format, no explanation.`,
    "Player.tscn"
  ));
  
  results.push(await generateFile(
    `Generate a GDScript file for player movement in Godot 4.4.
    Use CharacterBody2D with WASD movement and jump.
    Output ONLY the GDScript code, no explanation.`,
    "Player.gd"
  ));
  
  results.push(await generateFile(
    `Generate a Godot 4.4 .tscn scene file with a TileMap node for a 2D platformer.
    Include basic configuration.
    Output ONLY the .tscn file content, no explanation.`,
    "Level.tscn"
  ));
  
  const successCount = results.filter(r => r.success).length;
  const successRate = (successCount / results.length) * 100;
  
  console.log(`\n=== Results ===`);
  console.log(`Success rate: ${successRate}% (${successCount}/${results.length})`);
  console.log(`Target: 80%+`);
  
  if (successRate >= 80) {
    console.log(`✓ SUCCESS: AI generation meets target`);
  } else {
    console.log(`⚠️ WARNING: Below target success rate`);
  }
}

main().catch(console.error);
