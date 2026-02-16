import { existsSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { QA_PROMPTS } from './qa-prompts'
import { runHarness, runHarnessWithFix } from './qa-harness'
import { judge, issuesToFixPrompt, type JudgeResult } from './qa-judge'
import { checkHealth } from '../packages/agents/src/opencode/server'

const PROJECT_ROOT = join(import.meta.dir, '..')
const REPORT_PATH = join(PROJECT_ROOT, 'qa-report.md')
const MAX_ITERATIONS = 10
const TARGET_SCORE = 100

interface IterationRecord {
  iteration: number
  prompt: string
  files: string[]
  score: number
  checks: Array<{ name: string; passed: boolean; reason: string }>
  issues: string[]
  fixPrompt: string | null
  durationMs: number
}

function appendReport(record: IterationRecord): void {
  const lines = [
    `## Iteration ${record.iteration}`,
    `**Time**: ${new Date().toISOString()}  `,
    `**Duration**: ${(record.durationMs / 1000).toFixed(1)}s  `,
    `**Score**: ${record.score}/100`,
    '',
    '### Prompt',
    `> ${record.prompt}`,
    '',
    '### Generated Files',
    ...record.files.map(f => `- \`${f}\``),
    '',
    '### Check Results',
    '| Check | Result | Detail |',
    '|-------|--------|--------|',
    ...record.checks.map(c => `| ${c.name} | ${c.passed ? '✅' : '❌'} | ${c.reason} |`),
    '',
  ]

  if (record.issues.length > 0) {
    lines.push('### Issues')
    lines.push(...record.issues.map((issue, i) => `${i + 1}. ${issue}`))
    lines.push('')
  }

  if (record.fixPrompt) {
    lines.push('### Fix Prompt Sent')
    lines.push('```')
    lines.push(record.fixPrompt)
    lines.push('```')
    lines.push('')
  }

  lines.push('---', '')

  const block = lines.join('\n')

  if (existsSync(REPORT_PATH)) {
    const existing = readFileSync(REPORT_PATH, 'utf-8')
    writeFileSync(REPORT_PATH, existing + '\n' + block)
  } else {
    const header = `# QA Loop Report\n\nGenerated: ${new Date().toISOString()}\n\n---\n\n`
    writeFileSync(REPORT_PATH, header + block)
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('  QA Loop Runner')
  console.log('='.repeat(60))

  const { healthy, version } = await checkHealth()
  if (!healthy) {
    console.error('❌ OpenCode server not running on localhost:4096')
    console.error('   Start with: opencode server --port 4096')
    process.exit(1)
  }
  console.log(`✅ OpenCode server healthy (v${version})`)

  const prompt = QA_PROMPTS[0]
  if (!prompt) {
    console.error('❌ No QA prompts defined')
    process.exit(1)
  }

  console.log(`\nTarget: score >= ${TARGET_SCORE}, max ${MAX_ITERATIONS} iterations`)
  console.log(`Prompt: Level ${prompt.level} — ${prompt.label}\n`)

  const initialResults = await runHarness([prompt])
  const initial = initialResults[0]
  if (!initial) {
    console.error('❌ Harness returned no results')
    process.exit(1)
  }

  let projectPath = initial.projectPath
  let judgeResult: JudgeResult = judge(projectPath, prompt)

  console.log(`\n[iteration 1] ${judgeResult.summary}`)

  const firstRecord: IterationRecord = {
    iteration: 1,
    prompt: prompt.prompt,
    files: initial.files,
    score: judgeResult.score,
    checks: judgeResult.checks.map(c => ({ name: c.name, passed: c.passed, reason: c.reason })),
    issues: judgeResult.issues,
    fixPrompt: null,
    durationMs: initial.durationMs,
  }
  appendReport(firstRecord)

  if (judgeResult.score >= TARGET_SCORE) {
    console.log(`\n🎉 Target score reached on first try! (${judgeResult.score}/100)`)
    printFinalSummary(1, judgeResult.score, true)
    return
  }

  for (let iteration = 2; iteration <= MAX_ITERATIONS; iteration++) {
    console.log(`\n${'─'.repeat(50)}`)
    console.log(`Iteration ${iteration}/${MAX_ITERATIONS}`)
    console.log(`${'─'.repeat(50)}`)

    const fixPrompt = issuesToFixPrompt(judgeResult.issues, prompt.prompt)
    const fixResult = await runHarnessWithFix(prompt, projectPath, fixPrompt)

    judgeResult = judge(projectPath, prompt)
    console.log(`[iteration ${iteration}] ${judgeResult.summary}`)

    const record: IterationRecord = {
      iteration,
      prompt: fixPrompt,
      files: fixResult.files,
      score: judgeResult.score,
      checks: judgeResult.checks.map(c => ({ name: c.name, passed: c.passed, reason: c.reason })),
      issues: judgeResult.issues,
      fixPrompt: judgeResult.score < TARGET_SCORE ? fixPrompt : null,
      durationMs: fixResult.durationMs,
    }
    appendReport(record)

    if (judgeResult.score >= TARGET_SCORE) {
      console.log(`\n🎉 Target score reached! (${judgeResult.score}/100)`)
      printFinalSummary(iteration, judgeResult.score, true)
      return
    }
  }

  console.log(`\n⚠️  Max iterations reached. Final score: ${judgeResult.score}/100`)
  printFinalSummary(MAX_ITERATIONS, judgeResult.score, false)
}

function printFinalSummary(iterations: number, finalScore: number, passed: boolean): void {
  console.log('\n' + '='.repeat(60))
  console.log('  FINAL SUMMARY')
  console.log('='.repeat(60))
  console.log(`  Result:     ${passed ? '✅ PASS' : '❌ FAIL'}`)
  console.log(`  Score:      ${finalScore}/100`)
  console.log(`  Iterations: ${iterations}`)
  console.log(`  Report:     ${REPORT_PATH}`)
  console.log('='.repeat(60))
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
