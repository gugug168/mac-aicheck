# MacAICheck

macOS AI 开发环境一键检测与修复工具。自动扫描 55+ 项环境配置，定位 AI 开发工具链问题，并提供自动修复方案。

## 功能概览

- **环境扫描** — 55+ 检测项，覆盖工具链、AI 工具、网络、权限等 7 大类别
- **自动修复** — 内置 Fixer 系统，对常见问题提供一键修复
- **评分报告** — 综合评分 + HTML 可视化报告
- **云端同步** — 扫描结果上传至 AICoEvo 平台，跨设备追踪环境健康度

## 快速开始

```bash
# 安装
npm install -g mac-aicheck

# 运行扫描
mac-aicheck scan

# 生成 HTML 报告
mac-aicheck report

# 上传扫描结果
mac-aicheck upload
```

## 检测项一览

MacAICheck 内置 55+ 扫描器，按 7 个类别组织：

| 类别 | 检测项 | 示例 |
|------|--------|------|
| **Apple** | Apple Silicon、Rosetta 2、GPU/Metal、开发者模式、虚拟化、屏幕录制权限 | `apple-silicon` `rosetta` `gpu-driver` `virtualization` |
| **工具链** | Node.js、Python、Git、Xcode CLT、C++ 编译器、uv、包管理器 | `node-version` `python-versions` `git` `xcode` `cpp-compiler` |
| **AI 工具** | Claude Code、Gemini CLI、Hermes Agent、OpenClaw、MCP 配置 | `claude-code` `gemini-cli` `hermes` `mcp-config-health` |
| **网络** | DNS 解析、SSL 证书、代理配置、AI 站点连通性、镜像源 | `dns-resolution` `ssl-certs` `site-reachability` `npm-mirror` |
| **权限** | 管理员权限、防火墙端口、Shell 执行策略、终端配置 | `admin-perms` `firewall-ports` `shell-encoding-health` |
| **系统** | PATH 长度、磁盘空间、GPU 内存压力、路径中文字符、长路径 | `env-path-length` `temp-space` `vram-usage` `path-chinese` |
| **包管理** | Homebrew 安装与配置 | `homebrew` |

每项检测返回 `pass` / `warn` / `fail` 三级状态，综合计算环境健康评分。

## 自动修复

MacAICheck 内置 Fixer 系统，对扫描发现的问题提供自动修复：

```
scanAll() → 识别问题 → 匹配 Fixer → preflight → backup → execute → verify
```

已实现的 Fixer（12 项）：

- `homebrew-fixer` — Homebrew 安装与修复
- `xcode-fixer` — Xcode Command Line Tools 安装
- `node-version-fixer` — Node.js 版本修复
- `python-versions-fixer` — Python 版本修复
- `git-fixer` / `git-identity-fixer` — Git 配置修复
- `npm-mirror-fixer` — npm 镜像源配置
- `rosetta-fixer` — Rosetta 2 安装
- `developer-mode-fixer` — 开发者模式启用
- `disk-space-fixer` — 磁盘空间清理指导
- `uv-package-manager-fixer` — uv 包管理器安装
- `ai-tools-fixer` — AI 工具安装配置

修复流程包含验证闭环：修复后自动重扫确认问题已解决。

## 项目架构

```
src/
├── scanners/          # 扫描器实现（自注册到 registry）
│   ├── registry.ts   # 扫描器注册表
│   ├── types.ts      # ScanResult 类型定义
│   └── index.ts      # scanAll() 编排
├── fixers/           # 修复器实现
│   ├── types.ts      # Fixer 接口与 FixResult
│   ├── registry.ts   # 修复器注册表
│   ├── errors.ts     # 错误分类系统
│   ├── verify.ts     # 验证闭环
│   ├── orchestrator.ts # 修复编排
│   └── index.ts      # fixAll() 入口
├── scoring/          # 评分计算
├── report/           # HTML/JSON 报告生成
├── web/              # Web Dashboard 渲染
├── api/              # AICoEvo API 客户端
├── agent/            # Agent 子系统（bind、事件、Hermes hook）
├── installers/       # AI 工具安装器
├── shared/           # 共享工具（错误信号等）
└── cli/              # CLI 参数解析
```

## 三端生态

MacAICheck 是 AICoEvo 三端生态的 macOS 客户端：

| 仓库 | 平台 | 技术栈 |
|------|------|--------|
| [WinAICheck](https://github.com/gugug168/WinAICheck) | Windows | Bun + TypeScript |
| **MacAICheck** | macOS | Node + TypeScript |
| [aicoevo-platform](https://github.com/gugug168/aicoevo-platform) | 服务端 | FastAPI + Next.js + SQLite |

## 开发

```bash
# 克隆仓库
git clone https://github.com/gugug168/mac-aicheck.git
cd mac-aicheck

# 安装依赖
npm install

# 构建
npm run build

# 运行测试
npm test

# 本地扫描
npm run scan
```

## 贡献

请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解协作规范。

## 许可

MIT
