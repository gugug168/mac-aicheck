# Phase 2: Diagnostic & Guidance Layers - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 02-diagnostic-guidance-layers
**Areas discussed:** PostFixGuidance 结构, Preflight 检查机制, 诊断信息展示, 手动验证命令

---

## PostFixGuidance 结构

| Option | Description | Selected |
|--------|-------------|----------|
| Fixer.getGuidance() 方法 | Fixer 接口增加可选 getGuidance() 方法，各 fixer 实现自己的 guidance，更灵活且符合自注册模式 | ✓ |
| FixResult 嵌入结构 | FixResult 增加 guidance 字段，fixer.execute() 返回时附带，更简单但 fixer 接口变重 | |
| 独立 guidance.ts 模块 | 单独的 guidance registry，fixer ID → PostFixGuidance 映射表，与 fixer 接口解耦但需维护两份数据 | |

**User's choice:** Fixer.getGuidance() 方法
**Notes:** 

---

## Guidance 展示时机

| Option | Description | Selected |
|--------|-------------|----------|
| fixAll() 返回后由 CLI 层处理 | fixAll() 在 FixResult.nextSteps 中返回 guidance 提示，CLI(index.ts) 负责格式化展示，更干净 | ✓ |
| verify.ts 的 buildNextSteps() 整合 | verify.ts 的 buildNextSteps() 自动合并 Fixer.getGuidance() 的内容，一次返回完整 nextSteps | |

**User's choice:** fixAll() 返回后由 CLI 层处理
**Notes:** 

---

## Preflight 检查机制

| Option | Description | Selected |
|--------|-------------|----------|
| Fixer.preflightChecks: PreflightCheck[] | Fixer 接口增加可选 preflightChecks: PreflightCheck[] 数组，每个 check 是 { id, check(), message } 结构，简洁且可扩展 | ✓ |
| Fixer.runPreflights() 方法 | Fixer 接口增加可选 runPreflights(scanResult) 方法，各 fixer 完全自定义，灵活性最高但实现成本高 | |
| 独立 preflight.ts 模块 | 共享的 preflight registry，所有 fixer 共享同一套检查函数，复用性最好 | |

**User's choice:** Fixer.preflightChecks: PreflightCheck[]
**Notes:** 用户表示希望形象化说明，选择了方案 A（框架自动跑检查，fixer 作者只需专注修复逻辑）

---

## PreflightCheck 结构

| Option | Description | Selected |
|--------|-------------|----------|
| async () → { pass: boolean; message?: string } | 无参数，返回 pass + 可选 message，简单直接，各 fixer 直接 async () => checkBrewExists() | ✓ |
| async (scanResult) → { pass: boolean; message?: string } | 接收 ScanResult 参数，可根据扫描结果定制检查（如检查特定路径是否存在） | |
| 固定参数: () → string | null 最简单形式：返回 null = 通过，返回 string = 失败且 string 是错误消息 | |

**User's choice:** async () → { pass: boolean; message?: string }
**Notes:** 用户表示自己是技术小白，希望用简单方案。方案 A 是最简单的：框架自动跑检查，fixer 作者只需专注"修复逻辑"。

---

## 诊断信息展示

| Option | Description | Selected |
|--------|-------------|----------|
| ERROR_MESSAGES + ClassifiedError 扩展 | Phase 1 的 ERROR_MESSAGES 已经很完整，diagnostics 模块扩展它：增加 error.code、recoverable 标志、context 字段，CLI 直接查表展示 | ✓ |
| FixResult.message 自由格式 | Fixer 自己构造 message 字符串，fixAll() 直接展示，灵活性最高但每实现一个 fixer 都要写展示逻辑 | |
| Fixer.diagnosticHints 字段 | Fixer 接口增加可选 diagnosticHints: string[]，修复失败时展示，per-fixer 但难以标准化 | |

**User's choice:** ERROR_MESSAGES + ClassifiedError 扩展
**Notes:** 

---

## 验证命令来源

| Option | Description | Selected |
|--------|-------------|----------|
| Fixer.getVerificationCommand() 方法 | Fixer 接口增加可选 getVerificationCommand(): string | string[] 方法，各 fixer 提供自己的验证命令，符合自注册模式 | ✓ |
| verifyCommands 内置在 Fixer.getGuidance() 中 | PostFixGuidance 结构包含 verifyCommands，getGuidance() 返回时附带验证命令，更内聚但 guidance 结构变重 | |
| 独立 verify-commands.ts 映射表 | 独立的 scanner ID → 验证命令映射表，与 fixer 实现分离，维护成本低但增加追踪复杂度 | |

**User's choice:** Fixer.getVerificationCommand() 方法
**Notes:** 

---

## Claude's Discretion

无 — 所有决策均通过用户讨论明确选择

## Deferred Ideas

无
