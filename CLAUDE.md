# CLAUDE.md — Project Context for AI Agents

## Project Overview

**mac-aicheck** — macOS AI 开发环境检测工具 + 三层修复系统
- Node.js CLI + Web Dashboard
- 当前：18 项环境检测（scanner）
- 目标：三层修复系统（Fixer Infrastructure → 精准诊断 → 修复后指导）

## Three-Repo Ecosystem

MacAICheck 是三端生态的 macOS 客户端：

| 仓库 | 平台 | 技术栈 | GitHub |
|------|------|--------|--------|
| WinAICheck | Windows | Bun + TypeScript (.exe) | `gugug168/WinAICheck` |
| **MacAICheck** | macOS | Node + TypeScript (CLI) | `gugug168/mac-aicheck` |
| aicoevo-platform | 服务端 | FastAPI + Next.js + SQLite | `gugug168/aicoevo-platform` |

**API 契约**: 见 aicoevo-platform 的 `docs/API_CONTRACT.md`，包含 scan-intake 请求/响应规范、当前共享上传 payload（`timestamp/score/results/systemInfo`）、认证方式和数据类型定义。

**关键同步规则**:
- 修改 `src/api/aicoevo-client.ts` 中的上传逻辑 → 同步检查 WinAICheck 的 `src/privacy/uploader.ts`
- 修改扫描结果结构 → 三端同步更新
- 修改上传端点路径 → aicoevo-platform 的路由也要同步
- 新增扫描器分类 → 同步更新 `web/src/lib/types.ts` 的 `CATEGORY_LABELS`

**WinAICheck 功能对照**: WinAICheck 已实现 37+ 扫描器 + 完整修复系统 + Agent Lite。MacAICheck 当前 18 项检测，修复系统 Phase 1 进行中。

## Current Status (2026-04-12)

- **main 分支**: 稳定可发布
- **最新 commit**: 7a404aa (CONTRIBUTING major overhaul)
- **项目阶段**: 初始化完成，Phase 1 待开始
- **研究方向**: WinAICheck `src/fixers/index.ts` 作为参考实现

## Architecture

```
src/
├── scanners/          # Scanner 实现（自注册到 registry）
│   ├── registry.ts   # Scanner 注册表
│   └── types.ts      # ScanResult 类型定义
├── fixers/           # Fixer 实现（新增）
│   ├── types.ts     # Fixer 接口、FixResult、ErrorCategory
│   ├── registry.ts   # Fixer 注册表
│   ├── errors.ts     # 错误分类系统
│   ├── verify.ts     # 验证闭环
│   └── index.ts      # fixAll() 编排
├── scoring/          # 计分系统
├── report/           # HTML 报告生成
├── web/              # Web UI（dist/web/）
├── api/              # AICoEvo API 客户端
└── installers/        # AI 工具安装器

三层修复架构：
1. 验证闭环 (Verification Loop) — 修复后重扫验证
2. 精准诊断 (Precise Diagnostics) — 错误分类 + 预检
3. 修复后指导 (Post-Fix Guidance) — 重启提示、手动验证
```

## Key Files

- `package.json` — 依赖和脚本
- `tsconfig.json` — TypeScript 配置
- `src/index.ts` — 入口，scanAll() + fixAll()
- `.planning/ROADMAP.md` — Phase 结构
- `.planning/research/` — 生态系统研究
- `CONTRIBUTING.md` — 多 AI 协作规范（必读）

## Current Phase

**Phase 1: Fixer Infrastructure**
- Fixer 接口 + 注册表 + 错误分类 + 验证闭环
- 目标：建立核心架构

## Repository

https://github.com/gugug168/mac-aicheck

## 参考

- WinAICheck `src/fixers/index.ts` — 四阶段流程：preflight → backup → execute → verify
