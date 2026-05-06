#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${AICHECK_SMOKE_OUTPUT_DIR:-$ROOT_DIR/.tmp/tool-event-smoke}"
HOME_DIR="$OUTPUT_DIR/home"
ONLINE_API_BASE="${AICOEVO_API_BASE:-https://www.aicoevo.net/api/v1}"
OFFLINE_API_BASE="${AICHECK_OFFLINE_API_BASE:-https://offline.invalid/api/v1}"
WEB_PORT="${AICHECK_SMOKE_WEB_PORT:-17890}"
SCANNER_ID="${AICHECK_SMOKE_SCANNER_ID:-missing-smoke-fixer-mac}"
VERIFY_SCRIPT="${AICHECK_VERIFY_SCRIPT:-}"

export HOME="$HOME_DIR"
mkdir -p "$OUTPUT_DIR" "$HOME_DIR"

function section() {
  printf '\n[%s] %s\n' "$1" "$2"
}

function require_macos() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "此脚本只能在 macOS 上运行。" >&2
    exit 1
  fi
}

function build_repo() {
  section "1/7" "构建 MacAICheck"
  cd "$ROOT_DIR"
  npm run build >/dev/null
}

function write_metadata() {
  section "2/7" "记录环境信息"
  {
    echo "{"
    echo "  \"date\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
    echo "  \"pwd\": \"$(pwd)\","
    echo "  \"node\": \"$(node --version)\","
    echo "  \"npm\": \"$(npm --version)\","
    echo "  \"git_head\": \"$(git rev-parse HEAD)\","
    echo "  \"online_api_base\": \"${ONLINE_API_BASE}\","
    echo "  \"offline_api_base\": \"${OFFLINE_API_BASE}\","
    echo "  \"web_port\": ${WEB_PORT}"
    echo "}"
  } > "$OUTPUT_DIR/metadata.json"
}

function run_machine_origin() {
  section "3/7" "触发 machine-origin 自动上报"
  export AICOEVO_API_BASE="$ONLINE_API_BASE"
  node "$ROOT_DIR/dist/agent/index.js" report-tool-event \
    --step claim \
    --failed-items bounty-claim \
    --status error \
    --event-type step_failed \
    --claim-id live-smoke-mac \
    --message "claim failed: live smoke" \
    --content "claim failed for live smoke" \
    --command-summary "mac-aicheck agent bounty-claim live-smoke-mac" \
    | tee "$OUTPUT_DIR/machine-origin-report.json"
}

function run_offline_queue_and_flush() {
  section "4/7" "触发 offline -> queue -> flush"
  export AICOEVO_API_BASE="$OFFLINE_API_BASE"
  node "$ROOT_DIR/dist/agent/index.js" report-tool-event \
    --step bind \
    --failed-items bind-request \
    --status error \
    --event-type step_failed \
    --message "bind failed: offline live smoke" \
    --content "bind failed for offline live smoke" \
    | tee "$OUTPUT_DIR/offline-response.json" || true

  cp "$HOME_DIR/.mac-aicheck/uploads/tool-feedback-queue.json" "$OUTPUT_DIR/offline-queue-before-flush.json"
  node - "$HOME_DIR/.mac-aicheck/uploads/tool-feedback-queue.json" "$OUTPUT_DIR/offline-payload.json" <<'NODE'
const fs = require('node:fs');
const queuePath = process.argv[2];
const outputPath = process.argv[3];
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const queued = queue.find((item) => item && item.state === 'queued' && item.payload);
if (!queued) {
  throw new Error('offline queue payload not found');
}
fs.writeFileSync(outputPath, JSON.stringify(queued.payload, null, 2) + '\n', 'utf8');
NODE

  node - "$HOME_DIR/.mac-aicheck/uploads/tool-feedback-queue.json" <<'NODE'
const fs = require('node:fs');
const queuePath = process.argv[2];
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
for (const item of queue) {
  if (item.state === 'queued') item.nextAttemptAt = '2000-01-01T00:00:00.000Z';
}
fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2) + '\n', 'utf8');
NODE

  export AICOEVO_API_BASE="$ONLINE_API_BASE"
  node "$ROOT_DIR/dist/agent/index.js" sync | tee "$OUTPUT_DIR/offline-flush-response.json" || true

  cp "$HOME_DIR/.mac-aicheck/uploads/tool-feedback-queue.json" "$OUTPUT_DIR/offline-queue-after-flush.json"
}

