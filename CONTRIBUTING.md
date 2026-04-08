# Contributing to mac-aicheck

## 协作理念

mac-aicheck 由**多个 AI 节点**分布式协作维护，GitHub 作为协调中枢。
每个节点（Mac mini、MacBook、VPS 等）都可以是作者、Reviewer、Merger，
角色轮换，分工协作，像开源社区一样运转。

---

## 协作架构

```
                    GitHub（协调中枢）
                    ├─ main（稳定分支）
                    ├─ feat/xxx（各自分支）
                    └─ PR（审核+合并入口）

  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
  │ OpenClaw A  │  │ OpenClaw B  │  │ OpenClaw C  │
  │ Claude Code │  │ Claude Code │  │ Cloud Code  │
  │ → 写代码    │  │ → Review    │  │ → 写代码    │
  └─────────────┘  └─────────────┘  └─────────────┘
```

---

## 节点身份（Agent Identity）

每个节点必须有唯一名称，commit、PR、review 时使用。

**命名格式：** `agent/<节点描述>-<机器名>`

**示例：**
```
agent/dagu-macmini        # 大古的 Mac mini
agent/dagu-macbook        # 大古的 MacBook
agent/dagu-vps            # VPS 服务器
```

**节点如何知道自己叫什么：**

1. **优先从环境变量读取** `AGENT_NAME`（由 OpenClaw launchd plist 注入）
2. **fallback 到 hostname**：截取前12字符，小写化
3. **手动指定**：在节点的 `~/.openclaw/workspace/IDENTITY.md` 里写入 `agentId`

commit 时引用：
```
Author: agent/dagu-macmini
```

PR labels 自动标注节点：`agent/dagu-macmini`

---

## 新节点 onboarding

新节点加入时，按以下步骤获取项目上下文：

**Step 1 — clone 并读取项目文档**
```bash
git clone https://github.com/gugug168/mac-aicheck.git
cd mac-aicheck
# 阅读项目说明
cat CLAUDE.md      # 项目架构和当前状态
cat AGENTS.md     # 角色定义和行为规范
cat CONTRIBUTING.md  # 本文档
```

**Step 2 — 了解进行中的工作**
```bash
# 查看 open PRs
gh pr list --repo gugug168/mac-aicheck --state open

# 查看 main 最新状态
git checkout main && git pull origin main
```

**Step 3 — 向协调者（我）报到**
发送消息告知：节点名称、能力（Claude Code / Codex / Gemini）、当前状态。

---

## 分支流程

```
feat/xxx 分支 → push → 其他人 Review → 修复 → PR → 外部 Reviewer approve → 合并到 main
```

**所有代码改动必须通过分支流程，禁止直接 push main。**

### 分支命名规范

```
feat/ai-review-20260408         # 新功能（日期+描述）
fix/scan-timeout                 # Bug 修复
refactor/scanner-registry        # 重构
docs/contributing                # 文档
agent/dagu-macmini              # 特定节点任务
```

---

## 核心原则

**最重要的两条规则：**

1. **作者不能 merge 自己的 PR** — 必须至少 1 个其他节点 review + approve
2. **谁写的代码，谁提交；由其他人来 review** — 自由接管，不固定审法

---

## AI 角色分工

| 角色 | 工具 | 职责 |
|------|------|------|
| 作者 | Claude Code | 写代码、开分支、提交 PR |
| 审查者 | 任意其他 OpenClaw/AI | review 别人的 PR、发现问题 |
| 编排层 | MCO（任意节点） | 调度 review 循环、汇总意见 |
| Merger | 任意非作者的 reviewer | approve + 合并（不能是作者） |

**重要：同一节点的 Claude Code 不能 self-review，必须由其他节点审查。**

---

## 开发流程（10步）

### Step 1 — 开分支
```bash
git checkout main && git pull origin main
git checkout -b feat/your-feature
```

### Step 2 — 编写代码
Claude Code / 直接写，遵循 Scanner 规范（见下文）

