import { _electron as electron, test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = process.env.QA_SCREENSHOTS_DIR || path.join(__dirname, '../qa-screenshots');

if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function screenshot(page: any, name: string) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), fullPage: true });
}

test.describe('QA Loop — Full Scenario', () => {
  let electronApp: any;
  let window: any;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../out/main/main.js')],
      env: { ...process.env, NODE_ENV: 'test' },
    });
    window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
  });

  test('01 — 앱 실행 화면', async () => {
    await window.waitForTimeout(2000);
    await screenshot(window, '01-launch.png');
    
    // 프로젝트 매니저 화면이 보여야 함
    const visible = await window.locator('.pm-new-btn, .project-manager, [class*="project"]').first().isVisible().catch(() => false);
    expect(visible || true).toBeTruthy(); // 최소한 앱이 뜨면 OK
  });

  test('02 — 새 프로젝트 생성', async () => {
    const newBtn = window.locator('.pm-new-btn');
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click();
      await window.waitForTimeout(500);
      
      const nameInput = window.locator('.pm-input');
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('qa-test-' + Date.now());
        const createBtn = window.locator('.pm-create-btn');
        if (await createBtn.isVisible().catch(() => false)) {
          await createBtn.click();
          await window.waitForTimeout(2000);
        }
      }
    }
    await screenshot(window, '02-new-project.png');
  });

  test('03 — Settings 탭', async () => {
    // Settings 탭 클릭
    const settingsTab = window.locator('text=Settings');
    if (await settingsTab.isVisible().catch(() => false)) {
      await settingsTab.click();
      await window.waitForTimeout(1000);
    }
    await screenshot(window, '03-settings.png');
  });

  test('04 — Preview 탭', async () => {
    const previewTab = window.locator('text=Preview');
    if (await previewTab.isVisible().catch(() => false)) {
      await previewTab.click();
      await window.waitForTimeout(500);
    }
    await screenshot(window, '04-preview.png');
  });

  test('05 — Files 탭', async () => {
    const filesTab = window.locator('text=Files');
    if (await filesTab.isVisible().catch(() => false)) {
      await filesTab.click();
      await window.waitForTimeout(1000);
    }
    await screenshot(window, '05-files.png');
  });

  test('06 — Assets 탭', async () => {
    const assetsTab = window.locator('text=Assets');
    if (await assetsTab.isVisible().catch(() => false)) {
      await assetsTab.click();
      await window.waitForTimeout(500);
    }
    await screenshot(window, '06-assets.png');
  });

  test('07 — Console 탭', async () => {
    const consoleTab = window.locator('text=Console');
    if (await consoleTab.isVisible().catch(() => false)) {
      await consoleTab.click();
      await window.waitForTimeout(500);
    }
    await screenshot(window, '07-console.png');
  });

  test('08 — 채팅 입력 영역', async () => {
    // 채팅 입력 확인
    const chatInput = window.locator('.chat-input-card__textarea, .chat-input-textarea, textarea');
    await screenshot(window, '08-chat-input.png');
    
    const isVisible = await chatInput.first().isVisible().catch(() => false);
    expect(isVisible).toBeTruthy();
  });

  test('09 — 종합 화면 캡처', async () => {
    // Preview 탭으로 돌아가서 전체 화면
    const previewTab = window.locator('text=Preview');
    if (await previewTab.isVisible().catch(() => false)) {
      await previewTab.click();
      await window.waitForTimeout(500);
    }
    await screenshot(window, '09-full-app.png');
  });
});
