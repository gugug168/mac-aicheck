# Phase 3: Green Risk Fixers - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

实现四个低风险 fixer：homebrew、npm-mirror、git、rosetta。验证完整修复流程。

**Phase 3 交付物：**
- `src/fixers/homebrew.ts` — Homebrew 安装 fixer
- `src/fixers/npm-mirror.ts` — npm 镜像配置 fixer
- `src/fixers/git.ts` — Git 安装 + 身份配置 fixer
- `src/fixers/rosetta.ts` — Rosetta 2 安装 fixer

**不含：** 黄色风险 fixer（Phase 4）
</domain>

<decisions>
## Implementation Decisions

### 安装策略（推荐默认）
- **D-23:** 非交互式安装 — 所有安装命令使用 `-y` 或 `--quiet` 标志避免交互提示
- **D-24:** Homebrew 安装 — 使用官方非交互脚本，不依赖 XCode command line tools 前置检查
- **D-25:** Rosetta 安装 — 使用 `softwareupdate --install-rosetta --agree-to-license` 自动接受协议

### 失败处理（推荐默认）
- **D-26:** 原子执行 — 每个 fixer 一次只做一个操作，失败立即返回，不做回滚
- **D-27:** 失败诊断 — 调用 classifyError() 归类失败原因，通过 FixResult.message 返回中文提示

### 版本要求（推荐默认）
- **D-28:** Git 版本门限 — 2.30+（现有 scanner 已实现），fixer 安装最新版本
- **D-29:** npm-mirror — 配置阿里云镜像 `https://registry.npmmirror.com`，回退到官方源

### Guidance 策略（继承 Phase 2）
- **D-30:** homebrew — needsTerminalRestart: false, needsReboot: false, verifyCommands: ['brew --version']
- **D-31:** git — needsTerminalRestart: false, needsReboot: false, verifyCommands: ['git --version']
- **D-32:** npm-mirror — needsTerminalRestart: true (PATH 生效), needsReboot: false, verifyCommands: ['npm --version']
- **D-33:** rosetta — needsTerminalRestart: false, needsReboot: true (系统级安装), verifyCommands: ['pkgutil --pkg-info=com.apple.pkg.RosettaUpdateLegacy']

### 既有决策继承
- Phase 1 D-01 到 D-12：Fixer 接口、自注册模式、验证闭环
- Phase 2 D-13 到 D-22：PostFixGuidance、PreflightCheck、getVerificationCommand
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Requirements
- `.planning/ROADMAP.md` §Phase 3 — Phase goal, requirements: GRN-01, GRN-02, GRN-03, GRN-04
- `.planning/REQUIREMENTS.md` §Green Risk Fixers — GRN-01 through GRN-04 详细定义

### Prior Phase Context
- `.planning/phases/01-fixer-infrastructure/01-CONTEXT.md` — Phase 1 所有决策（D-01 到 D-12）
- `.planning/phases/02-diagnostic-guidance-layers/02-CONTEXT.md` — Phase 2 所有决策（D-13 到 D-22）

### Codebase Conventions
- `src/fixers/types.ts` — Fixer 接口定义
- `src/fixers/registry.ts` — 自注册模式和 SCANNER_TO_FIXER_MAP
- `src/fixers/errors.ts` — classifyError() 错误分类
- `src/executor/index.ts` — runCommand() 执行修复命令
- `src/scanners/homebrew.ts` — Homebrew scanner 参考
- `src/scanners/git.ts` — Git scanner 参考
- `src/scanners/rosetta.ts` — Rosetta scanner 参考
- `src/scanners/npm-mirror.ts` — npm-mirror scanner 参考
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `runCommand()` from `src/executor/index.ts` — 执行安装命令
- `classifyError()` from `src/fixers/errors.ts` — 失败归类
- `ERROR_MESSAGES` from `src/fixers/errors.ts` — 中文提示
- Existing scanners as fixer logic reference

### Established Patterns
- 自注册模式：Fixer 模块 import 时调用 registerFixer()
- SCANNER_TO_FIXER_MAP 已建立映射关系
- Fixer.execute() 返回 FixResult { success, message, verified, nextSteps }

### Integration Points
- `src/fixers/index.ts` — fixAll() 编排入口
- `src/fixers/registry.ts` — SCANNER_TO_FIXER_MAP 添加条目
</code_context>

<specifics>
## Specific Ideas

### Homebrew 安装命令
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
非交互式可通过设置环境变量 `CI=true` 或 `NONINTERACTIVE=1`

### npm 镜像配置
```bash
npm config set registry https://registry.npmmirror.com
```

### Git 安装（macOS）
```bash
brew install git
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

### Rosetta 安装
```bash
softwareupdate --install-rosetta --agree-to-license
```
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope
</deferred>

---

*Phase: 03-green-risk-fixers*
*Context gathered: 2026-04-12*
