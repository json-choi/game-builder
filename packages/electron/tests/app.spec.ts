import { _electron as electron, test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('launch app, create project, and verify chat response', async () => {
  const electronApp = await electron.launch({
    args: [path.join(__dirname, '../out/main/main.js')],
  });

  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  const screenshotDir = path.join(__dirname, '../test-results');

  const newProjectBtn = window.locator('.pm-new-btn');
  await expect(newProjectBtn).toBeVisible({ timeout: 10000 });
  await newProjectBtn.click();

  const nameInput = window.locator('.pm-input');
  await expect(nameInput).toBeVisible();
  await nameInput.fill('test-chat-' + Date.now());

  const createBtn = window.locator('.pm-create-btn');
  await createBtn.click();

  const chatInput = window.locator('.chat-input-textarea');
  await expect(chatInput).toBeVisible({ timeout: 10000 });

  await window.screenshot({ path: path.join(screenshotDir, 'chat-visible.png') });

  await chatInput.fill('Say "hello" and nothing else.');
  const sendBtn = window.locator('.chat-send-btn');
  await sendBtn.click();

  await window.screenshot({ path: path.join(screenshotDir, 'chat-message-sent.png') });

  const assistantMessage = window.locator('.chat-message--assistant .chat-message-content');

  await expect(async () => {
    const text = await assistantMessage.first().innerText();
    expect(text.trim().length).toBeGreaterThan(0);
  }).toPass({ timeout: 60000, intervals: [1000, 2000, 5000] });

  await window.screenshot({ path: path.join(screenshotDir, 'chat-response-final.png') });

  const messageCount = await window.locator('.chat-message').count();
  expect(messageCount).toBe(2);

  const userText = await window.locator('.chat-message--user .chat-message-content').innerText();
  expect(userText).toContain('hello');

  const responseText = await assistantMessage.first().innerText();
  expect(responseText.trim().length).toBeGreaterThan(0);

  await electronApp.close();
});
