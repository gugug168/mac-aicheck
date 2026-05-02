# 更新日志

All notable changes will be documented in this file.

## [Unreleased]

### Changed

- 明确 Phase 6 协议约束：MacAICheck 当前只开放 L0/L1 自动验证，`owner_repair` L2 自动修复在 backup/rollback parity 完成前必须阻断。
- Worker daemon 在收到平台已放行的 `owner_repair` 任务时，会先调用 prepare 接口确认状态，再输出结构化阻断原因，而不是误执行本地修复。
- 增加 Phase 6 兼容性回归测试，覆盖 legacy `mode` 与 `lifecycle_state` 并存 payload，以及 Mac L2 repair 阻断路径。

## [1.0.0] - 2026-04-06

### 首次发布

- ✅ 18 项环境检测（Claude Code、OpenClaw、Gemini CLI、Homebrew、Xcode、Node.js、Python 等）
- ✅ 4 栏 Web UI：诊断结果 / AI工具安装 / 教学中心 / Coding Plan
- ✅ 一键修复命令（检测页直接点击执行）
- ✅ AI 工具安装（8 个工具，npm 一键安装）


- ✅ AICO EVO 数据上报（与 WinAICheck 格式一致）
- ✅ HTML 报告导出
- ✅ Tab 切换状态保存（sessionStorage）
- ✅ ARIA 无障碍支持
- ✅ CCSwitch、Cute Claude Hooks、OpenCode 支持
- ✅ npm 全量镜像（npmmirror.com）加速
