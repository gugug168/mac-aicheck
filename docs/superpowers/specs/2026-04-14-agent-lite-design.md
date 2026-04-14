# mac-aicheck Agent Lite 实现设计

**日期**: 2026-04-14
**目标**: 为 mac-aicheck 实现与 WinAICheck 完全对齐的 Agent Lite 监控功能

---

## 1. 背景与目标

WinAICheck 已实现完整的 Agent Lite 监控功能：
- PowerShell profile hook 拦截 AI agent 调用
- 本地错误捕获、脱敏、fingerprint 生成
- 批量上传到 aicoevo.net `/api/v1/agent-events/batch`
- 服务端返回 AI 修复建议（advice）

mac-aicheck 需要实现相同功能，适配 macOS（zsh/bash）。

---

## 2. 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    mac-aicheck Agent 系统                      │
├─────────────────────────────────────────────────────────────┤
│  ~/.zshrc / ~/.bashrc                                        │
│    alias claude='mac-aicheck-agent run --agent claude-code' │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  mac-aicheck-agent (独立 Node.js 进程)                       │
│    ├── 解析 --agent, --original 参数                          │
│    ├── 验证本地 runner 完整性 (SHA256 hash)                   │
│    ├── spawn 原始 claude 命令，捕获 stderr                    │
│    ├── 脱敏 + 生成 fingerprint                                │
│    ├── 本地存储 events.jsonl + daily/*.json                   │
│    ├── sync 时批量上传到 /api/v1/agent-events/batch           │
│    └── 写入 advice 到 ~/.mac-aicheck/advice/                 │
│                                                             │
│  ~/.mac-aicheck/agent/                                       │
│    ├── agent-lite.js        ← 内嵌 agent 源码                  │
│    ├── mac-aicheck-agent   ← shell wrapper 脚本               │
│    └── agent-lite.hash.json ← 完整性校验                      │
│                                                             │
│  ~/.mac-aicheck/                                            │
│    ├── config.json        ← clientId, deviceId, shareData    │
│    ├── hooks.json         ← 已安装 hook 信息                  │
│    ├── outbox/events.jsonl ← 待上传事件                       │
│    ├── uploads/ledger.jsonl ← 上传记录                        │
│    ├── advice/latest.json  ← 最新建议                         │
│    └── daily/YYYY-MM-DD.json ← 每日问题统计                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 目录结构

```
src/agent/
├── embedded-agent-lite-source.ts   # 内嵌 JS agent 源码（从 WinAICheck 移植）
├── local-state.ts                   # 主进程侧状态管理（CLI/Web API）
├── types.ts                         # Agent 相关类型定义

bin/
└── mac-aicheck-agent                # shell wrapper 脚本（可执行）
```

---

## 4. 核心组件

### 4.1 embedded-agent-lite-source.ts

从 WinAICheck 移植，适配 macOS：

**修改点**：
- `getHome()` 返回 `process.env.HOME`
- `getBaseDir()` 返回 `~/.mac-aicheck`
- 替换 Windows 路径为 Unix 路径（`\.aicoevo\` → `/.mac-aicheck/`）
- `agentCmd` 文件改为 `mac-aicheck-agent`（无扩展名）
- shell hook 改为 zsh profile（`~/.zshrc`），兼容 bash（`~/.bashrc`）
- 替换 Windows PowerShell hook 语法为 zsh `function claude` 覆盖
- 移除 Windows 特定路径（`LOCALAPPDATA`、`%USERPROFILE%`）

**功能**：
- `storeEvent(event)` — 本地存储事件到 `outbox/events.jsonl`
- `updateDaily(event)` — 更新 `daily/YYYY-MM-DD.json`
- `syncEvents()` — 批量上传到 `/api/v1/agent-events/batch`
- `installHook(target)` — 写入 zshrc/bashrc hook 块
- `uninstallHook(target)` — 移除 hook 块
- `createEvent({ agent, message })` — 脱敏 + fingerprint
- `parseArgs(argv)` — 解析 `--agent`, `--original`, `--` 等参数
- `main(argv)` — CLI 入口

**脱敏模式**（从 WinAICheck 移植）：
```typescript
const SENSITIVE_PATTERNS = [
  { regex: /sk-|api[_-]?key[_-]?([a-zA-Z0-9_-]{20,})/gi, replacement: '<API_KEY>' },
  { regex: /C:\\Users\\([^\\/\\s]+)/g, replacement: 'C:\\Users\\<USER>' },
  { regex: /\b(\d{1,3}\.){3}\d{1,3}\b/g, replacement: '<IP>' },
  { regex: /[\w.-]+@[\w.-]+\.\w+/g, replacement: '<EMAIL>' },
  // ... macOS 路径适配
];
```

### 4.2 local-state.ts

主进程状态管理，与 WinAICheck 架构对齐：

```typescript
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { AGENT_LITE_SOURCE, AGENT_LITE_HASH } from './embedded-agent-lite-source';

function getBaseDir(): string {
  return join(homedir(), '.mac-aicheck');
}

export function getAgentLocalStatus() { /* ... */ }
export function enableAgentExperience(target?: string) { /* ... */ }
export function pauseAgentUploads(paused: boolean) { /* ... */ }
export function syncAgentEvents() { /* ... */ }
```

**API 端点**（在 main.ts 中添加）：
- `GET /api/agent/status` — 返回 `getAgentLocalStatus()`
- `POST /api/agent/enable` — 调用 `enableAgentExperience(target)`
- `POST /api/agent/pause` — 暂停上传
- `POST /api/agent/resume` — 恢复上传
- `POST /api/agent/sync` — 手动触发一次 sync

### 4.3 bin/mac-aicheck-agent

shell wrapper 脚本（类 Unix 可执行文件）：

```bash
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$DIR/agent-lite.js" "$@"
```

---

## 5. CLI 子命令

通过 `mac-aicheck agent <subcommand>` 调用：

| 子命令 | 功能 |
|--------|------|
| `install-hook --target claude-code` | 安装 claude hook 到 zshrc |
| `install-hook --target all` | 安装所有支持 agent 的 hook |
| `uninstall-hook --target all` | 移除所有 hook |
| `capture --agent claude-code --message <text>` | 手动记录一条事件 |
| `capture --agent claude-code --log <path>` | 从日志文件读取并记录 |
| `sync` | 立即上传 pending 事件到服务端 |
| `uploads --local` | 显示本地事件和上传记录 |
| `uploads --remote` | 从服务端拉取已上传事件 |
| `summary` | 显示今日问题统计 |
| `advice --format json\|markdown` | 显示最新建议 |
| `pause` / `resume` | 暂停/恢复自动上传 |
| `run --agent claude-code --original <path> -- <args>` | 运行原始 agent 并捕获输出 |

---

## 6. 数据流

### 6.1 错误捕获流程

```
用户执行 claude <args>
    ↓
