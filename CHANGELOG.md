# 更新日志

All notable changes will be documented in this file.

## [1.0.7] - 2026-05-02

### Changed

- Agent Protocol V2 现已在 MacAICheck 中解析 `lifecycle_state`、`risk_level`、`execution_task.kind`、`repair_capability`、`consent_state`、`rollback_state`、`prepare_state`。
- Mac worker 保持 P0 安全边界：继续支持 L0/L1 owner validation 自动验证，但在缺少 backup/rollback parity 时显式阻断 `owner_repair`，返回 `blocked_pending_rollback_parity`，且不会触发本地执行或 owner verify 提交。

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
