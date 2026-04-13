# Phase 1: Fixer Infrastructure - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

建立 fixer 核心架构，支持 scanner→fixer 映射和验证闭环。

**交付物：**
- `src/fixers/types.ts` — Fixer 接口 + FixResult 类型
- `src/fixers/registry.ts` — 自注册 + scanner→fixer 映射表
- `src/fixers/errors.ts` — 错误分类系统
- `src/fixers/verify.ts` — 验证闭环
- `src/fixers/index.ts` — fixAll() 编排入口
- `src/index.ts` — 支持 `fix` 子命令

**不含：** 绿色/黄色 fixer 实现（Phase 3/4）
</domain>

<decisions>
## Implementation Decisions

### Fixer 接口风格
- **D-01:** 镜像 Scanner 自注册模式
- **D-02:** Fixer 接口字段：`id`, `name`, `risk`, `canFix()`, `execute()`
- **D-03:** 与 Scanner 接口结构一致，降低上游学习成本

### 验证策略
- **D-04:** 自动重扫验证 — `fixAll()` 完成后自动重新运行对应 scanner 验证（VRF-01）
- **D-05:** 验证结果三态：`pass` / `warn` / `fail`（VRF-02）
- **D-06:** 不自动重扫的情况：黄色风险 fixer 提示手动验证（Phase 4 层面）

### 错误分类
- **D-07:** 六类错误分类：`timeout`, `command-not-found`, `permission-denied`, `network-error`, `disk-full`, `generic`（FIX-03）

### FixResult 结构
- **D-08:** FixResult 字段：`success` + `message` + `verified` + `nextSteps`（VRF-03 基础版）

### Scanner→Fixer 映射
- **D-09:** 硬编码映射表 — `registry.ts` 中显式声明 scanner ID → fixer ID 映射（FIX-02）
- **D-10:** 自注册模式 — fixer 模块 import 时自动注册

### Dry-run 模式
- **D-11:** `fixAll()` 支持 `--dry-run` 参数，只检查 `canFix()` 并展示预期操作

### 入口点
- **D-12:** `src/index.ts` 支持 `fix` 子命令，调用 `fixAll()`
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Requirements
- `.planning/ROADMAP.md` §Phase 1 — Phase goal, requirements: FIX-01, FIX-02, FIX-03, FIX-04, VRF-01, VRF-02, VRF-03
- `.planning/REQUIREMENTS.md` §Fixer Infrastructure — FIX-01 through VRF-03 详细定义
- `.planning/REQUIREMENTS.md` §Layer 2/3 — DIA-01 through PST-04 预置结构

### WinAICheck Reference
- **待查阅:** `WinAICheck/src/fixers/index.ts` — 四阶段流程参考实现（preflight → backup → execute → verify）
- `.planning/research/SUMMARY.md` — WinAICheck 研究摘要，关键风险点

### Codebase Conventions
- `.planning/codebase/ARCHITECTURE.md` — Scanner 自注册模式、registry pattern 描述
- `.planning/codebase/STRUCTURE.md` — 新文件添加位置：`src/fixers/{name}.ts`
- `src/scanners/types.ts` — Scanner 接口模式（Fixer 接口镜像此结构）
- `src/scanners/registry.ts` — Scanner 自注册实现参考
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/scanners/types.ts` — ScanResult/ScanResult 类型定义，Fixer 接口镜像此模式
- `src/scanners/registry.ts` — 自注册模式参考，`registerScanner()` 函数签名
- `src/executor/index.ts` — `runCommand()` 可复用，用于 fixer 执行修复命令

### Established Patterns
- 自注册模式：模块 import 时执行注册，registry 持有全量实例
- Category 分类：`brew`, `apple`, `toolchain`, `ai-tools`, `network`, `permission`, `system`

### Integration Points
- `src/index.ts` — 新增 `fix` 子命令入口
- Scanner registry 可复用，通过 ID 查找对应 scanner 重扫验证
</code_context>

<specifics>
## Specific Ideas

- WinAICheck `src/fixers/index.ts` 约 500 行，是 Phase 1 实现的主要参考
- 验证闭环是核心：fixer 报告成功必须重扫确认，否则比不修更糟
- Homebrew/Rosetta/Node.js 安装失败有已知的中间态，需原子性保证
</specifics>

<deferred>
## Deferred Ideas

**Phase 2/3/4 范畴：**
- PostFixGuidance 接口（Phase 2）
- 绿色风险 fixer 实现（Phase 3）
- 黄色风险 fixer + 手动验证提示（Phase 4）
- Web UI `/api/fix` 端点（Web 交互后续）

None — discussion stayed within phase scope
</deferred>

---

*Phase: 01-fixer-infrastructure*
*Context gathered: 2026-04-12*
