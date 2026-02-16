import { existsSync, mkdirSync, writeFileSync, cpSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { checkHealth } from '../packages/agents/src/opencode/server'
import { setDirectory } from '../packages/agents/src/opencode/client'
import { GameCoderAgent, type GenerateResult, type GameCoderEvent } from '../packages/agents/src/game-coder/agent'
import { OrchestratorAgent } from '../packages/agents/src/orchestrator/agent'
import type { QAPrompt } from './qa-prompts'

const PROJECT_ROOT = join(import.meta.dir, '..')
const TEMPLATE_DIR = join(PROJECT_ROOT, 'templates', 'basic-2d')

export interface HarnessResult {
  prompt: QAPrompt
  projectPath: string
  files: string[]
  generateResult: GenerateResult | null
  error: string | null
  durationMs: number
}

async function ensureOpenCodeHealthy(): Promise<void> {
  const { healthy, version } = await checkHealth()
  if (!healthy) {
    throw new Error(
      'OpenCode server is not running on localhost:4096. Start it with: opencode server --port 4096',
    )
  }
  console.log(`[qa-harness] OpenCode server healthy (v${version})`)
}

function scaffoldProject(label: string): string {
  const projectPath = join(
    tmpdir(),
    `qa-game-${label.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
  )
  mkdirSync(projectPath, { recursive: true })

  if (existsSync(TEMPLATE_DIR)) {
    cpSync(TEMPLATE_DIR, projectPath, { recursive: true })
  } else {
    const projectGodot = [
      '; Engine configuration file.',
      'config_version=5',
      '',
      '[application]',
      '',
      'config/name="QA Test Game"',
      'run/main_scene="res://scenes/Main.tscn"',
      'config/features=PackedStringArray("4.4", "Forward Plus")',
      '',
      '[display]',
      '',
      'window/size/viewport_width=1152',
      'window/size/viewport_height=648',
    ].join('\n')
    writeFileSync(join(projectPath, 'project.godot'), projectGodot)
    mkdirSync(join(projectPath, 'scenes'), { recursive: true })
    mkdirSync(join(projectPath, 'scripts'), { recursive: true })
    mkdirSync(join(projectPath, 'assets'), { recursive: true })
  }

  return projectPath
}

function listProjectFiles(dir: string, base = ''): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      results.push(...listProjectFiles(join(dir, entry.name), rel))
    } else {
      results.push(rel)
    }
  }
  return results
}

export async function runHarness(
  prompts: QAPrompt[],
  existingProjectPath?: string,
): Promise<HarnessResult[]> {
  await ensureOpenCodeHealthy()

  const results: HarnessResult[] = []
  const orchestrator = new OrchestratorAgent()
  const coder = new GameCoderAgent()

  let projectPath = existingProjectPath ?? scaffoldProject(prompts[0]?.label ?? 'test')
  setDirectory(projectPath)

  for (const prompt of prompts) {
    const start = Date.now()
    console.log(`\n[qa-harness] Level ${prompt.level}: ${prompt.label}`)
    console.log(`[qa-harness] Prompt: ${prompt.prompt}`)

    try {
      console.log('[qa-harness] Creating orchestration plan...')
      const planResult = await orchestrator.createPlan(prompt.prompt)
      console.log(`[qa-harness] Plan: ${planResult.plan.totalSteps} step(s)`)

      let generateResult: GenerateResult | null = null

      for (const step of planResult.plan.steps) {
        if (step.agent === 'game-coder') {
          console.log(`[qa-harness] Running game-coder: ${step.task}`)
          const onProgress = (event: GameCoderEvent) => {
            console.log(`  [game-coder] ${event.type}: ${event.message}`)
          }
          generateResult = await coder.generate({
            prompt: step.task,
            projectPath,
            maxRetries: 3,
            onProgress,
          })
          console.log(
            `[qa-harness] Generated ${generateResult.files.length} file(s), success=${generateResult.success}`,
          )
        } else {
          console.log(`[qa-harness] Skipping agent "${step.agent}" (not game-coder)`)
        }
      }

      const files = listProjectFiles(projectPath)
      results.push({
        prompt,
        projectPath,
        files,
        generateResult,
        error: null,
        durationMs: Date.now() - start,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[qa-harness] Error: ${message}`)
      results.push({
        prompt,
        projectPath,
        files: listProjectFiles(projectPath),
        generateResult: null,
        error: message,
        durationMs: Date.now() - start,
      })
    }
  }

  return results
}

export async function runHarnessWithFix(
  prompt: QAPrompt,
  projectPath: string,
  fixPrompt: string,
): Promise<HarnessResult> {
  await ensureOpenCodeHealthy()
  setDirectory(projectPath)

  const coder = new GameCoderAgent()
  const start = Date.now()
  console.log(`\n[qa-harness] Fix iteration for Level ${prompt.level}`)
  console.log(`[qa-harness] Fix prompt: ${fixPrompt}`)

  try {
    const onProgress = (event: GameCoderEvent) => {
      console.log(`  [game-coder] ${event.type}: ${event.message}`)
    }
    const generateResult = await coder.generate({
      prompt: fixPrompt,
      projectPath,
      maxRetries: 3,
      onProgress,
    })

    return {
      prompt,
      projectPath,
      files: listProjectFiles(projectPath),
      generateResult,
      error: null,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[qa-harness] Fix error: ${message}`)
    return {
      prompt,
      projectPath,
      files: listProjectFiles(projectPath),
      generateResult: null,
      error: message,
      durationMs: Date.now() - start,
    }
  }
}
