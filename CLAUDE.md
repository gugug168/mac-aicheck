# CLAUDE.md — Project Context for AI Agents

## Project Overview

**mac-aicheck** — AI Tooling Health Check for macOS
- Node.js CLI + Web Dashboard
- 扫描 macOS 开发环境（Node.js、Python、Git、代理、SSL 证书等）
- 输出 HTML 报告（静态，可离线查看）
- 支持上报社区（通过 aicoevo.net API）

## Current Status (2026-04-08)

- **main 分支**: 稳定可发布
- **最新 commit**: 7a404aa (CONTRIBUTING major overhaul)
- **16 个 Scanner**：admin-perms, apple-silicon, claude-code, dns-resolution, git-identity, git, gpu-monitor, node-version, npm-mirror, openclaw, proxy-config, python-versions, rosetta, ssl-certs, xcode, developer-mode
- **Web UI**: macOS 风格静态 HTML，端口 7891
- **CI**: GitHub Actions，push/PR 到 main 自动运行

## Architecture

```
src/
├── scanners/          # 各 scanner 实现
│   ├── registry.ts   # scanner 注册表
│   └── types.ts      # 类型定义
├── scoring/          # 计分系统
├── report/           # HTML 报告生成
├── web/              # Web UI（dist/web/）
├── api/              # AICoEvo API 客户端
└── cli/              # CLI 命令（gen-web 等）
```

## Key Files

- `package.json` — 依赖和脚本
- `tsconfig.json` — TypeScript 配置
- `src/index.ts` — 入口，扫描 + API 上报
- `dist/web/index.html` — Web UI 首页
- `CONTRIBUTING.md` — 多 AI 协作规范（必读）

## Current Open Work

- MCO multi-agent review workflow 搭建中
- Community reporting 集成（aicoevo.net /api/stash）
- Web UI polish

## Repository

https://github.com/gugug168/mac-aicheck
