# Roadmap: mac-aicheck 三层修复系统

## Overview

为 mac-aicheck 添加三层修复系统：Fixer 接口 + 验证闭环 + 精准诊断 + 修复后指导。从底层基础设施开始，逐步构建绿色风险 fixer，最终实现黄色风险 fixer。

## Phases

- [x] **Phase 1: Fixer Infrastructure** - Fixer 接口、注册表、错误分类、验证闭环
- [ ] **Phase 2: Diagnostic & Guidance Layers** - 错误映射、预检机制、修复后指导
- [ ] **Phase 3: Green Risk Fixers** - homebrew、npm-mirror、git、rosetta 四个绿色 fixer
- [ ] **Phase 4: Yellow Risk Fixers** - node-version、python-versions 两个黄色 fixer

## Phase Details

### Phase 1: Fixer Infrastructure
**Goal**: 建立 fixer 核心架构，支持 scanner→fixer 映射和验证闭环
**Depends on**: Nothing (first phase)
**Requirements**: FIX-01, FIX-02, FIX-03, FIX-04, VRF-01, VRF-02, VRF-03
**Success Criteria** (what must be TRUE):
  1. `src/fixers/types.ts` defines Fixer interface and FixResult
  2. `src/fixers/registry.ts` implements scanner→fixer mapping
  3. `src/fixers/errors.ts` classifies command failures
  4. `fixAll()` orchestrates fixer execution with verification
**Plans**: 1 plan
Plans:
- [x] 01-PLAN.md — Wave 1-5: types.ts, errors.ts, registry.ts, verify.ts, fixers/index.ts, src/index.ts

### Phase 2: Diagnostic & Guidance Layers
**Goal**: 精准诊断 + 修复后指导，覆盖所有 fixer 通用需求
**Depends on**: Phase 1
**Requirements**: DIA-01, DIA-02, DIA-03, PST-01, PST-02, PST-03, PST-04
**Success Criteria** (what must be TRUE):
  1. Each error type maps to Chinese message + recovery suggestion
  2. Preflight checks prevent invalid fix attempts
  3. PostFixGuidance interface implemented
**Plans**: 2 plans
Plans:
- [x] 02-01-PLAN.md — Wave 1: types.ts extension, errors.ts extension, diagnostics.ts module
- [x] 02-02-PLAN.md — Wave 2: preflight.ts, fixAll integration, CLI guidance

### Phase 3: Green Risk Fixers
**Goal**: 实现四个低风险 fixer，验证完整修复流程
**Depends on**: Phase 2
**Requirements**: GRN-01, GRN-02, GRN-03, GRN-04
**Success Criteria** (what must be TRUE):
  1. All 4 green fixers implemented and working
  2. Each fixer passes verification loop
  3. Dry-run mode works
**Plans**: 1 plan
Plans:
- [ ] 03-01-PLAN.md — Wave 1: homebrew, git, npm-mirror, rosetta fixers + SCANNER_TO_FIXER_MAP

### Phase 4: Yellow Risk Fixers
**Goal**: 实现两个中风险 fixer，完成 v1 功能集
**Depends on**: Phase 3
**Requirements**: YLW-01, YLW-02
**Success Criteria** (what must be TRUE):
  1. Node.js LTS installer works
  2. Python 3.12 installer works
  3. Restart guidance displayed correctly
**Plans**: 1 plan
Plans:
- [ ] 04-01-PLAN.md — Wave 1: node-version, python-versions fixers + SCANNER_TO_FIXER_MAP integration

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fixer Infrastructure | 1/1 | Complete | 2026-04-12 |
| 2. Diagnostic & Guidance Layers | 0/2 | Not started | - |
| 3. Green Risk Fixers | 0/1 | Not started | - |
| 4. Yellow Risk Fixers | 0/1 | Not started | - |
