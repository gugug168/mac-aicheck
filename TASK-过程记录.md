# mac-aicheck: Hermes Delegation Direction B — 过程记录

**Started:** 2026-05-12
**Goal:** 完成 mac-aicheck Hermes Agent 集成（Direction B）
**Stopping condition:** E2E test 通过，Hermes 能被 MacAICheck 派发任务并返回结果
**Token Budget:** 不限
**Branch:** `feat/hermes-delegation-direction-b`（从 `feat/upgrade-v0-3-18-parity` 新建）

---

## Agent Assignment

- Claude Code → 所有实现任务
- Hermes → 协调、审查、最终验收

---

## Task List

| # | Task | Agent | Status | Verification |
|---|------|-------|--------|-------------|
| T1 | Fix hermes.ts bugs + complete scanner | claude-code | ready | tsc --noEmit 无错误 |
| T2 | Write hermes installer | claude-code | blocked | tsc --noEmit 无错误 |
| T3 | Write delegation service | claude-code | blocked | delegateTask() 能执行 hermes chat -q |
| T4 | Write IPC channel | claude-code | blocked | watcher 检测到结果文件 |
| T5 | Register modules + CLI | claude-code | blocked | npm run build 成功 + CLI help |
| T6 | E2E test full flow | claude-code | blocked | 全流程跑通 |

---

## Dependency Chain

```
T1 (hermes.ts fix)
  ├── T2 (installer)
  ├── T3 (delegation service)
  ├── T4 (IPC channel)
  ├── T5 (CLI registration)
  └── T6 (E2E test)
```

T2-T6 串行依赖：T2→T3→T4→T5→T6
T2-T6 均依赖 T1 完成

---

## Kanban Board

- Board task: `t_29fc6c88` — mac-aicheck: Hermes Delegation Direction B
- T1: `t_ca70a804`
- T2: `t_930b68bb`
- T3: `t_df0f468b`
- T4: `t_86080c32`
- T5: `t_513b542e`
- T6: `t_63e5d6d5`

---

## Architecture Overview

```
mac-aicheck CLI
  ├── hermes scan  → src/scanners/hermes.ts
  ├── hermes install → src/installers/hermes.ts
  ├── hermes-delegate → src/agent/hermes/hermes-delegation.ts
  │                      ↓ spawn hermes chat -q "..."
  │                      ↓ IPC: ~/.mac-aicheck/hermes-results/{task_id}.json
  │                    Hermes Agent
  └── hermes-results → src/agent/hermes/hermes-ipc.ts
```

## Hermes Bridge (hermes chat -q)

```bash
# 非交互命令模式（已验证可用）
hermes chat -q "<goal>" -t terminal --provider minimax
```

---

## Context from Previous Session

- PR #89 分支：`feat/upgrade-v0-3-18-parity`（已合并 P0 修复）
- 新分支：`feat/hermes-delegation-direction-b`（当前分支）
- Hermes 路径：`/Users/gugu/hermes-agent`
- Hermes 可用命令：`hermes chat -q "..."` 非交互模式验证通过
- `hermes.ts` 已有但有 3 个 bug：
  1. Line 28: `stdio ['pipe'...]` 缺冒号
  2. Line 28: `timeout: timeout * 1000` 应为 `timeout`
  3. checkDelegateHealth() 的 stdio 也可能有类似问题

---

## PR #89 遗留问题（Direction B 范围外）

- `bind.ts` / `agent-client.ts` 缺失（M1 milestone）
- env_fingerprint 性能问题

---

## Execution Log

### 2026-05-12 — Session Start
- 创建分支 `feat/hermes-delegation-direction-b`（从 c7f96d6）
- 确认 worktree 干净（仅 src/scanners/hermes.ts untracked）
- 创建看板 + 6 个任务（T1-T6）
- 建立依赖链：T1→T2→T3→T4→T5→T6

### 2026-05-12 — Phase 3 Execution (Claude Code 执行)

| Task | Agent | Duration | Result |
|------|-------|----------|--------|
| T1 Fix hermes.ts | claude-code | ~10min | ✅ 原有 bug 已修复（c0e1237）；新增 ES module import 问题，修复后通过 |
| T2 Hermes installer | claude-code | ~4min | ✅ src/installers/hermes.ts 创建并注册 |
| T3 Delegation service | claude-code | ~1.5min | ✅ src/agent/hermes/hermes-delegation.ts，含 ES module fix |
| T4 IPC channel | claude-code | ~25s | ✅ src/agent/hermes/hermes-ipc.ts 创建 |
| T5 CLI registration | claude-code | ~3.5min | ✅ `mac-aicheck agent hermes-delegate` 命令注册成功 |
| T6 E2E test | claude-code | ~3min | ✅ E2E 全流程测试通过（2/2） |

### 2026-05-12 — Phase 5 Final Review
- PR #90 创建：https://github.com/gugug168/mac-aicheck/pull/90
- Branch pushed to origin
- Build: ✅ `npm run build` passes
- All 7 commits verified on `feat/hermes-delegation-direction-b`

## Final State: ✅ COMPLETE

### Commits (7 total on this branch)
```
8ba6950 feat(cli): add hermes-delegate CLI command and register all Hermes modules
783018a feat(ipc): add HermesResultWatcher for IPC result channel
fccbc15 feat(delegation): add HermesDelegationService for task dispatch
ee49c75 feat(installer): add Hermes Agent installer
1a1baac feat: 实现 Hermes 安装器
af47a98 fix(hermes-scanner): fix stdio syntax and timeout unit bugs
c7f96d6 fix: correct MAC_AICHECK_BASE_DIR env var typos (P0)
```

### Deliverables
- ✅ Scanner: `src/scanners/hermes.ts` — 检测 Hermes 版本/路径/能力
- ✅ Installer: `src/installers/hermes.ts` — 安装/升级 Hermes
- ✅ Delegation: `src/agent/hermes/hermes-delegation.ts` — 任务派发
- ✅ IPC: `src/agent/hermes/hermes-ipc.ts` — 结果回报通道
- ✅ CLI: `mac-aicheck agent hermes-delegate "<goal>"` 命令

### E2E Results
```
mac-aicheck agent hermes-delegate "Create a file at /tmp/test.txt with content 'hello'" --timeout 60000
✅ Success (34024ms) — 文件内容正确
```
