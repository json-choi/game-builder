#!/bin/bash
# Game Builder QA Loop
# Xvfb + Playwright로 Electron 앱 실행 후 스크린샷 캡처

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCREENSHOT_DIR="$PROJECT_ROOT/qa-screenshots"
mkdir -p "$SCREENSHOT_DIR"

echo "🔨 Step 1: Build..."
cd "$PROJECT_ROOT"
npx electron-vite build 2>&1 | tail -5

echo ""
echo "🎭 Step 2: Run QA E2E tests with Xvfb..."
export QA_SCREENSHOTS_DIR="$SCREENSHOT_DIR"

xvfb-run --auto-servernum --server-args="-screen 0 1280x720x24" \
  npx playwright test packages/electron/tests/qa.e2e.ts \
  --config packages/electron/playwright.config.ts \
  --timeout 30000 \
  --reporter=list \
  2>&1 || true

echo ""
echo "📸 Step 3: Screenshots captured:"
ls -la "$SCREENSHOT_DIR"/*.png 2>/dev/null || echo "No screenshots found"

echo ""
echo "✅ QA run complete. Screenshots in: $SCREENSHOT_DIR"
