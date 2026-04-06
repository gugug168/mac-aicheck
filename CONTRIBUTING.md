# 贡献指南

感谢关注 MacAICheck！欢迎提交 Issue 和 Pull Request。

## 开发环境

- macOS 15+
- Node.js 20+
- npm 10+

## 开发流程

1. **Fork** 本仓库
2. **克隆**你的 Fork：`git clone https://github.com/YOUR_NAME/mac-aicheck.git`
3. **安装依赖**：`npm install`
4. **编译**：`npm run build`
5. **创建分支**：`git checkout -b feature/your-feature-name`
6. **开发 + 测试**
7. **提交**：`git commit -m 'feat: add xxx'`
8. **Push**：`git push origin feature/your-feature-name`
9. **打开 Pull Request**

## 代码规范

- TypeScript strict 模式
- 提交前运行 `npm run build` 确保编译通过
- Scanner 命名：`snake-case`（如 `claude-code.ts`）
- Scanner 必须实现 `Scanner` 接口（见 `src/scanners/types.ts`）

## Scanner 接口

```typescript
interface Scanner {
  id: string;           // 唯一 ID（snake-case）
  name: string;         // 显示名称
  category: ScannerCategory;  // 分类
  async check(): Promise<CheckResult>;  // 检测逻辑
  async fix?(): Promise<FixResult>;     // 修复逻辑（可选）
}
```

## 分类

- `brew` — Homebrew 相关
- `apple` — macOS 系统相关
- `toolchain` — 开发工具链
- `ai-tools` — AI 工具
- `network` — 网络与代理
- `permission` — 权限相关

## 提交信息规范

参考 [Conventional Commits](https://www.conventionalcommits.org/)：

- `feat:` — 新功能
- `fix:` — Bug 修复
- `docs:` — 文档更新
- `refactor:` — 重构
- `test:` — 测试
- `chore:` — 构建/工具变更
