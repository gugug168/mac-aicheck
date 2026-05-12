# Goal: 让 mac-aicheck 成为 AICO EVO 任务节点（Hermes 监控版）

**Goal:** 将 mac-aicheck 从「Claude Code 质量监控工具」升级为「AICO EVO 自主任务节点」，能监控 Hermes Agent 运行错误、上报平台、接收 Bounty 任务并自动完成，同时支持 Review 评审循环。

**Stop Condition:** `node dist/index.js agent bind` 成功 → `node dist/index.js agent status` 显示 `connected: true` + `bounty-auto --dry-run` 能获取推荐 bounty → Hermes 错误能通过 hook 上报到 AICO EVO

**参考架构:** `~/projects/WinAICheck/src/agent/embedded-agent-lite-source.ts`（223KB 自包含 JS daemon）

---

## Milestone 1: OAuth Bind + Config 系统

**Objective:** 建立 mac-aicheck 到 AICO EVO 的设备绑定流程，保存 authToken 和 profileId，支持 `agent status` 查询连接状态。

**Deliverables:**
- Create: `src/agent/bind.ts` — OAuth 设备流 bind 命令（POST /bind/request → 打开浏览器 → poll /bind/poll → 保存 config）
- Create: `src/agent/config.ts` — 配置读写（`~/.mac-aicheck/agent-config.json`：`{authToken, profileId, deviceId, shareData, autoSync, paused}`)
- Modify: `src/index.ts` — 新增 `agent bind` + `agent status` 命令
- Create: `src/api/agent-client.ts` — `agentApiBase()`、`apiKeyHeaders()`、`heartbeatAgentV2()`、`requestJson()` 工具函数

**Acceptance Criteria:**
- [x] `mac-aicheck agent bind` 能发起 OAuth 设备流（自动打开浏览器）— **verify:** `curl -s http://localhost:PORT/bind` 返回 confirm_url
- [x] 绑定成功后 `~/.mac-aicheck/agent-config.json` 存在且含 `authToken` + `profileId` — **verify:** `cat ~/.mac-aicheck/agent-config.json | grep authToken`
- [x] `mac-aicheck agent status` 显示 `{connected, profileId, deviceId}` — **verify:** `node dist/index.js agent status` 输出 JSON 含 `connected`
- [x] 未 bind 时 `mac-aicheck agent status` 输出 `connected: false` — **verify:** 删除 config 后运行 status

> ✅ M1 COMPLETED (2026-05-13)

**Constraints:**
- Do NOT modify: `src/api/aicoevo-client.ts`（现有 scan/fix API）
- Do NOT change: `src/agent/index.ts`（现有 hook 相关代码）
- 只用 Node.js stdlib（无外部依赖）

**Verification Command:** `node dist/index.js agent status` → expected: `{"connected":false}` 或 `{"connected":true,"profileId":"..."}`

---

## Milestone 2: embedded-agent-lite.js — 自包含 Agent Daemon

**Objective:** 创建 mac-aicheck 版的 `agent-lite.js`（类似 WinAICheck 的 `embedded-agent-lite-source.ts`），作为独立 Node.js 进程运行，支持心跳、错误捕获上报、Bounty 循环、Review 循环。

**Deliverables:**
- Create: `src/agent/embedded-agent-source.ts` — 导出 `AGENT_LITE_SOURCE`（JS string）+ `AGENT_LITE_HASH`；写入 `~/.mac-aicheck/agent/agent-lite.js`
- Create: `src/agent/embedded-agent-manager.ts` — agent-lite 生命周期管理（install/upgrade/uninstall/start/stop/status/daemon）
- Create: `src/agent/commands.ts` — agent 子命令：`daemon`（后台运行）、`start`、`stop`、`status`
- Modify: `src/index.ts` — 新增 `agent daemon` 命令入口
- Create: `src/agent/heartbeat.ts` — `heartbeatAgentV2()`：POST /agent/heartbeat（v2），返回 `recommended_bounties`、`pending_owner_verifications`
- Create: `src/agent/event-outbox.ts` — 事件队列（`~/.mac-aicheck/outbox/events.jsonl`）+ `flushEvents()` 上报 + 重试逻辑

**Acceptance Criteria:**
- [ ] `mac-aicheck agent daemon` 能以后台进程启动 — **verify:** `node dist/index.js agent daemon &` + `sleep 3` + `ps aux | grep agent-lite`
- [ ] `~/.mac-aicheck/agent/agent-lite.js` 文件存在且可执行 — **verify:** `ls -la ~/.mac-aicheck/agent/agent-lite.js`
- [ ] `agent daemon` 启动后 30s 内发出第一次 heartbeat — **verify:** `tail -f ~/.mac-aicheck/logs/agent.log` 或 `curl localhost:PORT/health`
- [ ] `agent stop` 能停止 daemon — **verify:** `node dist/index.js agent stop` + 进程消失

