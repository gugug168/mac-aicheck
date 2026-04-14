// Agent Lite CLI - 简洁实现
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, copyFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execFileSync, spawn } from 'child_process';
import crypto from 'node:crypto';

function getHome() { return process.env.HOME || homedir(); }
function getBaseDir() { return join(getHome(), '.mac-aicheck'); }
function paths() {
  const base = getBaseDir();
  return {
    base, config: join(base, 'config.json'), hooks: join(base, 'hooks.json'),
    outbox: join(base, 'outbox', 'events.jsonl'), ledger: join(base, 'uploads', 'ledger.jsonl'),
    adviceJson: join(base, 'advice', 'latest.json'), adviceMd: join(base, 'advice', 'latest.md'),
    dailyDir: join(base, 'daily'), agentDir: join(base, 'agent'),
    agentJs: join(base, 'agent', 'agent-lite.js'), agentCmd: join(base, 'agent', 'mac-aicheck-agent'),
  };
}
function ensureDir(dir: string) { if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); }
function readJson<T>(file: string, fallback: T): T { try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : fallback; } catch { return fallback; } }
function writeJson(file: string, data: unknown, mode = 0o600) { ensureDir(join(file, '..')); writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf-8', mode }); }
function appendJsonl(file: string, data: unknown) { ensureDir(join(file, '..')); appendFileSync(file, JSON.stringify(data) + '\n', 'utf-8'); }
function readJsonl(file: string): unknown[] { try { if (!existsSync(file)) return []; return readFileSync(file, 'utf-8').split(/\r?\n/).filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } }

function sha256(v: string) { return crypto.createHash('sha256').update(v).digest('hex'); }
function shortHash(v: string) { return sha256(v).slice(0, 16); }
function nowIso() { return new Date().toISOString(); }
function today() { return nowIso().slice(0, 10); }

const SENSITIVE_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  { regex: /(?:sk-|api[_-]?key[_-]?)([a-zA-Z0-9_-]{20,})/gi, replacement: '<API_KEY>' },
  { regex: /Bearer\s+[a-zA-Z0-9._-]+/gi, replacement: 'Bearer <TOKEN>' },
  { regex: /\/Users\/([^\/\s]+)/gi, replacement: '/Users/<USER>' },
  { regex: /\b(\d{1,3}\.){3}\d{1,3}\b/g, replacement: '<IP>' },
  { regex: /[\w.-]+@[\w.-]+\.\w+/g, replacement: '<EMAIL>' },
  { regex: /(?:OPENAI|ANTHROPIC|OPENROUTER|OPENCLAW|DASHSCOPE|ZHIPU|MOONSHOT|GEMINI)[\w-]*(?:KEY|TOKEN)?\s*=\s*[^\s]+/gi, replacement: '<SECRET_ENV>' },
];

function sanitizeText(text: string): string { let r = String(text || ''); for (const p of SENSITIVE_PATTERNS) r = r.replace(p.regex, p.replacement); return r; }
function trimForCapture(text: string): string { const s = sanitizeText(text); return s.length <= 8000 ? s : s.slice(0, 8000) + '\n<TRUNCATED>'; }

function loadConfig() {
  const p = paths();
  const cfg = readJson(p.config, {} as Record<string, unknown>);
  if (!cfg.clientId) cfg.clientId = `client_${crypto.randomUUID()}`;
  if (!cfg.deviceId) cfg.deviceId = `device_${crypto.randomUUID()}`;
  if (cfg.shareData === undefined) cfg.shareData = false;
  if (cfg.autoSync === undefined) cfg.autoSync = false;
  if (cfg.paused === undefined) cfg.paused = false;
  writeJson(p.config, cfg);
  return cfg as { clientId: string; deviceId: string; shareData: boolean; autoSync: boolean; paused: boolean; email?: string; authToken?: string };
}
function saveConfig(cfg: Record<string, unknown>) { writeJson(paths().config, cfg); }