zsh 拦截，执行 mac-aicheck-agent run --agent claude-code --original <path> -- <args>
    ↓
mac-aicheck-agent 加载 ~/.mac-aicheck/agent/agent-lite.js
    ↓
spawn 原始 claude，捕获 stdout/stderr
    ↓
agent-lite.js: createEvent({ agent: 'claude-code', message: stderr })
    ↓
agent-lite.js: storeEvent(event) → outbox/events.jsonl + daily/*.json
    ↓
如果 exitCode !== 0 或有 stderr 输出：
  - 显示 "WinAICheck: 已记录 Agent 问题 evt_xxx"
    ↓
返回原始 agent 退出码
```

### 6.2 Sync 流程

```
用户运行 mac-aicheck agent sync
    或 autoSync 定时触发（需登录授权）
    ↓
syncEvents():
  - 读取 outbox/events.jsonl
  - 过滤 syncStatus !== 'synced' 的事件（最多 50 条）
  - POST /api/v1/agent-events/batch
  - 服务端返回 { advice?, ... }
  - 写入本地 advice/latest.json
  - 标记事件为 synced
  - 记录到 ledger.jsonl
```

---

## 7. 服务端 API（aicoevo.net）

**已有接口**（从 aicoevo-platform 确认）：
- `POST /api/v1/agent-events/batch` — 批量上传事件（需要登录）
- `GET /api/v1/agent-events/mine` — 获取用户已上传事件（需要登录）
- `DELETE /api/v1/agent-events/{event_id}` — 删除单条事件

**认证流程**：
- WinAICheck 使用 email + verification code 登录
- mac-aicheck 复用相同 auth flow
- `mac-aicheck agent auth --email <email>` → 发送验证码
- `mac-aicheck agent auth --verify <code>` → 完成授权

---

## 8. 安全性

### 8.1 脱敏（从 WinAICheck 移植）

事件消息在本地存储和上传前必须脱敏：
- API keys / tokens → `<API_KEY>`
- IP 地址 → `<IP>`
- 邮箱 → `<EMAIL>`
- Windows 用户路径 → `<USER>`
- macOS 用户路径 → `/Users/<USER>`（新增）
- 各类 secret env vars → `<SECRET_ENV>`

### 8.2 本地数据安全

- `config.json`, `hooks.json`: mode 0600
- 所有数据存储在用户 home 目录，不上传敏感内容

### 8.3 `--log` 参数路径限制

仅允许读取：
- `$HOME`
- `$PWD`（当前工作目录）
- `/tmp/mac-aicheck`

---

## 9. 配置文件

### ~/.mac-aicheck/config.json

```json
{
  "clientId": "client_<uuid>",
  "deviceId": "device_<uuid>",
  "shareData": false,
  "autoSync": false,
  "paused": false,
  "email": null,
  "authToken": null,
  "confirmedAt": null
}
```

### ~/.mac-aicheck/hooks.json

```json
{
  "installedAt": "2026-04-14T...",
  "agents": [
    { "target": "claude-code", "command": "/path/to/claude", "functionName": "claude" }
  ],
  "profiles": ["/Users/xxx/.zshrc"]
}
```

---

## 10. 测试策略

参考 WinAICheck 的 `tests/agent-lite.test.ts`，mac-aicheck 需覆盖：

1. **事件创建与脱敏** — 各种敏感信息被正确替换
2. **路径限制** — `--log` 参数拒绝非白名单路径
3. **daily 聚合** — 同一 fingerprint 事件计数正确
4. **outbox 读写** — JSONL 追加、rotation
5. **local-state** — getAgentLocalStatus 返回正确结构
6. **CLI 参数解析** — `parseArgs` 处理各种输入格式

---

## 11. 移植检查清单

从 WinAICheck `embedded-agent-lite-source.ts` 移植时需修改：

| 原内容 | 改为 |
|--------|------|
| `process.env.USERPROFILE \|\| process.env.HOME` | `process.env.HOME` |
| `\.aicoevo\` | `/.mac-aicheck/` |
| `C:\Users\...` | `/Users/<USER>` |
| `winaicheck-agent.cmd` | `mac-aicheck-agent` |
| PowerShell profile hook | zsh `function` hook |
| `%HOME%` 环境变量 | `$HOME` |
| `join(homedir(), '.aicoevo')` | `join(homedir(), '.mac-aicheck')` |

---

## 12. 实施顺序

1. **创建 `src/agent/embedded-agent-lite-source.ts`** — 移植 agent-lite 源码
2. **创建 `src/agent/types.ts`** — 类型定义
3. **创建 `src/agent/local-state.ts`** — 主进程状态管理
4. **创建 `bin/mac-aicheck-agent`** — shell wrapper
5. **修改 `src/main.ts`** — 添加 `/api/agent/*` 端点
6. **添加 `mac-aicheck agent` CLI 子命令** — 入口
7. **编写测试** — 覆盖核心逻辑
8. **集成测试** — 完整流程验证
