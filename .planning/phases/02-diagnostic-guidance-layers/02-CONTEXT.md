# Phase 2: Diagnostic & Guidance Layers - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

为 fixer 系统建立精准诊断和修复后指导的共享基础设施。所有 fixer 共用的语言层和诊断逻辑，支撑 Phase 3/4 的具体 fixer 实现。

**Phase 2 交付物：**
- `src/fixers/types.ts` — 扩展 Fixer 接口，增加 `getGuidance()`、`preflightChecks`、`getVerificationCommand()`
- `src/fixers/errors.ts` — 扩展 ClassifiedError，增加 `code`、`recoverable`、`context` 字段
- `src/fixers/diagnostics.ts` — 诊断信息展示模块（扩展 ERROR_MESSAGES）
- `src/fixers/preflight.ts` — Preflight 检查执行器
- `src/index.ts` — CLI 层处理 guidance 展示

**不含：** 具体 fixer 实现（Phase 3/4）
</domain>

<decisions>
## Implementation Decisions

### PostFixGuidance 结构 (PST-01, PST-02, PST-03)
- **D-13:** `Fixer.getGuidance()` 方法 — Fixer 接口增加可选 `getGuidance(): PostFixGuidance` 方法，各 fixer 实现自己的 guidance
- **D-14:** Guidance 展示时机 — `fixAll()` 返回后由 CLI 层处理，`fixAll()` 在 `FixResult.nextSteps` 中返回 guidance 提示

### Preflight 检查机制 (DIA-02)
- **D-15:** `Fixer.preflightChecks: PreflightCheck[]` — Fixer 接口增加可选 `preflightChecks` 数组
- **D-16:** PreflightCheck 结构 — `PreflightCheck = { id: string; check: async () → { pass: boolean; message?: string } }`，无参数，框架自动执行
- **D-17:** Preflight 执行器 — `src/fixers/preflight.ts` 提供 `runPreflights(fixer, scanResult)` 函数，统一执行检查列表

### 诊断信息展示 (DIA-03)
- **D-18:** 诊断来源 — 扩展 `ERROR_MESSAGES + ClassifiedError`，增加 `code`、`recoverable`、`context` 字段
- **D-19:** diagnostics 模块 — `src/fixers/diagnostics.ts` 整合 classifyError 结果与 ERROR_MESSAGES，提供给 CLI 层展示

### 手动验证命令 (PST-04)
- **D-20:** `Fixer.getVerificationCommand()` 方法 — Fixer 接口增加可选 `getVerificationCommand(): string | string[]` 方法，各 fixer 提供自己的验证命令
- **D-21:** 验证命令展示 — CLI 层从 Fixer.getVerificationCommand() 获取，展示给用户确认修复成功

### CLI 层 Guidance 处理
- **D-22:** CLI 层职责 — `src/index.ts` 的 `fix` 命令负责格式化展示 guidance（needsTerminalRestart / needsReboot / verifyCommands）

### 既有决策继承
- Phase 1 D-01 到 D-12 的所有决策在本 phase 继续有效
- `ERROR_MESSAGES` 已在 Phase 1 建立，继续作为诊断基础
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Requirements
- `.planning/ROADMAP.md` §Phase 2 — Phase goal, requirements: DIA-01, DIA-02, DIA-03, PST-01, PST-02, PST-03, PST-04
- `.planning/REQUIREMENTS.md` §Layer 2: 精准诊断 — DIA-01, DIA-02, DIA-03 详细定义
- `.planning/REQUIREMENTS.md` §Layer 3: 修复后指导 — PST-01, PST-02, PST-03, PST-04 详细定义

### Prior Phase Context
- `.planning/phases/01-fixer-infrastructure/01-CONTEXT.md` — Phase 1 所有决策（D-01 到 D-12）
- `.planning/phases/01-fixer-infrastructure/01-PLAN.md` — Fixer 接口、FixResult、classifyError 已有实现
- `.planning/phases/01-fixer-infrastructure/01-VERIFICATION.md` — Phase 1 验证通过，FIX-01 到 VRF-03 满足

### Codebase Conventions
- `src/fixers/types.ts` — 当前 Fixer 接口定义（需扩展）
- `src/fixers/errors.ts` — 当前 classifyError 和 ERROR_MESSAGES（需扩展）
- `src/fixers/verify.ts` — 当前 buildNextSteps()（guidance 逻辑从此扩展）
- `src/scanners/registry.ts` — 自注册模式参考
- `.planning/codebase/CONVENTIONS.md` — TypeScript 规范（strict: true）
- `.planning/codebase/STRUCTURE.md` — 新文件位置：`src/fixers/{name}.ts`
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/fixers/errors.ts` — 现有的 classifyError() 和 ERROR_MESSAGES 基础，需扩展字段
- `src/fixers/verify.ts` — 现有的 buildNextSteps() 可改造，整合 guidance
- `src/scanners/registry.ts` — 自注册模式参考，Fixer 接口扩展遵循相同模式

### Established Patterns
- 自注册模式：模块 import 时注册，registry 持有实例
- 固定格式优于灵活定制：PreflightCheck 用固定 async fn → {pass, message}，不开放自定义签名

### Integration Points
- `src/fixers/types.ts` — Fixer 接口扩展点
- `src/index.ts` — fix 命令处理 guidance 展示
- `src/fixers/verify.ts` — buildNextSteps() 与 guidance 整合
</code_context>

<specifics>
## Specific Ideas

- PostFixGuidance 结构：`{ needsTerminalRestart: boolean; needsReboot: boolean; verifyCommands?: string[]; notes?: string[] }`
- 验证命令示例：`brew doctor`、`git --version`、`node --version`
- terminal restart 提示示例：`echo "请关闭当前终端并重新打开以使 PATH 生效"`
- reboot 提示示例：`echo "系统配置已更新，请重启电脑使更改生效"`
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope
</deferred>

---

*Phase: 02-diagnostic-guidance-layers*
*Context gathered: 2026-04-12*