function normalizeAgent(v: string): string { const a = String(v || 'custom').toLowerCase(); return (a === 'claude' || a === 'claude-code' || a === 'claude_code') ? 'claude-code' : a === 'openclaw' || a === 'open-claw' ? 'openclaw' : 'custom'; }
function classifyEvent(agent: string, msg: string): string { const t = msg.toLowerCase(); if (t.includes('mcp')) return 'mcp_error'; if (t.includes('config') || t.includes('json')) return 'agent_config'; if (t.includes('traceback') || t.includes('syntaxerror') || t.includes('typeerror')) return 'coding_error_summary'; return agent === 'custom' ? 'coding_error_summary' : 'agent_runtime'; }
function severityFromMsg(msg: string, fallback = 'error'): string { const t = msg.toLowerCase(); return t.includes('warn') ? 'warn' : t.includes('info') ? 'info' : fallback; }

function createEvent(input: { agent?: string; message?: string; eventType?: string; severity?: string; occurredAt?: string; fingerprint?: string; eventId?: string }) {
  const config = loadConfig();
  const agent = normalizeAgent(input.agent || '');
  const sanitizedMessage = trimForCapture(input.message || '');
  const eventType = input.eventType || classifyEvent(agent, sanitizedMessage);
  const occurredAt = input.occurredAt || nowIso();
  return {
    schemaVersion: 1,
    eventId: input.eventId || `evt_${crypto.randomUUID()}`,
    clientId: config.clientId,
    deviceId: config.deviceId,
    source: 'mac-aicheck-lite',
    agent,
    eventType,
    occurredAt,
    fingerprint: input.fingerprint || shortHash(`${agent}\n${eventType}\n${sanitizedMessage.replace(/\d+/g, '<N>')}`),
    sanitizedMessage,
    severity: input.severity || severityFromMsg(sanitizedMessage),
    localContext: { os: `${process.platform} ${process.release.name || process.platform}`, shell: process.env.SHELL || '', node: process.version, cwdHash: shortHash(process.cwd()) },
    syncStatus: 'pending',
  };
}

const FAILURE_LOOP_THRESHOLD = 5; // 连续同一错误超过此值视为 failure loop

function storeEvent(event: ReturnType<typeof createEvent>) {
  const p = paths();
  appendJsonl(p.outbox, event);
  const date = event.occurredAt.slice(0, 10);
  const file = join(p.dailyDir, `${date}.json`);
  const defaultPack = {
    date, totalEvents: 0, uniqueFingerprints: 0, repeatedEvents: 0, fixedEvents: 0,
    consecutiveFailures: 0, lastFailureFingerprint: null as string | null,
    lastEventAt: null as string | null,
    topProblems: [] as Array<{ fingerprint: string; title: string; count: number; status: string }>,
  };
  const pack = readJson(file, defaultPack);
  pack.totalEvents++;
  pack.lastEventAt = event.occurredAt;

  // 连续失败追踪（Evolver 风格）
  if (event.severity === 'error' || event.severity === 'warn') {
    if (pack.lastFailureFingerprint === event.fingerprint) {
      pack.consecutiveFailures++;
    } else {
      pack.consecutiveFailures = 1;
      pack.lastFailureFingerprint = event.fingerprint;
    }
    // 检测 failure loop
    if (pack.consecutiveFailures >= FAILURE_LOOP_THRESHOLD) {
      pack.topProblems.find(item => item.fingerprint === event.fingerprint)!.status = 'looping';
    }
  }

  const prob = pack.topProblems.find(item => item.fingerprint === event.fingerprint);
  if (prob) { prob.count++; prob.status = 'repeated'; pack.repeatedEvents++; }
  else pack.topProblems.push({ fingerprint: event.fingerprint, title: event.sanitizedMessage.split('\n')[0].slice(0, 120) || event.eventType, count: 1, status: 'new' });
  pack.uniqueFingerprints = pack.topProblems.length;
  pack.topProblems.sort((a, b) => b.count - a.count);
  writeJson(file, pack);
  return event;
}

function parseArgs(argv: string[]): Record<string, unknown> {
  const r: Record<string, unknown> = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') { r._ = argv.slice(i + 1); break; }
    if (arg.startsWith('--')) {
      const [k, v] = arg.slice(2).split(/=(.*)/s);
      const key = k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      r[key] = v !== undefined ? v : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
    } else { (r._ as string[]).push(arg); }
  }
  return r;
}

