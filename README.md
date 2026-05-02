# MacAICheck

> macOS AI 开发环境检测工具 — 诊断 + 一键修复 + 工具安装

[![macOS](https://img.shields.io/badge/macOS-15+-orange)](https://www.apple.com/mac/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

## 功能特性

- 🔍 **21 项核心环境检测** — 覆盖 AI 工具链、系统权限、开发工具链、网络配置
- 🧪 **33 项高级扩展检测** — 默认隐藏且不计分，避免把可选项误算成核心环境问题
- 🛠️ **一键修复** — 检测到问题自动给出修复命令，点击即可执行
- 📦 **AI 工具安装** — 从 Web UI 一键安装主流 AI 编程工具
- 📊 **可视化报告** — 评分制 + 分类展示，支持导出历史记录
- 🌏 **上报 AICO EVO** — 匿名上传诊断数据，贡献 AI 开发环境行业数据

## 支持的检测项

| 类别 | 检测项 |
|------|--------|
| 🍺 Homebrew | Homebrew 安装 |
| 🍎 macOS 系统 | Apple Silicon、Rosetta 2、屏幕录制权限、开发者模式 |
| 🔧 开发工具链 | Git、Git 全局身份、Git 凭据链路、Xcode CLT、Node.js 版本、Python 版本、uv 包管理器 |
| 🤖 AI 工具 | Claude Code、OpenClaw、Gemini CLI、CCSwitch |
| 🔑 身份与权限 | admin 权限 |
| 🌐 网络与证书 | npm 镜像、代理配置、SSL 证书、DNS 解析 |

说明：
- 默认评分只统计核心 21 项。
- 高级扩展检测默认隐藏，不参与评分，用于更深的环境排查。

## 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/gugug168/mac-aicheck.git
cd mac-aicheck

# 安装依赖
npm install

# 编译 TypeScript
npm run build
```

### 使用

```bash
# 方式一：CLI 扫描
mac-aicheck

# 方式一补充：保留 scan 别名
mac-aicheck scan

# 方式二：Web UI（浏览器打开，带交互式修复）
mac-aicheck --serve

# 方式三：直接用 node
node dist/index.js scan
node dist/index.js --serve
```

启动后访问 http://localhost:7890

### Docker 运行

```bash
docker run -it --rm \
  --name mac-aicheck \
  ghcr.io/gugug168/mac-aicheck:latest
```

## AI 工具支持

| 工具 | 安装命令 | 状态 |
|------|---------|------|
| Claude Code | `npm i -g @anthropic-ai/claude-code` | ✅ |
| OpenClaw | `npm i -g openclaw` | ✅ |
| Gemini CLI | `npm i -g @google/gemini-cli` | ✅ |
| OpenCode | `npm i -g opencode-ai` | ✅ |
| CCSwitch | `npm i -g ccswitch` | ✅ |
| Cute Claude Hooks | `npm i -g cute-claude-hooks` | ✅ |
| GitHub Copilot | `gh copilot` | ✅ 手动 |
| Xcode CLT | `xcode-select --install` | ✅ GUI |

## 目录结构

```
mac-aicheck/
├── src/
│   ├── index.ts              # CLI 入口 + HTTP 服务器
│   ├── scanners/             # 核心 + 高级检测器
│   │   ├── index.ts          # Scanner 注册表
│   │   ├── types.ts          # 类型定义
│   │   ├── claude-code.ts    # Claude Code
│   │   ├── openclaw.ts       # OpenClaw
│   │   ├── gemini-cli.ts     # Gemini CLI
│   │   ├── homebrew.ts       # Homebrew
│   │   ├── xcode.ts          # Xcode CLT
│   │   └── ...
│   ├── scoring/
│   │   └── calculator.ts     # 评分算法
│   ├── installers/
│   │   └── index.ts          # AI 工具安装器定义
│   ├── api/
│   │   └── aicoevo-client.ts # AICO EVO 上报客户端
│   └── report/
│       └── html.ts           # HTML 报告生成器
├── dist/                     # 编译输出
├── dist/web/                 # Web UI 运行时数据（如 scan-data.json）
└── package.json
```

## 配置

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AICO_EVO_URL` | `https://aicoevo.net` | AICO EVO API 地址 |
| `AICO_EVO_TOKEN` | — | 上报认证 Token |
| `PORT` | `7890` | Web 服务端口 |

### Agent Lite

```bash
# Claude Code + OpenClaw 一起启用
mac-aicheck agent enable --target all

# 仅启用 OpenClaw 监控
mac-aicheck agent enable --target openclaw

# 在 macOS 真机上跑 OpenClaw 烟雾验收
bash scripts/openclaw-smoke.sh
```

说明：
- Claude Code 使用 `~/.claude/settings.json` 的 SessionStart/PostToolUse hooks。
- OpenClaw 使用 shell hook 写入 `~/.zshrc` / `~/.bashrc` / `~/.bash_profile`。
- 悬赏命令需要先运行 `mac-aicheck agent bind` 获取 Agent API Key。

### Phase 6 协议说明

- MacAICheck 同时兼容 legacy `mode` 和 Phase 6 `lifecycle_state`，但 Phase 6 自动化行为只认服务端返回的 `lifecycle_state`、`risk_level`、`repair_capability`、`consent_state`、`rollback_state`。
- 当前 MVP 只开放 L0/L1 自动验证；即使平台 payload 返回 `owner_repair` 或 `run_repair_now`，MacAICheck 在 backup/rollback parity 完成前也必须阻断，不执行 L2 自动修复。
- 旧客户端或缺字段 payload 只能走“验证 / 人工提示”路径，不能默认升级到 L2 自动修复。
- `L3` 永不静默执行。

### 上报数据格式

AICO EVO 使用与 WinAICheck 一致的格式：

```json
{
  "timestamp": "2026-04-06T12:00:00.000Z",
  "score": 85,
  "results": [
    { "id": "claude-code", "status": "pass", "message": "v2.1.92" }
  ],
  "systemInfo": {
    "os": "darwin",
    "version": "15.0",
    "arch": "arm64",
    "hostname": "Macmini"
  }
}
```

## 开发

```bash
# 开发模式（监听编译）
npm run watch

# 类型检查
npm run typecheck

# 运行测试
npm test
```

## 参与贡献

欢迎提交 Issue 和 Pull Request！详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

MIT License
