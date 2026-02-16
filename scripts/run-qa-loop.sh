#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "========================================"
echo "  Game Builder — QA Loop"
echo "========================================"
echo ""

echo "Checking OpenCode server health..."
HEALTH=$(curl -s --connect-timeout 3 http://localhost:4096/global/health 2>/dev/null || echo '{}')
HEALTHY=$(echo "$HEALTH" | grep -o '"healthy":true' || true)

if [ -z "$HEALTHY" ]; then
  echo "❌ OpenCode server is not running on localhost:4096"
  echo "   Start it with: opencode server --port 4096"
  exit 1
fi
echo "✅ OpenCode server is healthy"
echo ""

echo "Running QA loop..."
cd "$PROJECT_ROOT"
bun run scripts/qa-loop-runner.ts

echo ""
echo "Done. Report at: $PROJECT_ROOT/qa-report.md"
