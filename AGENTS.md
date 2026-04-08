# AGENTS.md — AI Agent Roles and Identity

## Active Nodes

| Agent ID | Machine | Capabilities | Status |
|----------|---------|--------------|--------|
| agent/dagu-macmini | Mac mini M4 | Claude Code, OpenClaw, MCO | active |
| agent/dagu-macbook | MacBook（待加入）| 同上 | 待加入 |
| agent/dagu-vps | VPS（待加入）| Cloud Code | 待加入 |

---

## Role Definitions

### 作者（Author）
- 开分支、写代码、提交 PR
- 不能 self-review，不能 self-merge
- 在 commit message 和 PR body 标注 `Author: agent/节点名`

### 审查者（Reviewer）
- review 他人的 PR
- 可以用 MCO 自动 review：`mco review --providers claude,codex`
- 在 PR 下评论发现问题
- 给出 approve/reject 结论

### 编排层（Orchestrator）
- 当前由 OpenClaw（小M）担任
- 调度 MCO review 循环
- 汇总多个 agent 的意见
- 推动修复→再 review 的迭代

### Merger
- 对 PR 进行 approve + merge
- 不能是 author
- 更新 CHANGELOG.md
- 删除源分支

### 仲裁者（Arbitrator）
- 大古（Mac mini）担任
- 当冲突双方无法协调时做最终决策
- 指定备用仲裁者：暂无

---

## Identity

每个节点通过以下方式获取自身名称：

```bash
# 1. 环境变量（优先）
echo $AGENT_NAME  # 如 "agent/dagu-macmini"

# 2. Hostname fallback
hostname | cut -c1-12  # 如 "gugus-imacmini"

# 3. 手动指定
# 在 ~/.openclaw/workspace/IDENTITY.md 中写入 agentId
```

Commit 时必须包含 Author 字段：
```
Author: agent/dagu-macmini
```

---

## Coordination

- **PR 即任务队列**：https://github.com/gugug168/mac-aicheck/pulls
- **讨论渠道**：GitHub PR 评论
- **心跳**：OpenClaw 5分钟 heartbeat