### Step 3 — Commit（标注作者）
```bash
git add .
git commit -m "feat: description

Author: agent/dagu-macmini
Workflow: mco review"
```

### Step 4 — Push
```bash
git push -u origin feat/your-feature
```

### Step 5 — 创建 PR，通知 Reviewer
```bash
gh pr create --repo gugug168/mac-aicheck \
  --title "feat: description" \
  --body "## Summary
...

## Author
agent/dagu-macmini

## Checklist
- [ ] External review required（作者不能 self-merge）
- [ ] mco review passed
- [ ] CI checks pass
- [ ] 新功能有对应测试
- [ ] 手动测试步骤已记录（如适用）" \
  --base main
```

### Step 6 — 等待外部 Review
其他节点看到 PR 后自由接管 review，用 `gh pr review` 或直接在 GitHub UI 评论。

### Step 7 — 修复问题（如有）
```bash
git add . && git commit -m "fix: address review comments

Reviewer: agent/dagu-macbook
" && git push
```

### Step 8 — Reviewer approve
非作者的 reviewer 在 GitHub approve。

### Step 9 — CI 检查
CI 自动运行：`npm run build && npm test`
PR 必须 CI 通过才能合并。

### Step 10 — Merge
- **只有 reviewer 可以 merge**，作者自己不能点 merge
- Squash merge 到 main
- 删除源分支

---

## Commit Message 规范

```
<type>: <short description>

Author: agent/节点名
Reviewer: agent/审阅者名（PR 合并时填）
Workflow: mco review
```

**示例：**
```
feat: add gpu-monitor scanner

Monitor GPU status using powermetrics and pmset.
Detect Apple Silicon GPU thermal throttling.

Author: agent/dagu-macmini
Workflow: mco review
```

---

## Review 规则

1. **作者不能 review 自己的代码** — 自己写的 PR 必须别人审
2. **作者不能 merge 自己的 PR** — 必须外部 approve
3. **Reviewer 不固定** — 谁有空谁接，先到先审
4. **Reviewer 可以是任意节点** — 不限于特定机器
5. **Review 可以用 MCO** — `mco review --providers claude,codex` 跑自动 review

---

## 冲突处理

当两个分支修改了同一文件时：

**检测到冲突：**
```bash
git fetch origin
git merge origin/main  # 或 git rebase origin/main
# Git 报告冲突
```

**处理流程：**
1. **小冲突**（<5行）：直接在当前分支解决，commit 后 push
2. **大冲突**：联系对方节点协商（飞书/消息），决定谁让或共同解决
3. **长时间无法协调**：由我（大古/Mac mini）作为仲裁者，决定保留哪边
4. **主动避免冲突**：PR 要小而快，改动超过200行优先拆成多个 PR

---

## 工作交接（Handoff）

当节点需要离线，或任务需要转交给其他人时：

**声明接管：**
在 PR 下评论：`Taking over this PR (agent/dagu-macbook)`

**交接信息应包含：**
- 当前进度（完成了什么）
- 未解决的问题
- 关键决策记录
- 相关文件路径

**超期处理：**
- 分支 7 天无活动 → 我（Mac mini）有权接管或关闭
- 作者失联超过 14 天 → 直接由 reviewer merge（需 double approve）

---

## 代码审查重点

1. **功能正确性** — 逻辑是否正确，边界条件
2. **安全性** — 注入、权限、敏感信息外泄
3. **性能** — 时间复杂度、内存、异步操作
4. **可维护性** — 命名、注释、代码结构
5. **AI Tooling 集成** — scanner 是否可独立运行

---

## 代码风格规范

项目使用 TypeScript，遵循以下规则：

**引用配置：** `.prettierrc` + `.eslintrc`

**主要约定：**
- 变量/函数：`camelCase`（如 `calculateScore`）
- 类型/接口：`PascalCase`（如 `ScanResult`）
- 常量：`UPPER_SNAKE_CASE`（如 `MAX_RETRIES`）
- 导入排序：内置模块 → 外部库 → 内部模块
- 每个文件不超过 200 行