**Constraints:**
- Do NOT bundle the full WinAICheck agent-lite source — write a mac-aicheck specific version
- agent-lite.js 必须兼容 macOS（WinAICheck 有 Windows 特定代码如 `cmd.exe /c start`）
- 不使用任何 npm 外部依赖（纯 Node.js stdlib）
- agent-lite.js 写入 `~/.mac-aicheck/agent/` 目录

**Verification Command:** `node dist/index.js agent daemon & sleep 5 && node dist/index.js agent status` → expected: daemon status 显示 running

---

## Milestone 3: Hermes 错误捕获 Hook 扩展

**Objective:** 扩展 mac-aicheck 的 hook 系统，使其能捕获 Hermes Agent 运行中的错误，不仅仅是 Claude Code。

**Deliverables:**
- Create: `src/agent/hermes-error-hook.ts` — Hermes 错误 hook：解析 Hermes 日志/事件，提取错误信号，分类为 tool_missing/config_breakage/network_instability/auth_failure/perf_bottleneck/capability_gap
- Create: `src/agent/hermes-listener.ts` — Hermes 事件监听器：支持两种模式（A）CLI call 模式：Hermes 调用 `mac-aicheck agent report-error --json '{"type":"hermes-error",...}'` 写入 outbox；（B）MCP callback 模式：mac-aicheck 暴露 MCP 工具 `report_hermes_error`，Hermes 通过 MCP 调用
- Create: `src/agent/hermes-report-error.ts` — `agent report-error` CLI 命令：从 stdin（`echo '...' | mac-aicheck agent report-error`）或 `--json` flag 读取错误事件，写入 `~/.mac-aicheck/outbox/hermes-events.jsonl`；daemon 定期合并到主 `events.jsonl`
- Modify: `src/agent/index.ts` — 新增 `agent hermes-connect` 命令（配置 Hermes 错误上报路径）、`agent hermes-status` 命令、`agent report-error` 命令
- Create: `hooks-src/hermes-error-hook.js` — Hermes 用的轻量 hook 脚本（类似现有的 `post-tool-hook.js`）
- Create: `src/agent/sanitizer.ts` — 敏感信息脱敏（复用 WinAICheck 的 26 个 SENSITIVE_PATTERNS adapted for macOS/Hermes）

**Acceptance Criteria:**
- [ ] `mac-aicheck agent hermes-connect` 命令存在并可执行 — **verify:** `node dist/index.js agent hermes-connect --help`
- [ ] Hermes 错误能被捕获并写入 `~/.mac-aicheck/outbox/hermes-events.jsonl`（daemon 合并到 `events.jsonl`）— **verify:** `echo '{"type":"hermes-error","kind":"auth_failure","message":"401 invalid api key"}' | node dist/index.js agent report-error --json -` + `cat ~/.mac-aicheck/outbox/hermes-events.jsonl | wc -l` > 0
- [ ] 错误信号被正确分类（6 类 signal kind）— **verify:** 查看 events.jsonl 中每条事件的 `signal.kind` 字段
- [ ] 敏感信息被脱敏（API keys, tokens, file paths, emails）— **verify:** `grep -E "sk-|ghp_|Bearer" ~/.mac-aicheck/outbox/events.jsonl` 应无输出
- [ ] MCP callback 模式：`mac-aicheck agent mcp serve` 启动 MCP 服务器（提供 `report_hermes_error` 工具）— **verify:** `mac-aicheck agent mcp serve --help` 存在
- [ ] Hermes 日志路径约定：`~/.hermes/logs/` — mac-aicheck 通过 tail 监听 Hermes 错误 — **verify:** 约定路径写在 `docs/hermes-integration.md`

**Constraints:**
- Do NOT require Hermes to be modified beyond configuring a webhook/callback to mac-aicheck CLI
- Hermes 错误上报支持两种模式：Hermes主动调用mac-aicheck CLI（CLI mode），或通过 MCP callback（server mode）
- 不修改 Hermes Agent 核心代码（Hermes 是另一个用户的项目）

**Verification Command:** `node dist/index.js agent hermes-status` → expected: `{"hermesConnected":false}` 或 `{"hermesConnected":true,"errorCount":N}`

---

## Milestone 4: Bounty 任务循环

**Objective:** 实现 WinAICheck 风格的 Bounty 循环：`bounty-recommended` → `bounty-claim` → `bounty-solve`（KB匹配）→ `bounty-submit`，支持 `bounty-auto` 自动模式。

