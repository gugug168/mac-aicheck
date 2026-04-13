# Phase 1: Fixer Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 01-fixer-infrastructure
**Areas discussed:** Fixer接口风格, 验证策略, 错误分类, FixResult结构, Scanner→Fixer映射, Dry-run模式, 入口点

---

## Fixer接口风格

| Option | Description | Selected |
|--------|-------------|----------|
| 镜像 Scanner 模式（推荐） | Fixer 同样自注册，有 id/name/risk，方法为 execute()。与 Scanner 模式一致，上游熟悉 | ✓ |
| 类 WinAICheck 四阶段 | 每步独立：preflight→backup→execute→verify。灵活性高但复杂度也高 | |
| 简化三步：check→fix→verify | 合一阶段：canFix()=check, execute()=fix, 内部含验证 | |

**User's choice:** 镜像 Scanner 模式（推荐）
**Notes:** 一致性优先，降低学习成本

---

## Fixer接口字段

| Option | Description | Selected |
|--------|-------------|----------|
| id + name + risk + canFix() + execute()（推荐） | 基础接口：id/name/risk 与 Scanner 一致，canFix() 替代 scan()，execute() 执行修复 | ✓ |
| 扩展版：+ category + priority + timeout | category 分组、priority 修复顺序、timeout 防卡死 | |
| 最小版：id + execute() 即可 | 极简，runtime 由 registry 层处理元数据 | |

**User's choice:** id + name + risk + canFix() + execute()（推荐）

---

## 验证策略

| Option | Description | Selected |
|--------|-------------|----------|
| 自动重扫（推荐） | fixAll() 完成后自动重新运行对应 scanner 验证，VRF-01 要求 | ✓ |
| 手动验证命令 | 不自动重扫，返回验证命令让用户自己执行确认（更安全但体验差） | |
| 混合模式 | 绿色风险自动重扫，黄色风险提示手动验证 | |

**User's choice:** 自动重扫（推荐）

---

## 验证结果

| Option | Description | Selected |
|--------|-------------|----------|
| pass / warn / fail 三态（推荐） | pass=修复成功，warn=部分修复需关注，fail=未修复 | ✓ |
| pass / partial / fail 三态 | pass=完全修复，partial=部分修复（如权限不足），fail=完全失败 | |
| pass / fail 二态 | 简单直接，不区分部分修复状态 | |

**User's choice:** pass / warn / fail 三态（推荐）

---

## 错误分类

| Option | Description | Selected |
|--------|-------------|----------|
| 六类：timeout/command-not-found/permission-denied/network-error/disk-full/generic（推荐） | FIX-03 要求，覆盖主要失败模式，实用性强 | ✓ |
| 精简四类：network/permission/resource/unknown | 归并版：网络、权限、资源、其他 | |
| 扩展八类：再加 command-exists/missing-dependency/invalid-config | 更细分：命令是否存在、缺少依赖、配置错误 | |

**User's choice:** 六类：timeout/command-not-found/permission-denied/network-error/disk-full/generic（推荐）

---

## FixResult结构

| Option | Description | Selected |
|--------|-------------|----------|
| success + message + verified + nextSteps（推荐） | VRF-03 要求：success 布尔、message 说明、verified 是否已验证、nextSteps 下一步 | ✓ |
| 扩展版：+ partial + newScanResult | VRF-03 完整版：再含 partial 布尔和 newScanResult 验证扫描结果 | |
| 最小版：success + message 即可 | 简化，验证状态由调用方自行判断 | |

**User's choice:** success + message + verified + nextSteps（推荐）

---

## Scanner→Fixer映射方式

| Option | Description | Selected |
|--------|-------------|----------|
| registry.ts 中硬编码映射（推荐） | FIX-02 要求，类似 scanners/registry.ts，自注册模式 + 映射表 | ✓ |
| 按 scanner ID 约定命名 | 约定 scanner 'git' → fixer 'GitFixer'，自动推断，无需映射表 | |
| fixer 注册时声明可处理的 scanner IDs | fixer 自声明我能修复哪些 scanner，registry 按此索引 | |

**User's choice:** registry.ts 中硬编码映射（推荐）

---

## Dry-run模式

| Option | Description | Selected |
|--------|-------------|----------|
| 是，--dry-run 只展示将要执行的修复（推荐） | 不实际执行，只检查 canFix() 并显示预期操作 | ✓ |
| 是，但用 --preview 替代 --dry-run | 同上面但命名不同 | |
| 否，先做完整实现再说 | Phase 1 不含干运行，后续再加入 | |

**User's choice:** 是，--dry-run 只展示将要执行的修复（推荐）

---

## 入口点

| Option | Description | Selected |
|--------|-------------|----------|
| src/index.ts 支持 fix 子命令（推荐） | mac-aicheck fix，调用 fixAll()，复用现有 CLI 框架 | ✓ |
| 独立 fixers/index.ts 入口 | 单独入口文件，mac-aicheck-fix CLI | |
| Web UI 触发 /api/fix 端点 | 端口 7890，Web 界面触发修复操作 | |

**User's choice:** src/index.ts 支持 fix 子命令（推荐）

---

## Claude's Discretion

- Phase 2/3/4 的细节（PostFixGuidance、绿色/黄色 fixer）由后续 phase 决策

## Deferred Ideas

None — all discussion stayed within Phase 1 scope.