function apiBase() {
  const raw = (process.env.AICOEVO_API_BASE || process.env.AICOEVO_BASE_URL || 'https://aicoevo.net').replace(/\/+$/, '');
  if (!raw.startsWith('https://') && process.env.NODE_ENV !== 'development') return raw.replace(/^http:\/\//, 'https://').endsWith('/api/v1') ? raw.replace(/^http:\/\//, 'https://') : `${raw.replace(/^http:\/\//, 'https://')}/api/v1`;
  return raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`;
}

async function requestJson(url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown; timeoutMs?: number } = {}) {
  const resp = await fetch(url, { method: init.method || 'GET', headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) }, body: init.body ? JSON.stringify(init.body) : undefined, signal: AbortSignal.timeout(init.timeoutMs || 5000) });
  const text = await resp.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { _raw: text.slice(0, 200) }; }
  return { status: resp.status, data };
}

async function syncEvents() {
  const p = paths();
  const config = loadConfig();
  if (config.paused) return { ok: false, skipped: true, reason: 'paused' };
  if (!config.shareData) return { ok: false, skipped: true, reason: 'not_authorized' };
  const all = readJsonl(p.outbox) as Array<Record<string, unknown>>;
  const pending = all.filter(e => e.syncStatus !== 'synced').slice(0, 50);
  if (!pending.length) return { ok: true, uploaded: 0 };
  const remote = await requestJson(`${apiBase()}/agent-events/batch`, { method: 'POST', headers: config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}, body: { clientId: config.clientId, deviceId: config.deviceId, events: pending.map(({ syncStatus, ...e }) => e) } });
  if (remote.status < 200 || remote.status >= 300) return { ok: false, uploaded: 0, status: remote.status };
  const pendingIds = new Set(pending.map(e => e.eventId));
  const updated = all.map(e => pendingIds.has(e.eventId) ? { ...e, syncStatus: 'synced', syncedAt: nowIso() } : e);
  writeFileSync(p.outbox, updated.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf-8');
  if ((remote.data as Record<string, unknown>)?.advice) writeAdvice((remote.data as Record<string, unknown>).advice as Record<string, unknown>);
  return { ok: true, uploaded: pending.length };
}

function writeAdvice(advice: Record<string, unknown>) {
  const p = paths();
  const norm = { schemaVersion: 1, adviceId: advice.adviceId || `adv_${crypto.randomUUID()}`, generatedAt: advice.generatedAt || nowIso(), summary: advice.summary || 'AICOEVO 已生成新的优化建议。', confidence: typeof advice.confidence === 'number' ? advice.confidence : 0, steps: Array.isArray(advice.steps) ? advice.steps : [], links: Array.isArray(advice.links) ? advice.links : [] };
  writeJson(p.adviceJson, norm);
  const lines = ['# AICOEVO 修复建议', '', norm.summary, '', `置信度: ${Math.round(norm.confidence * 100)}%`, ''];
  const SAFE_CMD = /^[a-zA-Z0-9._\-\/\\: ]+$/;
  if (norm.steps.length) { lines.push('## 建议步骤', ''); norm.steps.forEach((s: Record<string, unknown>, i: number) => { lines.push(`${i+1}. ${s.title}`); if (s.detail) lines.push(`   ${s.detail}`); if (s.command && SAFE_CMD.test(String(s.command))) lines.push(`   命令: \`${s.command}\``); }); lines.push(''); }
  if (norm.links.length) { lines.push('## 参考链接', ''); norm.links.forEach((l: Record<string, unknown>) => lines.push(`- [${l.title}](${l.url})`)); lines.push(''); }
  ensureDir(join(p.adviceMd, '..'));
  writeFileSync(p.adviceMd, lines.join('\n') + '\n', 'utf-8');
}

function resolveCommand(cmd: string) { try { return execFileSync('command', ['-v', cmd], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean)[0] || cmd; } catch { return cmd; } }
function defaultProfilePaths() { const h = getHome(); return [join(h, '.zshrc'), join(h, '.bashrc'), join(h, '.bash_profile')]; }

function buildHookBlock(agents: Array<{ target: string; command: string; functionName: string; original: string }>) {
  const HOOK_START = '# >>> mac-aicheck Agent Hook >>>';
  const HOOK_END = '# <<< mac-aicheck Agent Hook <<<';
  const lines = [HOOK_START, '# This block is managed by mac-aicheck.'];
  for (const a of agents) {
    const orig = a.original.replace(/'/g, "'\"'\"'");
    lines.push(`function ${a.functionName} {`);
    lines.push(`  local mac_aicheck_agent="${paths().agentCmd}"`);
    lines.push(`  if [ -f "$mac_aicheck_agent" ]; then`);
    lines.push(`    "$mac_aicheck_agent" run --agent ${a.target} --original '${orig}' -- "$@"`);
    lines.push(`  else`);
    lines.push(`    command ${a.functionName} "$@"`);
    lines.push(`  fi`);
    lines.push(`}`);
  }
  lines.push(HOOK_END);
  return lines.join('\n');
}

