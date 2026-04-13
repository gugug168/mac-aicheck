# mac-aicheck

## What This Is

macOS AI 开发环境检测工具 — 诊断 + 一键修复 + 工具安装。目前只能**检测**问题（20+ scanners），不能自动修复。目标：增加三层修复系统，让检测结果真正能解决问题。

## Core Value

用户运行检测后，能自动修复发现的问题，无需手动搜索解决方案。

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] 三层修复系统基础架构（Fixer 接口 + 注册机制）
- [ ] 第一层：验证闭环（修复后自动重扫验证）
- [ ] 第二层：精准诊断（错误分类 + 预检机制）
- [ ] 第三层：修复后指导（重启终端/系统/手动验证提示）
- [ ] 绿色风险 fixer 实现（homebrew、npm-mirror、git、rosetta 等）
- [ ] 黄色风险 fixer 实现（node-version、python-versions 等）

### Out of Scope

- [ ] 红色风险 fixer（developer-mode、系统设置修改）— 需要额外确认
- [ ] 修复系统 Web UI 交互
- [ ] 修复历史记录
- [ ] 云端配置（企业场景）

## Context

**背景**：Issue #2 描述了用户痛点 — 检测结果告诉用户"Homebrew 未安装"，但用户得自己去搜解决方案。WinAICheck 已实现完整三层修复系统（PR #1），建议 MacAICheck 复用类似架构。

**代码库状态**：
- 16 个 scanner（自注册到 registry）
- 评分系统（按类别加权）
- Web UI（端口 7890）
- 无测试基础设施（Vitest 未安装）

**WinAICheck 参考**：
- `src/fixers/index.ts` — 约 500 行，完整实现
- 四阶段流程：preflight → backup → execute → verify

## Constraints

- **Tech Stack**: TypeScript + Node.js，纯 CLI（参考 WinAICheck 的 .NET 实现）
- **macOS Only**: 修复命令使用 macOS 特有命令（brew、xcode-select、softwareupdate 等）
- **安全**: 修复命令必须白名单化，防止注入

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 复用 WinAICheck 架构 | 四阶段流程已验证，减少设计风险 | — Pending |
| 先做绿色风险 fixer | 低风险可快速验证核心架构 | — Pending |
| 错误分类先行 | 预检机制影响所有 fixer，需早期确立 | — Pending |

---

*Last updated: 2026-04-12 after initialization*
