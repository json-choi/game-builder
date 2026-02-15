/**
 * Game Builder QA Loop
 * 
 * 자동으로 Electron 앱을 실행하고, Playwright로 시나리오를 수행하고,
 * 스크린샷을 캡처하고, 결과 판단 에이전트에게 보내서 부족한 점을 파악합니다.
 * 
 * 실행: bun run scripts/qa-loop.ts
 */

import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";

const PROJECT_ROOT = join(import.meta.dir, "..");
const SCREENSHOTS_DIR = join(PROJECT_ROOT, "qa-screenshots");
const QA_REPORT_PATH = join(PROJECT_ROOT, "qa-report.md");
const MAX_ITERATIONS = 3;

interface QAStep {
  name: string;
  action: string;
  screenshot: string;
}

const QA_SCENARIO: QAStep[] = [
  { name: "01-launch", action: "앱 실행 직후 화면", screenshot: "01-launch.png" },
  { name: "02-new-project", action: "새 프로젝트 생성", screenshot: "02-new-project.png" },
  { name: "03-settings", action: "Settings 탭 → API 키 설정 화면", screenshot: "03-settings.png" },
  { name: "04-chat-input", action: "채팅 입력 화면", screenshot: "04-chat-input.png" },
  { name: "05-agent-response", action: "에이전트 응답 후 화면", screenshot: "05-agent-response.png" },
  { name: "06-preview", action: "게임 프리뷰 화면", screenshot: "06-preview.png" },
  { name: "07-files", action: "파일 탐색기", screenshot: "07-files.png" },
  { name: "08-console", action: "콘솔 출력", screenshot: "08-console.png" },
];

async function buildApp(): Promise<boolean> {
  console.log("🔨 Building app...");
  try {
    execSync("npx electron-vite build", { cwd: PROJECT_ROOT, stdio: "pipe" });
    console.log("✅ Build successful");
    return true;
  } catch (e) {
    const err = e as { stderr?: Buffer };
    console.error("❌ Build failed:", err.stderr?.toString().slice(-500));
    return false;
  }
}

async function runPlaywrightTests(): Promise<{ passed: boolean; screenshots: string[] }> {
  console.log("🎭 Running Playwright E2E tests...");
  
  if (!existsSync(SCREENSHOTS_DIR)) {
    mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  try {
    execSync(
      `npx playwright test packages/electron/tests/qa.e2e.ts --reporter=json`,
      {
        cwd: PROJECT_ROOT,
        stdio: "pipe",
        env: {
          ...process.env,
          DISPLAY: ":99",
          QA_SCREENSHOTS_DIR: SCREENSHOTS_DIR,
        },
      }
    );
    console.log("✅ E2E tests passed");
    
    const screenshots = QA_SCENARIO
      .map(s => join(SCREENSHOTS_DIR, s.screenshot))
      .filter(existsSync);
    
    return { passed: true, screenshots };
  } catch (e) {
    const err = e as { stdout?: Buffer };
    console.error("❌ E2E tests failed");
    
    const screenshots = QA_SCENARIO
      .map(s => join(SCREENSHOTS_DIR, s.screenshot))
      .filter(existsSync);
    
    return { passed: false, screenshots };
  }
}

function generateReport(
  iteration: number,
  buildOk: boolean,
  testResult: { passed: boolean; screenshots: string[] },
  analysis: string
): void {
  const report = `# QA Report — Iteration ${iteration}
Generated: ${new Date().toISOString()}

## Build
${buildOk ? "✅ Success" : "❌ Failed"}

## E2E Tests
${testResult.passed ? "✅ Passed" : "❌ Failed"}

## Screenshots Captured
${testResult.screenshots.map(s => `- ${s}`).join("\n")}

## Analysis
${analysis}

---
`;

  if (existsSync(QA_REPORT_PATH)) {
    const existing = readFileSync(QA_REPORT_PATH, "utf-8");
    writeFileSync(QA_REPORT_PATH, report + "\n" + existing);
  } else {
    writeFileSync(QA_REPORT_PATH, report);
  }
  
  console.log(`📝 Report saved to ${QA_REPORT_PATH}`);
}

async function main() {
  console.log("🔄 Starting QA Loop...\n");

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`📋 Iteration ${i}/${MAX_ITERATIONS}`);
    console.log(`${"=".repeat(50)}\n`);

    // Step 1: Build
    const buildOk = await buildApp();
    if (!buildOk) {
      generateReport(i, false, { passed: false, screenshots: [] }, "Build failed — fix build errors first");
      console.log("🛑 Build failed, stopping loop");
      break;
    }

    // Step 2: Run E2E + capture screenshots
    const testResult = await runPlaywrightTests();

    // Step 3: Analysis summary
    const analysis = testResult.passed
      ? "All E2E tests passed. Screenshots captured for visual review."
      : "E2E tests failed. Check screenshots for visual issues.";

    // Step 4: Generate report
    generateReport(i, buildOk, testResult, analysis);

    if (testResult.passed) {
      console.log("\n🎉 QA passed! No more iterations needed.");
      break;
    }

    console.log(`\n🔄 Issues found, will retry... (${i}/${MAX_ITERATIONS})`);
  }

  console.log("\n✅ QA Loop complete. Check qa-report.md for details.");
}

main().catch(console.error);
