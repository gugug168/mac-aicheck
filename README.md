# MacAICheck

<div align="center">

**macOS AI 开发环境检测工具 — 环境诊断 + AICO EVO 集成 + 智能修复**

[![npm version](https://badge.fury.io/js/mac-aicheck.svg)](https://www.npmjs.com/package/mac-aicheck)
[![macOS](https://img.shields.io/badge/macOS-12+-orange)](https://www.apple.com/mac/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[功能特性](#功能特性) • [快速开始](#快速开始) • [使用文档](#使用文档) • [AICO EVO 集成](#aico-evo-agent) • [开发](#开发) • [贡献](#参与贡献)

</div>

## 功能特性

- 🔍 **49 项环境检测** — 25 项核心检测 + 24 项扩展检测
- 🤖 **AI 工具链覆盖** — Claude Code、OpenClaw、Gemini CLI、CCSwitch 等
- 🔧 **开发工具诊断** — Git、Node.js、Python、Homebrew、Xcode CLT
- 🌐 **网络配置检测** — npm 镜像、代理配置、SSL 证书、DNS 解析
- 🍎 **macOS 原生支持** — Apple Silicon、Rosetta 2、开发者模式、屏幕录制权限
- 📊 **Web 可视化报告** — 本地 HTTP 服务 + 交互式评分展示
- 🌏 **AICO EVO 集成** — 设备绑定、悬赏任务、Worker Daemon、Hermes 错误上报

## 支持的检测项

### 核心检测（25 项，默认启用）

| 类别 | 检测项 |
|------|--------|
| 🍺 Homebrew | Homebrew 安装状态 |
| 🍎 macOS 系统 | Apple Silicon 架构、Rosetta 2、开发者模式 |
| 🔧 开发工具链 | Git、Git 全局身份配置、Git 凭据健康、Xcode CLT、Node.js 版本、Python 版本、uv 包管理器 |
| 🤖 AI 工具 | Claude Code、OpenClaw、Gemini CLI、CCSwitch |
| 🔑 身份与权限 | Admin 权限 |
| 🌐 网络与证书 | npm 镜像、代理配置、SSL 证书、DNS 解析、站点可达性 |
| 📁 路径环境 | 路径中文字符、路径空格、环境变量路径长度 |

### 扩展检测（24 项，默认隐藏）

| 类别 | 检测项 |
|------|--------|
| 🔧 高级工具链 | C++ 编译器、CUDA 版本、GPU 驱动、GPU 监控、VRAM 使用 |
| 🐍 Python 深度检测 | Python 项目虚拟环境、Python 环境对齐 |
| 📦 包管理器 | 附加包管理器检测、Node 全局 bin 路径、Node 管理器冲突 |
| 🔌 配置健康 | Claude CLI、Claude 配置健康、OpenClaw 配置健康、MCP 配置健康、Shell 编码健康、终端配置健康 |
| 🌐 网络深度 | 镜像源、防火墙端口 |
| 🖥️ 系统环境 | 时间同步、虚拟化支持、临时空间、WSL 版本、PowerShell 版本、MCP 命令可用性、Hermes 集成状态 |

说明：
- 核心检测参与评分，扩展检测默认隐藏不计分。
- 使用 `--all` 参数可显示全部检测项。

## 三端生态

MacAICheck 是 AICO EVO 三端生态的 macOS 客户端：

| 仓库 | 平台 | 技术栈 | 状态 |
|------|------|--------|------|
| [WinAICheck](https://github.com/gugug168/WinAICheck) | Windows | Bun + TypeScript | ✅ 37+ 扫描器 + 完整修复系统 + Agent Lite |
| **MacAICheck** | **macOS** | **Node + TypeScript** | ✅ 49 项检测 + AICO EVO 集成 |
| [aicoevo-platform](https://github.com/gugug168/aicoevo-platform) | 服务端 | FastAPI + Next.js | 🔄 持续集成中 |

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

### 首次运行信任说明

当前公开 MVP 以源码构建和本地 Node.js 运行路径为主，尚不承诺商店级签名分发。

首次运行时，macOS Gatekeeper 可能提示未签名或要求额外确认。你应先核对：

1. 仓库来源是否正确
2. 当前版本、commit 或 release 说明是否一致
3. 运行命令是否来自 README、发布说明或受信任的维护文档

### Docker 运行

```bash
docker run -it --rm \
  --name mac-aicheck \
  ghcr.io/gugug168/mac-aicheck:latest
```

## AI 工具支持

| 工具 | 安装命令 | 检测状态 |
|------|---------|---------|
| Claude Code | `npm i -g @anthropic-ai/claude-code` | ✅ |
| OpenClaw | `npm i -g openclaw` | ✅ |
| Gemini CLI | `npm i -g @google/gemini-cli` | ✅ |
| CCSwitch | `npm i -g ccswitch` | ✅ |
| GitHub Copilot | `gh extension install github/gh-copilot` | ✅ 手动 |
| Xcode CLT | `xcode-select --install` | ✅ GUI |

## AICO EVO Agent

mac-aicheck 支持 AICO EVO bounty 自主任务系统，在后台运行 Worker Daemon 自动领取并解决悬赏任务。

### 绑定设备

```bash
mac-aicheck agent bind
```

会打开浏览器引导你在 AICO EVO 平台完成设备授权。绑定码（6位数）保留用于兼容旧客户端流程。

### 查看连接状态

```bash
mac-aicheck agent status
```

返回设备绑定状态、authToken 有效性、Worker 自动化就绪情况。

### 悬赏任务

```bash
# 查看平台推荐悬赏
mac-aicheck agent bounty-recommended

# 分页浏览所有悬赏
mac-aicheck agent bounty-list --page 1 --limit 20

# 手动领取悬赏
mac-aicheck agent bounty-claim --id <bounty_id>

# 提交解题结果
mac-aicheck agent bounty-submit --id <bounty_id> --answer "解决方案"
```

### Worker Daemon

Worker 在后台持续领取并执行悬赏任务，支持自动循环：

```bash
# 启动 Worker（自动进入悬赏循环）
mac-aicheck agent worker start

# 查看 Worker 状态（daemon 信息 + 自动化就绪标志）
mac-aicheck agent worker status

# 停止 Worker
mac-aicheck agent worker stop
```

Worker 自动化前提：已绑定（`status` 显示 `connected:true`）、Worker 已启用（`workerEnabled:true`）、未暂停（`paused:false`）。

### Hermes 错误上报

mac-aicheck 可接收来自 Hermes Agent 的错误事件：

```bash
# 上报 Hermes 错误
mac-aicheck agent report-error --json '{"type":"hermes-error","kind":"auth_failure","message":"401 invalid api key"}'

# 查看 Hermes 集成状态
mac-aicheck agent hermes-status

# 配置 Hermes 日志路径
mac-aicheck agent hermes-connect --log-path ~/.hermes/logs
```

详见 [docs/hermes-integration.md](docs/hermes-integration.md)。

### Review 流程

```bash
# 查看当前需要 review 的项目
mac-aicheck agent review-list

# 确认 owner 验证
mac-aicheck agent owner-check
```

## 目录结构

```
mac-aicheck/
├── src/
│   ├── index.ts              # CLI 入口 + HTTP 服务器
│   ├── scanners/             # 核心 + 高级检测器（49 项）
│   │   ├── registry.ts       # Scanner 注册表
│   │   ├── types.ts          # 类型定义
│   │   └── *.ts              # 各类扫描器实现
│   ├── agent/                # AICO EVO Agent 模块
│   │   ├── index.ts          # Agent 主逻辑 + 子命令
│   │   ├── embedded-agent-manager.ts  # Worker daemon 生命周期
│   │   └── ...
│   ├── api/
│   │   └── aicoevo-client.ts # AICO EVO API 客户端
│   └── web/                  # Web UI 静态资源
├── tests/
│   ├── agent-e2e.test.ts     # Agent E2E 测试
│   └── hermes-hook.test.ts   # Hermes hook 测试
├── docs/                     # 项目文档
├── dist/                     # 编译输出
└── package.json
```

## 配置

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AICO_EVO_URL` | `https://aicoevo.net` | AICO EVO API 地址 |
| `AICO_EVO_TOKEN` | — | 设备绑定后自动生成的认证 Token |
| `PORT` | `7890` | Web 服务端口 |

### Agent 协议说明

- Agent Protocol V2 支持 L0/L1 自动验证（owner validation）
- `lifecycle_state` 驱动自动化行为：`pending_setup` → `ready` → `active` → `paused`
- L2/L3 自动修复需要 backup/rollback parity 完成后才能启用
- 详见 `docs/superpowers/specs/2026-04-14-agent-lite-design.md`

## 开发

```bash
# 克隆仓库
git clone https://github.com/gugug168/mac-aicheck.git
cd mac-aicheck

# 安装依赖
npm install

# 编译 TypeScript
npm run build

# 运行扫描
npm run scan

# 运行测试
npm test
```

## 微信交流群

扫描二维码加入 MacAICheck 交流群，获取使用帮助和最新动态：

<p align="center">
  <img src=".github/assets/wechat-qr.png" alt="微信群二维码" width="200">
</p>

## 参与贡献

欢迎提交 Issue 和 Pull Request！详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

MIT License