**Deliverables:**
- Create: `src/agent/bounty-commands.ts` — bounty 子命令实现（list/recommended/claim/submit/release/auto）
- Create: `src/agent/bounty-options.ts` — CLI options 类型定义，包含 `--dry-run` flag（只推荐+KB匹配，不实际 claim/submit）
- Modify: `src/agent/embedded-agent-source.ts` — 在 agent-lite 中注册 bounty 命令处理
- Create: `src/api/bounty-client.ts` — AICO EVO Bounty API 封装（GET /bounties、POST /bounties/{id}/claim、POST /bounties/{id}/submit、POST /bounties/{id}/auto-solve）
- Create: `src/agent/bounty-kb.ts` — KB 自动匹配：利用 mac-aicheck 已有 fixer 知识库，对 bounty 描述匹配已有解决方案
- Modify: `src/index.ts` — 新增 `agent bounty-list` / `bounty-recommended` / `bounty-claim` / `bounty-submit` / `bounty-auto` 命令

**Acceptance Criteria:**
- [ ] `mac-aicheck agent bounty-list` 能获取 bounty 列表 — **verify:** `node dist/index.js agent bounty-list | python3 -m json.tool | grep bounty_id`
- [ ] `mac-aicheck agent bounty-recommended` 返回推荐 bounty（需先 bind）— **verify:** `node dist/index.js agent bounty-recommended --limit 3`
- [ ] `mac-aicheck agent bounty-auto --dry-run` 能显示推荐 + KB匹配结果但不实际认领 — **verify:** 命令成功执行且输出含 KB matched/not matched
- [ ] KB 匹配逻辑：若 bounty 问题与本地 experience.jsonl 匹配，自动返回已有答案 — **verify:** 人工验证逻辑路径

**Constraints:**
- Do NOT claim 或 submit 真实 bounty（在 dry-run 验证通过前）
- KB 匹配优先使用 mac-aicheck 本地 experience.jsonl，再调用 AICO EVO API

**Verification Command:** `node dist/index.js agent bounty-recommended --limit 5` → expected: JSON 输出含 `items` 数组

---

## Milestone 5: Review 评审循环 + Owner 验证

**Objective:** 实现 Review 循环（`review-list` → `review-submit`）和 Owner 验证循环（`owner-check` → `owner-verify`），支持 `review-auto`。

**Deliverables:**
- Create: `src/agent/review-commands.ts` — review-list / review-submit / review-auto 命令
- Create: `src/agent/owner-commands.ts` — owner-check / owner-verify 命令（复现验证）
- Modify: `src/agent/embedded-agent-source.ts` — 在 agent-lite 中注册 review/owner 命令
- Modify: `src/index.ts` — 新增 `agent review-list` / `review-submit` / `review-auto` / `owner-check` / `owner-verify` 命令
- Create: `src/agent/validation-automation.ts` — 本地验证自动化：给定验证命令，在本机执行并返回 pass/fail

**Acceptance Criteria:**
- [ ] `mac-aicheck agent review-list` 能获取待评审任务（需先 bind）— **verify:** `node dist/index.js agent review-list`
- [ ] `mac-aicheck agent owner-check` 能获取待复现验证的问题列表 — **verify:** `node dist/index.js agent owner-check`
- [ ] `mac-aicheck agent review-submit <lease_id> --result success` 提交成功（dry-run 模式）— **verify:** API 调用成功（mock 或真实）

**Constraints:**
- Do NOT 对真实 review/owner 任务做自动化决策 — 必须人工确认
- review-submit 必须有 `--result success|partial|failed` 确认步骤

**Verification Command:** `node dist/index.js agent review-list` → expected: JSON 输出含 `items` 或 `[]`

---

## Milestone 6: Worker Daemon + Draft Organizer 集成

**Objective:** 将 mac-aicheck 已有 Worker daemon（`src/agent/index.ts` 行2688-2759）和 Draft Organizer（行2234+）接入 embedded-agent，实现持续心跳 + 定期扫描 + Bounty 自动循环的后台运行。

**Deliverables:**
- Modify: `src/agent/embedded-agent-source.ts` — 在 agent-lite 主循环中加入 worker heartbeat（每5分钟）+ draft-organizer 触发
- Modify: `src/agent/index.ts` — 扩展 Worker daemon：支持 `worker status` 显示 agent 连接状态、显示上次心跳时间
- Create: `src/agent/worker-agent-integration.ts` — Worker daemon 与 embedded-agent 的状态同步（共享 `~/.mac-aicheck/agent/worker-state.json`）
- Modify: `src/agent/draft-organizer.ts` — Draft Organizer 支持被 agent-lite 调用（`runDraftOrganizerOnce` 已存在，确认可用）
- Create: `src/agent/agent-automation.ts` — 配置项：`workerEnabled`、`draftOrganizerEnabled`、`autoBountyEnabled`，控制各循环开关