function stripHookBlock(text: string) {
  const HOOK_START = '# >>> mac-aicheck Agent Hook >>>';
  const HOOK_END = '# <<< mac-aicheck Agent Hook <<<';
  let r = text;
  while (true) { const s = r.indexOf(HOOK_START), e = r.indexOf(HOOK_END); if (s === -1 || e === -1 || e < s) break; r = `${r.slice(0, s).trimEnd()}\n${r.slice(e + HOOK_END.length).trimStart()}`; }
  return r.trim() + '\n';
}

function installHook(args: Record<string, unknown>) {
  const p = paths();
  const target = String(args.target || 'all');
  const agents = (target === 'all' ? [{ target: 'claude-code', command: 'claude', functionName: 'claude' }] : target === 'claude-code' || target === 'claude' ? [{ target: 'claude-code', command: 'claude', functionName: 'claude' }] : [{ target: 'openclaw', command: 'openclaw', functionName: 'openclaw' }]).map(a => ({ ...a, original: resolveCommand(a.command) }));
  const profiles = defaultProfilePaths();
  const hooks = readJson(p.hooks, { installedAt: null as string | null, profiles: [] as string[], agents: [] as Array<{ target: string; command: string; functionName: string; original: string }> });
  hooks.installedAt = nowIso(); hooks.agents = agents; hooks.profiles = profiles; writeJson(p.hooks, hooks);
  const block = buildHookBlock(agents);
  for (const profile of profiles) {
    const before = existsSync(profile) ? readFileSync(profile, 'utf-8') : '';
    ensureDir(join(profile, '..'));
    if (before && !existsSync(`${profile}.mac-aicheck.bak`)) writeFileSync(`${profile}.mac-aicheck.bak`, before, 'utf-8');
    writeFileSync(profile, `${stripHookBlock(before).trimEnd()}\n\n${block}\n`, 'utf-8');
  }
  return { profiles, agents };
}

function uninstallHook(args: Record<string, unknown>) {
  const p = paths();
  const hooks = readJson(p.hooks, {} as Record<string, unknown>);
  const profiles = (hooks.profiles as string[]) || defaultProfilePaths();
  for (const profile of profiles) { if (!existsSync(profile)) continue; writeFileSync(profile, stripHookBlock(readFileSync(profile, 'utf-8')), 'utf-8'); }
  writeJson(p.hooks, { ...hooks, uninstalledAt: nowIso(), target: args.target || 'all' });
  return { profiles };
}

function installLocalAgent() {
  const p = paths(); ensureDir(p.agentDir);
  const selfPath = process.argv[1] || __filename;
  copyFileSync(selfPath, p.agentJs); chmodSync(p.agentJs, 0o755);
  const hash = sha256(readFileSync(p.agentJs, 'utf-8'));
  writeJson(join(p.agentDir, 'agent-lite.hash.json'), { sha256: hash, installedAt: nowIso() });
  const cmd = `#!/bin/bash\nSCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"\nexec node "$SCRIPT_DIR/agent-lite.js" "$@"\n`;
  writeFileSync(p.agentCmd, cmd, 'utf-8'); chmodSync(p.agentCmd, 0o755);
  return { agentDir: p.agentDir, agentJs: p.agentJs, agentCmd: p.agentCmd };
}

