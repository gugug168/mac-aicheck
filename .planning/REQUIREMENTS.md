# Requirements: mac-aicheck 三层修复系统

**Defined:** 2026-04-12
**Core Value:** 用户运行检测后，能自动修复发现的问题，无需手动搜索解决方案

## v1 Requirements

### Fixer Infrastructure

- [ ] **FIX-01**: Fixer 接口 — 定义 `Fixer` 接口包含 `id`, `name`, `risk`, `canFix()`, `execute()` 方法
- [ ] **FIX-02**: Fixer 注册表 — `src/fixers/registry.ts` 实现自注册模式，映射 scanner → fixer
- [ ] **FIX-03**: 错误分类系统 — 将命令执行失败归类为 `timeout`, `command-not-found`, `permission-denied`, `network-error`, `disk-full`, `generic`
- [ ] **FIX-04**: 预检机制 — 修复前检查前置条件，不满足返回精准提示

### Layer 1: 验证闭环

- [ ] **VRF-01**: 验证循环 — 修复执行后重新运行对应 scanner 验证
- [ ] **VRF-02**: 验证结果类型 — `pass`（通过）、`warn`（部分修复）、`fail`（未生效）
- [ ] **VRF-03**: FixResult 接口 — 包含 `success`, `message`, `verified`, `partial`, `nextSteps`, `newScanResult`

### Layer 2: 精准诊断

- [ ] **DIA-01**: 错误分类映射 — 每种错误类型对应中文提示和解决建议
- [ ] **DIA-02**: 前置条件检查器 — 可配置的前置规则（brew 可用？网络通畅？有写权限？）
- [ ] **DIA-03**: 诊断信息展示 — 修复失败时给出精准下一步操作

### Layer 3: 修复后指导

- [ ] **PST-01**: PostFixGuidance 接口 — `needsTerminalRestart`, `needsReboot`, `verifyCommands`, `notes`
- [ ] **PST-02**: 终端重启提示 — PATH 修改、brew 安装后提示新开终端
- [ ] **PST-03**: 系统重启提示 — 系统级变更后提示需要重启
- [ ] **PST-04**: 手动验证命令 — 提供给用户确认修复成功的命令

### Green Risk Fixers (低风险)

- [ ] **GRN-01**: homebrew fixer — 安装 Homebrew
- [ ] **GRN-02**: npm-mirror fixer — 设置 npm 镜像
- [ ] **GRN-03**: git fixer — 安装 git 并配置全局身份
- [ ] **GRN-04**: rosetta fixer — 安装 Rosetta 2

### Yellow Risk Fixers (中风险)

- [ ] **YLW-01**: node-version fixer — 安装/升级 Node.js (LTS)
- [ ] **YLW-02**: python-versions fixer — 安装 Python 3.12

## v2 Requirements

### Yellow Risk Fixers

- **YLW-03**: proxy-config fixer — 配置系统代理
- **YLW-04**: ssl-certs fixer — 添加 SSL 证书
- **YLW-05**: dns-resolution fixer — 配置 DNS 服务器

### Red Risk Fixers (高风险，需额外确认)

- **RED-01**: developer-mode fixer — 提示用户手动在系统设置中开启
- **RED-02**: screen-permission fixer — 提示用户在系统设置中授权

## Out of Scope

| Feature | Reason |
|---------|--------|
| 修复系统 Web UI | Phase 1 聚焦 CLI，Web 交互后续 |
| 修复历史记录 | 数据持久化，后续 phase |
| 云端配置 | 企业场景，不在当前范围 |
| 自动 sudo 提权 | 风险过高，仅提示用户手动授权 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FIX-01 | Phase 1 | Pending |
| FIX-02 | Phase 1 | Pending |
| FIX-03 | Phase 1 | Pending |
| FIX-04 | Phase 1 | Pending |
| VRF-01 | Phase 1 | Pending |
| VRF-02 | Phase 1 | Pending |
| VRF-03 | Phase 1 | Pending |
| DIA-01 | Phase 2 | Pending |
| DIA-02 | Phase 2 | Pending |
| DIA-03 | Phase 2 | Pending |
| PST-01 | Phase 2 | Pending |
| PST-02 | Phase 2 | Pending |
| PST-03 | Phase 2 | Pending |
| PST-04 | Phase 2 | Pending |
| GRN-01 | Phase 3 | Pending |
| GRN-02 | Phase 3 | Pending |
| GRN-03 | Phase 3 | Pending |
| GRN-04 | Phase 3 | Pending |
| YLW-01 | Phase 4 | Pending |
| YLW-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-12 after initial definition*
