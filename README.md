# MacAICheck

macOS AI 开发环境一键检测与修复工具。55+ 项自动扫描，覆盖 AI 工具链、系统配置、网络环境，并提供智能修复建议。

## 快速开始

```bash
# 安装
npm install -g mac-aicheck

# 运行检测（默认命令）
mac-aicheck

# 检测并上传结果
mac-aicheck --upload

# JSON 格式输出
mac-aicheck --json
```

## 功能概览

| 功能 | 命令 | 说明 |
|------|------|------|
| 环境检测 | `mac-aicheck scan` | 55+ 项自动扫描，评分并给出建议 |
| 智能修复 | `mac-aicheck fix` | 按风险等级过滤，自动修复环境问题 |
| 生成报告 | `mac-aicheck report` | 输出 HTML/JSON 格式的检测报告 |
| 数据上传 | `mac-aicheck upload` | 上传扫描结果至云端平台 |
| Web 面板 | `mac-aicheck --serve` | 本地 Web Dashboard 可视化查看结果 |
| AI Agent | `mac-aicheck agent` | 启动嵌入式 Hermes Agent 辅助诊断 |

## 扫描器分类（55+）

### AI 工具 (10)

CCSwitch · Claude Code CLI · Claude Code 配置 · Gemini CLI · Hermes Agent · MCP 命令可用性 · MCP 配置健康 · OpenClaw 配置 · OpenClaw

### Apple 平台 (8)

Apple Silicon 检测 · Apple GPU/MPS · 开发者模式 · GPU/Metal 驱动 · Rosetta 2 · 屏幕录制权限 · 虚拟化支持 · WSL/Linux 环境

### 工具链 (16)

Git · Git 身份配置 · Git 凭据链路 · Git PATH · Node.js · Node 版本管理器 · Node 版本冲突 · Node 全局 bin 路径 · Python · Python 环境一致性 · Python 项目 venv · uv 包管理器 · C/C++ 编译器 · Xcode CLT · 包管理器 · Unix 命令

### 网络 (6)

DNS 解析 · 镜像源配置 · npm 镜像源 · 代理配置 · AI 站点连通性 · SSL 证书

### 权限 (6)

管理员权限 · 防火墙端口 · Shell 脚本执行策略 · 终端编码兼容 · 终端配置 · 时间同步

### 系统 (7)

PATH 长度 · GPU 检测 · 长路径 · 路径中文字符 · 路径空格 · 临时目录磁盘 · GPU 内存压力

### 包管理 (1)

Homebrew

## 修复系统

内置 11 个自动修复器，采用三阶段安全流程：**预检 → 执行 → 验证**。

```bash
# 查看可修复项（不实际执行）
mac-aicheck fix --dry-run

# 仅修复绿色（低风险）项
mac-aicheck fix --green

# 修复绿色和黄色项
mac-aicheck fix --green --yellow
```

支持的修复器：Homebrew · Node.js 版本 · Python 版本 · Git/Git 身份 · npm 镜像 · Rosetta · 开发者模式 · 磁盘空间 · Xcode · uv 包管理器

## 报告

```bash
# 扫描并生成 HTML 报告
mac-aicheck report --scan

# 输出 JSON 格式
mac-aicheck report --scan --format json

# 指定输出文件
mac-aicheck report --scan --output result.json

# 扫描 + 修复 + 报告一步完成
mac-aicheck report --scan --fix
```

## 开发

```bash
git clone https://github.com/gugug168/mac-aicheck.git
cd mac-aicheck
npm install
npm run build

# 运行测试
npm test

# 本地开发扫描
npm run scan
```

## 三端生态

| 平台 | 仓库 | 技术栈 |
|------|------|--------|
| macOS | [mac-aicheck](https://github.com/gugug168/mac-aicheck) | Node.js + TypeScript |
| Windows | [WinAICheck](https://github.com/gugug168/WinAICheck) | Bun + TypeScript |
| 服务端 | aicoevo-platform | FastAPI + Next.js + SQLite |

## 🤖 AI每日情报

作者维护的每日 AI 科技 Newsletter——每天 06:00 自动推送，用 AI 整理前两天最重要的 AI 动态，每条附深度解读。

**免费样刊**：[github.com/gugug168/ai-daily-intelligence/issues/1](https://github.com/gugug168/ai-daily-intelligence/issues/1)

**订阅**：微信搜索「知识星球」→ 搜索「AI每日情报」→ 加入
早鸟价 ¥99/年（原价 ¥199/年）

---

## License

MIT
