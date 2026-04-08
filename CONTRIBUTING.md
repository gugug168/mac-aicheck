# Contributing to mac-aicheck

## AI Workflow（多 AI 协作规范）

### 分支流程

```
feat/xxx 分支 → push → AI Review → 修复 → PR → 合并到 main
```

所有代码改动必须通过分支流程，禁止直接 push main。

### AI 角色分工

| 角色 | 工具 | 职责 |
|------|------|------|
| 主写作手 | Claude Code | 写初稿、TDD、Plan、Review |
| 审查者A | Codex | OpenAI 系安全/最佳实践审查 |
| 审查者B | Gemini / Claude Code | 逻辑/完整性审查 |
| 编排层 | MCO | 调度、Review 循环、汇总 |

### 分支命名

```
feat/xxx          # 新功能
fix/xxx           # Bug 修复
refactor/xxx      # 重构
docs/xxx          # 文档
```

### 开发流程

**1. 开分支**
```bash
git checkout -b feat/your-feature
```

**2. 编写代码**
Claude Code / 直接写

**3. Commit（AI style）**
```bash
git add .
git commit -m "feat: description

Workflow: mco review"
```

**4. Push**
```bash
git push -u origin feat/your-feature
```

**5. AI Review（MCO）**
```bash
# 完整 review 循环（自动迭代直到结论）
mco review --providers claude,codex --session review-$(date +%m%d)

# 或者快速 review
mco run --providers claude,codex -- "Review the code changes in this branch for: bugs, security issues, performance problems"
```

**6. 修复问题（用 MCO）**
```bash
mco run --providers claude --session fix-xxx -- "Fix the issues found in the review"
```

**7. 更新分支**
```bash
git add . && git commit --amend --no-edit && git push -f
```

**8. 创建 PR**
```bash
gh pr create --repo gugug168/mac-aicheck --title "feat: description" --body "## Summary..." --base main
```

**9. CI 检查**
CI 自动运行：`npm run build && npm test`

**10. 合并**
- PR reviewer approve 后 squash merge
- 删除分支

### Commit Message 规范

```
<type>: <short description>

[type]: feat | fix | refactor | docs | test | chore
[optional body]: 详细说明
[optional footer]: 相关 issue
```

### 代码审查重点

1. **功能正确性** — 逻辑是否正确
2. **安全性** — 注入、权限、敏感信息
3. **性能** — 复杂度、内存、异步
4. **可维护性** — 命名、注释、结构
5. **AI Tooling 集成** — scanner 是否可独立运行

### Scanner 开发规范

- 每个 scanner 独立文件：`src/scanners/<name>.ts`
- 必须注册：`registry.ts`
- 必须 export：`scan()` 函数
- 必须包含：`id, name, category, importance, description, docs, suggestions`
- 不依赖 LLM 做检测逻辑，只用于生成报告

### CI

- Node.js 20+
- `npm run build` 必须通过
- `npm test`（如适用）
