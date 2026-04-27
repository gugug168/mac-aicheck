#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$ROOT_DIR/.tmp"
SCAN_JSON="$TMP_DIR/openclaw-smoke-scan.json"

mkdir -p "$TMP_DIR"

echo "[1/6] 环境检查"
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "此脚本只能在 macOS 上运行。" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 node，请先安装 Node.js。" >&2
  exit 1
fi

if ! command -v openclaw >/dev/null 2>&1; then
  echo "未找到 openclaw，请先执行: npm install -g openclaw" >&2
  exit 1
fi

echo "  openclaw: $(openclaw --version)"
echo "  node: $(node --version)"

cd "$ROOT_DIR"

echo "[2/6] 构建 MacAICheck"
npm run build >/dev/null

echo "[3/6] 真实扫描并上传"
node - 2>/dev/null <<'NODE' > "$SCAN_JSON"
const fs = require('node:fs');
const path = require('node:path');
const { scanAll, calculateScore } = require('./dist/scanners/index.js');
const { createPayload, stashData } = require('./dist/api/aicoevo-client.js');

(async () => {
  const results = await scanAll();
  const score = { score: calculateScore(results) };
  const payload = createPayload(results, score);
  let upload = null;
  try {
    upload = await stashData(payload);
  } catch (error) {
    upload = { error: error instanceof Error ? error.message : String(error) };
  }
  fs.writeFileSync(
    path.join(process.cwd(), '.tmp', 'openclaw-smoke-scan.json'),
    JSON.stringify({ score, results, upload }, null, 2) + '\n',
    'utf-8',
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE

node - 2>/dev/null <<'NODE'
const fs = require('node:fs');
const report = JSON.parse(fs.readFileSync('.tmp/openclaw-smoke-scan.json', 'utf-8'));
const byId = new Map(report.results.map((item) => [item.id, item]));
for (const id of ['openclaw', 'openclaw-config-health', 'claude-code', 'claude-config-health']) {
  const item = byId.get(id);
  if (item) console.log(`  ${id}: ${item.status} - ${item.message}`);
}
if (report.upload?.claim_url) {
  console.log(`  upload: ok - ${report.upload.claim_url}`);
} else if (report.upload?.error) {
  console.log(`  upload: warn - ${report.upload.error}`);
}
NODE

echo "[4/6] 启用 OpenClaw Agent Hook"
node dist/agent/index.js enable --target openclaw

echo "[5/6] 验证 shell hook 与命令包装"
if ! grep -q "function openclaw" "$HOME/.zshrc" 2>/dev/null && ! grep -q "function openclaw" "$HOME/.bashrc" 2>/dev/null; then
  echo "未在 shell profile 中找到 openclaw hook。" >&2
  exit 1
fi
zsh -lic 'whence -w openclaw; openclaw --version'

echo "[6/6] 触发一次本地事件并尝试同步"
node dist/agent/index.js capture --agent openclaw --message "OpenClaw smoke test: MCP config missing"
if [[ -f "$HOME/.mac-aicheck/config.json" ]] && grep -q '"authToken"' "$HOME/.mac-aicheck/config.json"; then
  node dist/agent/index.js sync || true
else
  echo "  未检测到 Agent API Key，跳过 sync。先运行: mac-aicheck agent bind --agent openclaw"
fi

echo
echo "Smoke test 完成。详情见: $SCAN_JSON"
