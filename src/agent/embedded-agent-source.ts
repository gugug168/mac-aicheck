/**
 * embedded-agent-source.ts
 *
 * 将 mac-aicheck agent 核心逻辑提取为 JS string (AGENT_LITE_SOURCE)，
 * 可写入 ~/.mac-aicheck/agent/agent-lite.js 独立运行，或被其他进程调用。
 *
 * 对应 Milestone 2：embedded-agent-lite.js
 *
 * 该文件只做字符串导出，不含运行时逻辑。
 * 实际 AGENT_LITE_SOURCE 内容通过 build 脚本从 src/agent/index.ts 提取。
 *
 * Hash 值在 build 脚本运行后更新，确保内容与源码一致。
 */

// Build metadata — 由 scripts/build-embedded-agent.ts 维护
export const AGENT_LITE_HASH = 'dev-unbuilt';
export const AGENT_LITE_BUILT_AT: string | null = null;

/**
 * mac-aicheck agent-lite 源码。
 * 包含：config 读写、event capture、sync、bind（OAuth 设备流）、
 * hook 安装、worker daemon、bounty 循环、review 循环等全部逻辑。
 *
 * 完整内容在 build 时从 src/agent/index.ts 提取并注入。
 * 开发环境直接 require('../index.js')；发布时写入 agent-lite.js 独立文件。
 */
export const AGENT_LITE_SOURCE = `
'use strict';
// mac-aicheck agent-lite — embedded mode
// Source: src/agent/index.ts (development build)
// Run standalone: node ~/.mac-aicheck/agent/agent-lite.js <argv...>

const { main } = require('../index.js');
main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(e => { console.error(e.message); process.exit(1); });
`;