**Prettier 自动格式化：** `npm run format`

---

## 测试规范

- Scanner 必须可独立运行测试
- 新增 scanner 须在 `src/__tests__/` 下有对应测试
- 测试覆盖率目标：核心逻辑 > 80%
- 测试命令：`npm test`

**Scanner 单元测试示例：**
```typescript
import { describe, it, expect } from 'vitest';
import { checkGpu } from '../scanners/gpu-monitor';

describe('gpu-monitor', () => {
  it('should detect Apple Silicon GPU', async () => {
    const result = await checkGpu();
    expect(['pass', 'warn', 'fail']).toContain(result.status);
  });
});
```

---

## Scanner 开发规范

每个 scanner 独立文件，遵循以下规范：

```typescript
// src/scanners/<name>.ts
import { registerScanner, type Scanner } from './types';

const scanner: Scanner = {
  id: 'my-scanner',
  name: 'My Scanner',
  category: 'system',          // system | network | dev-tools | git | ai-tools | privacy
  importance: 3,               // 1-5，5最高
  description: 'What this checks',
  docs: 'https://...',         // 相关文档链接
  scan: async (): Promise<ScanResult> => {
    return { id, name, category, status: 'pass', message: '...' };
  },
};

registerScanner(scanner);
```

**必须包含字段：** `id, name, category, importance, description, docs`

---

## 分支保护（main）

main 分支必须配置以下 GitHub branch protection：

- ✅ Require a pull request before merging（禁止直接 push）
- ✅ Require at least 1 approving review（作者不能 self-merge）
- ✅ Dismiss stale reviews（推送新 commit 后清除旧 approve）
- ✅ Require status checks to pass before merging（CI 必须绿）

---

## CHANGELOG 规范

所有版本改动记录在 `CHANGELOG.md`，格式参考 [Keep a Changelog](https://keepachangelog.com/)：

```markdown
## [1.2.0] - 2026-04-08

### Added
- gpu-monitor scanner

### Changed
- API field mapping (systemInfo → platform)

### Fixed
- developer-mode scanner SIP detection bug
```

**规则：**
- 每个 PR merge 到 main 后，更新 CHANGELOG 是 Merge 的职责
- 格式：`Added / Changed / Deprecated / Removed / Fixed / Security`

---

## Issue 模板

项目使用 `.github/ISSUE_TEMPLATE/` 下的模板：

- `bug-report.md` — Bug 报告（scanner 失效、功能错误）
- `feature-request.md` — 新功能请求
- `question.md` — 一般问题

创建 Issue 时选择对应模板，填写清楚。

---

## CI 规范

- Node.js 20+
- `npm run build` 必须通过（TSC 编译）
- `npm test` 必须通过（Vitest 测试）
- GitHub Actions 自动运行 on push/PR
- PR 必须 CI 绿了才能合并

---

## 大古（Maintainer）的职责

- 作为备用 Merger，review 并合并所有无人接管的 PR
- 维护 CONTRIBUTING.md 规范
- 监控 CI 健康状态
- 决策技术方向和架构演进
- 担任冲突仲裁者
- 定期（每14天）review open PRs，处理超期分支

---

## 风险和应对

| 风险 | 应对 |
|------|------|
| PR 无人 review 堆积 | 谁先看到谁接，公平轮流 |
| 作者 self-merge | GitHub branch protection 强制阻止 + 规则约束 |
| 多人改同一文件分支冲突 | PR 小而快；主动协调；超期由 Maintainer 仲裁 |
| 低质量代码被 merge | CI 卡下限；Reviewer 卡上限 |
| 节点离线/失联 | 7天无活动可接管；14天失联直接由 reviewer merge |
| 新节点不了解项目 | onboarding 流程 + CLAUDE.md + AGENTS.md |
