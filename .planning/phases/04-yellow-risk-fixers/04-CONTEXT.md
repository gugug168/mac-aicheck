# Phase 4: Yellow Risk Fixers - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

实现两个中风险 fixer：node-version (Node.js LTS) 和 python-versions (Python 3.12)。完成 v1 功能集。

**Phase 4 交付物：**
- `src/fixers/node-version.ts` — Node.js LTS 安装 fixer
- `src/fixers/python-versions.ts` — Python 3.12 安装 fixer

**不含：** 红色风险 fixer（后续 phase）
</domain>

<decisions>
## Implementation Decisions

### Yellow Risk 策略（继承 Green Risk 模式）
- **D-34:** 手动验证 — Yellow risk fixer 不自动重扫，由 fixer.getVerificationCommand() 提供验证命令，用户手动确认
- **D-35:** 失败时 warn 而非 fail — Yellow risk 安装失败返回 FixResult with partial: true 而非完全失败

### 安装策略（继承 D-23 非交互式）
- **D-36:** Node.js 安装 — 使用 nvm 或直接下载官方 installer，环境变量配置
- **D-37:** Python 安装 — 使用 python.org official installer 或 pyenv，注意 PATH 配置

### Guidance 策略（继承 Phase 2/3）
- **D-38:** node-version — needsTerminalRestart: true (PATH 生效), needsReboot: false, verifyCommands: ['node --version']
- **D-39:** python-versions — needsTerminalRestart: true (PATH 生效), needsReboot: false, verifyCommands: ['python3 --version']

### 既有决策继承
- Phase 1 D-01 到 D-12：Fixer 接口、自注册模式
- Phase 2 D-13 到 D-22：PostFixGuidance、PreflightCheck、getVerificationCommand
- Phase 3 D-23 到 D-33：非交互安装、原子执行、失败诊断
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Requirements
- `.planning/ROADMAP.md` §Phase 4 — Phase goal, requirements: YLW-01, YLW-02
- `.planning/REQUIREMENTS.md` §Yellow Risk Fixers — YLW-01, YLW-02 详细定义

### Prior Phase Context
- `.planning/phases/01-fixer-infrastructure/01-CONTEXT.md` — Phase 1 所有决策
- `.planning/phases/02-diagnostic-guidance-layers/02-CONTEXT.md` — Phase 2 所有决策
- `.planning/phases/03-green-risk-fixers/03-CONTEXT.md` — Phase 3 所有决策（D-23 到 D-33）

### Codebase Conventions
- `src/fixers/types.ts` — Fixer 接口定义
- `src/fixers/registry.ts` — 自注册模式和 SCANNER_TO_FIXER_MAP
- `src/fixers/homebrew.ts` — Green Risk fixer 参考实现
- `src/executor/index.ts` — runCommand() 执行修复命令
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Green Risk fixer 实现（homebrew.ts）— 完整参考，包括 getGuidance(), getVerificationCommand()
- runCommand() from `src/executor/index.ts`
- classifyError() from `src/fixers/errors.ts`

### Established Patterns
- Yellow risk vs Green risk: Yellow 不自动验证，需要用户手动确认
- 自注册模式：与 Green Risk Fixer 完全相同

### Integration Points
- `src/fixers/index.ts` — fixAll() 中 yellow risk 跳过 auto-verify（D-34）
- `src/fixers/registry.ts` — SCANNER_TO_FIXER_MAP 添加 YLW entries
</code_context>

<specifics>
## Specific Ideas

### Node.js LTS 安装方式
```bash
# 方式1: nvm（需要先安装 nvm）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts

# 方式2: 直接下载（更可靠）
curl -fsSL https://nodejs.org/dist/v20.10.0/node-v20.10.0.pkg -o /tmp/node-installer.pkg
sudo installer -pkg /tmp/node-installer.pkg -target /
```

### Python 3.12 安装
```bash
# 官方 installer
curl -fsSL https://www.python.org/ftp/python/3.12.0/python-3.12.0-macos11.pkg -o /tmp/python-installer.pkg
sudo installer -pkg /tmp/python-installer.pkg -target /

# 或使用 pyenv（需要先安装 pyenv）
pyenv install 3.12.0
```
</specifics>

<deferred>
## Deferred Ideas

- RED risk fixers（developer-mode, screen-permission）— 后续 phase
- Web UI /api/fix 端点
</deferred>

---

*Phase: 04-yellow-risk-fixers*
*Context gathered: 2026-04-13*