async function runOriginalAgent(args: Record<string, unknown>) {
  const original = String(args.original); if (!original) throw new Error('缺少 --original');
  const passthrough = (args._ as string[]) || [];
  const stderrChunks: Buffer[] = [];
  const stdoutChunks: Buffer[] = [];
  const child = spawn(original, passthrough, { stdio: ['inherit', 'pipe', 'pipe'], shell: process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh' });
  child.stderr?.on('data', (c: Buffer) => { stderrChunks.push(c); process.stderr.write(c); });
  child.stdout?.on('data', (c: Buffer) => { stdoutChunks.push(c); process.stdout.write(c); });
  const exitCode = await new Promise<number>(resolve => { child.on('error', (e: Error) => { stderrChunks.push(Buffer.from(e.message)); resolve(127); }); child.on('close', c => resolve(c ?? 0)); });
  const stderrText = Buffer.concat(stderrChunks).toString('utf-8');
  const stdoutText = Buffer.concat(stdoutChunks).toString('utf-8');

  // 提取 Claude Code 输出中的错误块
  const errorBlocks: string[] = [];
  const extractBlock = (regex: RegExp, maxLines = 6) => {
    let match;
    while ((match = regex.exec(stdoutText)) !== null) {
      const lines = stdoutText.slice(match.index).split('\n');
      const context = lines.slice(0, maxLines).join('\n');
      if (context.trim() && !errorBlocks.some(b => b.includes(match![0]))) {
        errorBlocks.push(context);
      }
    }
  };
  extractBlock(/^Error:.*$/gm);
  extractBlock(/^Error: Exit code \d+.*$/gm);
  extractBlock(/^✘ .*$/gm, 4);          // Claude Code ✘ 前缀错误
  extractBlock(/^unknown flag:.*$/gm, 3);  // CLI 参数错误
  extractBlock(/^Unknown skill:.*$/gm, 3); // Claude Code 技能不存在
  extractBlock(/^fatal:.*$/gm, 4);          // git fatal 错误
  extractBlock(/^GraphQL:.*$/gm, 3);        // GitHub API 错误
  extractBlock(/^    at .*$/gm, 5);          // JavaScript stack trace
  extractBlock(/^  File ".*$/gm, 5);        // Python traceback

  // 优先用 stderr，其次用提取的 Error 块
  const errorMessage = stderrText.trim() || errorBlocks.join('\n---\n');
  const hasError = exitCode !== 0 || !!errorBlocks.length;

  if (hasError) {
    const msg = errorMessage || `${normalizeAgent(String(args.agent))} exited with code ${exitCode}`;
    const event = storeEvent(createEvent({ agent: String(args.agent), message: msg, severity: exitCode === 0 && errorBlocks.length ? 'warn' : 'error' }));
    const config = loadConfig(); if (config.autoSync && config.shareData && !config.paused) { try { await syncEvents(); } catch {} }
    process.stderr.write(`\nmac-aicheck: 已记录 Agent 问题 ${event.eventId}\n`);
  }
  return exitCode;
}

async function main(argv: string[]) {
  const [command, ...rest] = [argv[0], ...argv.slice(1)];
  const args = parseArgs(argv.slice(1));
  if (!command || command === '--help') {
    process.stdout.write(`mac-aicheck Agent Lite

用法:
  mac-aicheck agent enable --target claude-code|all  一键启用监控
  mac-aicheck agent install-hook --target claude-code|all
  mac-aicheck agent uninstall-hook --target all
  mac-aicheck agent capture --agent <name> --message <text>
  mac-aicheck agent sync
  mac-aicheck agent pause|resume
  mac-aicheck agent advice --format json|markdown
  mac-aicheck agent diagnose          分析失败模式，类比 Evolver 信号诊断
  mac-aicheck agent install-local-agent
  mac-aicheck agent run --agent <name> --original <cmd>
`);
    return 0;
  }
  if (command === 'capture') {
    const msg = String(args.message || '');
    if (!msg.trim()) throw new Error('没有可记录的错误内容');
    const event = storeEvent(createEvent({ agent: String(args.agent), message: msg, severity: args.severity as string }));
    const cfg = loadConfig(); if (cfg.autoSync && cfg.shareData && !cfg.paused) { try { await syncEvents(); } catch {} }
    process.stdout.write(JSON.stringify({ ok: true, eventId: event.eventId, fingerprint: event.fingerprint }) + '\n');
    return 0;
  }
  if (command === 'sync') { const result = await syncEvents(); process.stdout.write(JSON.stringify(result) + '\n'); return result.ok || result.skipped ? 0 : 1; }
  if (command === 'pause' || command === 'resume') { const cfg = loadConfig(); cfg.paused = command === 'pause'; saveConfig(cfg); process.stdout.write(command === 'pause' ? '已暂停自动上传。\n' : '已恢复自动上传。\n'); return 0; }
  if (command === 'install-hook') { const r = installHook(args); process.stdout.write(`已安装 Hook: ${r.agents.map((a: { target: string }) => a.target).join(', ')}\n`); return 0; }
  if (command === 'install-local-agent') { const r = installLocalAgent(); process.stdout.write(JSON.stringify({ ok: true, ...r }) + '\n'); return 0; }
  if (command === 'enable') {
    // 一键安装：runner + hook + 启用同步
    const target = String(args.target || 'all');
    const r = installLocalAgent();
    const hookResult = installHook({ target });
    const cfg = loadConfig();
    cfg.shareData = true;
    cfg.autoSync = true;
    cfg.paused = false;
    saveConfig(cfg);
    process.stdout.write(`mac-aicheck Agent Lite 已启用\n`);
    process.stdout.write(`  Agent Runner: ${r.agentJs}\n`);
    process.stdout.write(`  Hook: ${hookResult.agents.map((a: { target: string }) => a.target).join(', ')}\n`);
    process.stdout.write(`  自动同步: 已启用\n`);
    process.stdout.write(`\n请运行: source ~/.zshrc  (或重启终端)\n`);
    return 0;
  }
  if (command === 'uninstall-hook') { uninstallHook(args); process.stdout.write('已卸载 mac-aicheck Agent Hook。\n'); return 0; }
  if (command === 'run') return await runOriginalAgent(args);
  if (command === 'advice') {
    const p = paths(); const fmt = String(args.format || 'json'); const f = fmt === 'markdown' ? p.adviceMd : p.adviceJson;
    const content = existsSync(f) ? readFileSync(f, 'utf-8') : (fmt === 'markdown' ? '# AICOEVO 修复建议\n\n暂无建议。\n' : '{}\n');
    process.stdout.write(content.endsWith('\n') ? content : content + '\n'); return 0;
  }
  if (command === 'diagnose') {
    // 分析失败模式，类似 Evolver 的信号诊断
    const p = paths();
    const todayFile = join(p.dailyDir, `${today()}.json`);
    const defaultPack = { date: today(), totalEvents: 0, uniqueFingerprints: 0, repeatedEvents: 0, fixedEvents: 0, consecutiveFailures: 0, lastFailureFingerprint: null as string | null, lastEventAt: null as string | null, topProblems: [] as Array<{ fingerprint: string; title: string; count: number; status: string }> };
    const raw = readJson<typeof defaultPack>(todayFile, defaultPack);
    const pack = raw || defaultPack;
    const lines: string[] = [`# AI Agent 诊断报告 - ${today()}`, ''];
    if (!pack) {
      lines.push('暂无数据。正常运行至少一次后会有诊断信息。');
    } else {
      lines.push(`总事件数: ${pack.totalEvents}`);
      lines.push(`唯一错误: ${pack.uniqueFingerprints}`);
      lines.push(`重复错误: ${pack.repeatedEvents}`);
      lines.push(`连续失败: ${pack.consecutiveFailures}`);
      if (pack.consecutiveFailures >= FAILURE_LOOP_THRESHOLD) {
        lines.push(`\n⚠️  检测到 Failure Loop: 同一错误连续出现 ${pack.consecutiveFailures} 次`);
      }
      if (pack.lastEventAt) {
        const minsAgo = Math.round((Date.now() - new Date(pack.lastEventAt).getTime()) / 60000);
        lines.push(`最后事件: ${minsAgo} 分钟前`);
        if (minsAgo > 60) {
          lines.push('\n💤 静默警告: 超过 1 小时无活动');
        }
      }
      lines.push('\n## Top 问题');
      for (const prob of (pack.topProblems || []).slice(0, 5)) {
        const loopMark = prob.status === 'looping' ? ' 🔄 LOOP' : prob.status === 'repeated' ? ' ↻' : '';
        lines.push(`- [${prob.count}次] ${prob.title}${loopMark}`);
      }
    }
    lines.push('\n---\n运行 `mac-aicheck scan` 获取完整环境诊断。');
    process.stdout.write(lines.join('\n') + '\n');
    return 0;
  }
  throw new Error(`未知 agent 命令: ${command}`);
}

main(process.argv.slice(2)).then(code => { process.exitCode = typeof code === 'number' ? code : 0; }).catch(e => { console.error(`mac-aicheck Agent 错误: ${e.message}`); process.exitCode = 1; });
