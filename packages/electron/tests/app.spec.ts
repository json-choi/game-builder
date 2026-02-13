import { _electron as electron, test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('launch app', async () => {
  const electronApp = await electron.launch({
    args: [path.join(__dirname, '../out/main/main.js')],
  });
  
  const window = await electronApp.firstWindow();
  
  await expect(window.locator('.split-panel')).toBeVisible({ timeout: 10000 });
  
  await expect(window.locator('.left-panel')).toBeVisible();
  await expect(window.locator('.right-panel')).toBeVisible();
  
  await expect(window.locator('.tab-bar').first()).toBeVisible();
  
  await window.screenshot({ path: path.join(__dirname, '../../../.sisyphus/evidence/task-5-shell.png') });
  
  await electronApp.close();
});