function run_web_fix_failure() {
  section "5/7" "触发 Web /api/fix 失败自动上报"
  export AICOEVO_API_BASE="$ONLINE_API_BASE"
  export PORT="$WEB_PORT"
  local server_log="$OUTPUT_DIR/web-serve.log"
  : > "$server_log"
  node "$ROOT_DIR/dist/index.js" --serve >"$server_log" 2>&1 &
  local server_pid=$!

  cleanup() {
    kill "$server_pid" >/dev/null 2>&1 || true
    wait "$server_pid" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT

  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:${WEB_PORT}/api/version-check" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  curl -fsS -X POST \
    -H 'Content-Type: application/json' \
    -d "{\"scannerId\":\"${SCANNER_ID}\"}" \
    "http://127.0.0.1:${WEB_PORT}/api/fix" \
    | tee "$OUTPUT_DIR/web-fix-response.json" || true

  cp "$HOME_DIR/.mac-aicheck/uploads/tool-feedback-queue.json" "$OUTPUT_DIR/web-queue-after-fix.json" || true
  node - "$HOME_DIR/.mac-aicheck/uploads/tool-feedback-queue.json" "$SCANNER_ID" "$OUTPUT_DIR/web-fix-payload.json" <<'NODE'
const fs = require('node:fs');
const queuePath = process.argv[2];
const scannerId = process.argv[3];
const outputPath = process.argv[4];
if (!fs.existsSync(queuePath)) process.exit(0);
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const matched = queue.find((item) => {
  const failedItems = item?.payload?.env_summary?.failed_items;
  return Array.isArray(failedItems) && failedItems.includes(scannerId);
});
if (!matched?.payload) process.exit(0);
fs.writeFileSync(outputPath, JSON.stringify(matched.payload, null, 2) + '\n', 'utf8');
NODE

  cleanup
  trap - EXIT
}

function run_optional_verifier() {
  if [[ -z "$VERIFY_SCRIPT" ]]; then
    return
  fi
  if [[ ! -f "$VERIFY_SCRIPT" ]]; then
    echo "跳过校验：未找到 VERIFY_SCRIPT=$VERIFY_SCRIPT"
    return
  fi

  section "6/7" "运行字段校验脚本"
  python3 "$VERIFY_SCRIPT" "$OUTPUT_DIR/machine-origin-report.json" --expected-product mac-aicheck \
    | tee "$OUTPUT_DIR/machine-origin-verify.md" || true
  python3 "$VERIFY_SCRIPT" "$OUTPUT_DIR/offline-payload.json" --expected-product mac-aicheck \
    | tee "$OUTPUT_DIR/offline-payload-verify.md" || true
  if [[ -f "$OUTPUT_DIR/web-fix-payload.json" ]]; then
    python3 "$VERIFY_SCRIPT" "$OUTPUT_DIR/web-fix-payload.json" --expected-product mac-aicheck \
      | tee "$OUTPUT_DIR/web-fix-payload-verify.md" || true
  fi
}

function print_summary() {
  section "7/7" "完成"
  echo "输出目录: $OUTPUT_DIR"
  echo "关键文件:"
  echo "  - metadata.json"
  echo "  - machine-origin-report.json"
  echo "  - machine-origin-verify.md"
  echo "  - offline-response.json"
  echo "  - offline-payload.json"
  echo "  - offline-payload-verify.md"
  echo "  - offline-queue-before-flush.json"
  echo "  - offline-flush-response.json"
  echo "  - offline-queue-after-flush.json"
  echo "  - web-fix-response.json"
  echo "  - web-fix-payload.json"
  echo "  - web-fix-payload-verify.md"
  echo "  - web-queue-after-fix.json"
  echo "  - web-serve.log"
}

require_macos
build_repo
write_metadata
run_machine_origin
run_offline_queue_and_flush
run_web_fix_failure
run_optional_verifier
print_summary