**Acceptance Criteria:**
- [ ] `mac-aicheck agent worker status` 显示 worker 配置 + agent 连接状态 — **verify:** `node dist/index.js agent worker status`
- [ ] Worker daemon 运行时，每 5 分钟发送一次 heartbeat — **verify:** `tail ~/.mac-aicheck/outbox/events.jsonl` 或日志中有心跳记录
- [ ] `draft-organizer run-once` 能被 agent-lite 触发 — **verify:** 单独运行成功
- [ ] `agent daemon` 退出后 Worker 状态正确保存 — **verify:** daemon 重启后 worker status 显示正确

**Constraints:**
- Do NOT 重写已有 Worker daemon 核心逻辑 — 只扩展其与 agent-lite 的集成
- Worker daemon 必须独立于 agent-lite 运行（解耦）

**Verification Command:** `node dist/index.js agent worker status` → expected: JSON 含 `workerEnabled`、`paused`、`worker` 对象

---

## Milestone 7: 端到端验证 + PR

**Objective:** 完整端到端测试：bind → 心跳上报 → Hermes 错误捕获 → Bounty 接任务 → 提交答案 → Review，验证全链路连通性后提交 PR。

**Deliverables:**
- Modify: `src/installers/index.ts` — 更新 hermes-agent 安装器，添加 `mac-aicheck agent bind` + `mac-aicheck agent daemon` 引导流程
- Update: `README.md` / `CHANGELOG.md` — 记录新功能
- Create: `docs/hermes-integration.md` — 说明 Hermes 如何连接 mac-aicheck（Hermes 配置错误回调到 mac-aicheck CLI 的方法）
- Create: `tests/agent-e2e.test.ts` — 端到端测试：bind → status → bounty-recommended → worker status
- Create: `tests/hermes-hook.test.ts` — Hermes hook 测试：模拟 Hermes 错误事件 → 验证写入 events.jsonl
- Submit: PR 到 `https://github.com/gugug168/mac-aicheck`

**Acceptance Criteria:**
- [ ] `mac-aicheck agent status` 显示 `connected: true`（真实 bind 或 mock）— **verify:** `node dist/index.js agent status`
- [ ] `mac-aicheck agent bounty-recommended --limit 3` 返回结果 — **verify:** 命令成功执行
- [ ] `mac-aicheck agent worker status` 显示 worker + agent 双状态 — **verify:** JSON 输出含 worker + agent 信息
- [ ] Hermes 错误事件写入 outbox — **verify:** `echo '{"type":"hermes-error","message":"test"}' | mac-aicheck agent report-error` + `grep hermmes-error ~/.mac-aicheck/outbox/events.jsonl`
- [ ] PR 提交到 GitHub — **verify:** `gh pr list --repo gugug168/mac-aicheck` 含新 PR

**Constraints:**
- Do NOT hardcode 任何真实 API keys
- 测试必须可重复执行（幂等）
- Do NOT push to main — 所有工作在 feature branch

**Verification Command:** `npm run build && npm test -- --grep "agent"` → expected: all tests passed

---

## Notes

- **Hermes 集成接口（关键）**：
  - **CLI 模式（推荐）**：Hermes 报错时调用 `mac-aicheck agent report-error --json '{"type":"hermes-error","kind":"auth_failure","message":"..."}'`，mac-aicheck 写入 `~/.mac-aicheck/outbox/hermes-events.jsonl`，daemon 定期合并到 `events.jsonl` 再上报 AICO EVO
  - **MCP 模式**：mac-aicheck 启动 MCP 服务器（`agent mcp serve`），Hermes 通过 MCP 调用 `report_hermes_error` 工具
  - **Log tail 模式**：mac-aicheck tail `~/.hermes/logs/` 下的 Hermes 日志文件，提取错误行并上报
- **OpenClaw 澄清**：WinAICheck 里 OpenClaw 只是一个 scanner 检测，不是 agent 集成点。mac-aicheck 的 Hermes 集成也不依赖修改 Hermes 源码，而是 Hermes 主动调用 mac-aicheck CLI 或通过 MCP
- **AICO EVO API 端点**（来自 WinAICheck embedded-agent）：`https://aicoevo.net` + `/bind/request`、`/bind/poll`、`/agent/heartbeat (v2)`、`/bounties`、`/reviews/recommended`
- **Secret 脱敏**：复用 WinAICheck 的 26 个 SENSITIVE_PATTERNS，针对 macOS 调整（`/Users/` 而非 `C:\Users\`）
