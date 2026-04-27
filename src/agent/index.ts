// Agent Lite CLI - 简洁实现
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, copyFileSync, appendFileSync, unlinkSync, openSync, closeSync } from 'fs';
import { join } from 'path';
import { homedir, hostname } from 'os';
import { execFileSync, spawn } from 'child_process';
import crypto from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const LOCAL_VERSION = process.env.npm_package_version || '1.0.0';

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
    experience: join(base, 'experience.jsonl'),
    versionCache: join(base, 'version-cache.json'),
    workerState: join(base, 'worker-state.json'),
    workerLock: join(base, 'worker.lock'),
  };
}
function ensureDir(dir: string) { if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); }
function readJson<T>(file: string, fallback: T): T { try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : fallback; } catch { return fallback; } }
function writeJson(file: string, data: unknown, mode = 0o600) { ensureDir(join(file, '..')); writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf-8', mode }); }
function appendJsonl(file: string, data: unknown) {
  ensureDir(join(file, '..'));
  appendFileSync(file, JSON.stringify(data) + '\n', { encoding: 'utf-8', mode: 0o600, flag: 'a' });
}
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

// 版本检测和更新检查（参考 gstack）
const VERSION_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 小时限速
const WORKER_DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const WORKER_MAX_PARALLEL = 3;
const WORKER_MAX_EXECUTION_COMMANDS = 2;
const COMMAND_CAPTURE_MAX_CHARS = 4000;
const WORKER_OWNER_SUCCESS_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const WORKER_OWNER_FAILURE_COOLDOWN_MS = 60 * 60 * 1000;
const SAFE_DIRECT_EXECUTABLES = new Set(['python', 'python3', 'pytest', 'node']);
const SAFE_NPM_SUBCOMMANDS = new Set(['test']);
const SAFE_BUN_SUBCOMMANDS = new Set(['test']);
const BLOCKED_COMMAND_PATTERNS = [
  /\brm\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bhalt\b/i,
  /\blaunchctl\b\s+(?:bootout|remove)\b/i,
  /\bcurl\b/i,
  /\bwget\b/i,
];

interface VersionInfo {
  current: string;
  latest: string;
  repo: string;
  lastCheck: string;
  hasUpdate: boolean;
}

async function checkForUpdates(): Promise<VersionInfo | null> {
  const p = paths();
  const cache = readJson<VersionInfo>(p.versionCache, { current: '', latest: '', repo: '', lastCheck: '', hasUpdate: false });

  // 限速：1 小时内不重复检查
  if (cache.lastCheck) {
    const elapsed = Date.now() - new Date(cache.lastCheck).getTime();
    if (elapsed < VERSION_CHECK_INTERVAL_MS) {
      return cache.hasUpdate ? cache : null;
    }
  }

  // 获取当前安装的版本
  const currentVersion = await getInstalledVersion();
  if (!currentVersion) return null;

  // 检查各仓库最新版本
  const repos = [
    { name: 'claude-code', cmd: 'claude', repo: 'anthropics/claude-code' },
    { name: 'openclaw', cmd: 'openclaw', repo: 'openclaw/openclaw' },
  ];

  const updates: Array<{ name: string; current: string; latest: string }> = [];

  for (const r of repos) {
    try {
      const latest = await getLatestVersion(r.repo);
      const installed = getCommandVersion(r.cmd, currentVersion);
      if (installed && latest && installed !== latest) {
        updates.push({ name: r.name, current: installed, latest });
      }
    } catch {}
  }

  const result: VersionInfo = {
    current: currentVersion,
    latest: updates.map(u => `${u.name}: ${u.current} → ${u.latest}`).join(', ') || 'up to date',
    repo: '',
    lastCheck: nowIso(),
    hasUpdate: updates.length > 0,
  };

  writeJson(p.versionCache, result);
  return result;
}

function getInstalledVersion(): string | null {
  try {
    const nodeVersion = process.version.replace(/^v/, '');
    const claudeVersion = getCommandVersion('claude', '');
    const openclawVersion = getCommandVersion('openclaw', '');
    return `node:${nodeVersion}|claude:${claudeVersion || 'unknown'}|openclaw:${openclawVersion || 'unknown'}`;
  } catch {
    return null;
  }
}

function getCommandVersion(cmd: string, fallback: string): string {
  try {
    const result = execFileSync(cmd, ['--version'], { encoding: 'utf-8', timeout: 5000 });
    const match = result.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : fallback;
  } catch {
    return fallback;
  }
}

async function getLatestVersion(repo: string): Promise<string | null> {
  try {
    const resp = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { 'User-Agent': 'mac-aicheck-agent' },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { tag_name?: string };
    return data.tag_name?.replace(/^v/, '') || null;
  } catch {
    return null;
  }
}

async function checkUpdatesWithNotify(): Promise<void> {
  const info = await checkForUpdates();
  if (info && info.hasUpdate) {
    process.stderr.write(`\n🔔 mac-aicheck 版本更新通知:\n`);
    process.stderr.write(`   ${info.latest}\n`);
    process.stderr.write(`   运行 'mac-aicheck agent upgrade' 一键更新\n`);
  }
}

// 检测命令的安装方式（brew / npm / npx）
// npm 包名可能和命令名不同，如 @anthropic-ai/claude-code
const NPM_PKG_MAP: Record<string, string> = {
  claude: '@anthropic-ai/claude-code',
  claude_code: '@anthropic-ai/claude-code',
  openclaw: 'openclaw',
};

function detectInstaller(cmd: string): { type: 'brew' | 'npm' | 'npx' | 'unknown'; pkg: string } {
  try {
    // 检查 which -a 找出所有路径
    const out = execFileSync('which', ['-a', cmd], { encoding: 'utf-8', timeout: 3000 }).split('\n').filter(Boolean);
    for (const p of out) {
      if (p.includes('/Homebrew/') || p.includes('/linuxbrew/')) return { type: 'brew', pkg: cmd };
      if (p.includes('/node_modules/')) return { type: 'npx', pkg: cmd };
    }
    // 检查 npm list -g，找到真实包名
    const npmPkg = NPM_PKG_MAP[cmd] || cmd;
    try {
      const npmOut = execFileSync('npm', ['list', '-g', '--depth=0', 'json'], { encoding: 'utf-8', timeout: 5000 });
      const npmData = JSON.parse(npmOut);
      if ((npmData.dependencies || {})[npmPkg]) return { type: 'npm', pkg: npmPkg };
      // 模糊匹配
      for (const dep of Object.keys(npmData.dependencies || {})) {
        if (dep.includes(cmd) || dep.includes(npmPkg)) return { type: 'npm', pkg: dep };
      }
    } catch {}
    // 默认 brew
    return { type: 'brew', pkg: cmd };
  } catch {
    return { type: 'unknown', pkg: cmd };
  }
}

async function upgradeCommand(): Promise<{ ok: boolean; results: Array<{ name: string; from: string; to: string; status: string }> }> {
  const results: Array<{ name: string; from: string; to: string; status: string }> = [];
  const repos = [
    { name: 'claude-code', cmd: 'claude', npmPkg: '@anthropic-ai/claude-code', repo: 'anthropics/claude-code' },
    { name: 'openclaw', cmd: 'openclaw', npmPkg: 'openclaw', repo: 'openclaw/openclaw' },
  ];

  for (const r of repos) {
    const current = getCommandVersion(r.cmd, 'unknown');
    const latest = await getLatestVersion(r.repo);
    if (!latest || current === latest) {
      results.push({ name: r.name, from: current, to: latest || current, status: latest ? 'up to date' : 'unknown' });
      continue;
    }

    // 优先用 npm 升级（brew cask 可能未安装）
    let upgraded = false;
    for (const tryNpm of [true, false]) {
      if (upgraded) break;
      try {
        const installer = detectInstaller(r.cmd);
        // 首次优先 npm（因为 brew cask 可能没装），失败后换 brew
        if (tryNpm) {
          const npmCmd = ['npm', 'install', '-g', r.npmPkg];
          execFileSync(npmCmd[0], npmCmd.slice(1), { stdio: 'inherit', timeout: 120000 });
        } else {
          const brewCmd = ['brew', 'upgrade', r.cmd];
          execFileSync(brewCmd[0], brewCmd.slice(1), { stdio: 'inherit', timeout: 120000 });
        }
        const newVersion = getCommandVersion(r.cmd, '?');
        results.push({ name: r.name, from: current, to: newVersion, status: 'upgraded' });
        upgraded = true;
      } catch (e: unknown) {
        if (tryNpm) continue; // npm 失败，尝试 brew
        results.push({ name: r.name, from: current, to: latest, status: `failed: ${e instanceof Error ? e.message : String(e)}` });
      }
    }
  }

  // 清除版本缓存，强制下次重新检查
  const p = paths();
  if (existsSync(p.versionCache)) {
    const cache = readJson<VersionInfo>(p.versionCache, { current: '', latest: '', repo: '', lastCheck: '', hasUpdate: false });
    cache.lastCheck = ''; // 清除限速标记
    writeJson(p.versionCache, cache);
  }

  return { ok: true, results };
}

// 经验库：已知错误的本地修复建议（类比 Evolver genes.json）
// 匹配顺序：按出现顺序优先，所以更具体的模式要放前面
const EXPERIENCE_PATTERNS: Array<{ patterns: string[]; title: string; advice: string; commands?: string[] }> = [
  // 高优先级：非常具体的错误
  { patterns: ['ModuleNotFoundError', 'No module named', 'ImportError'], title: 'Python 模块缺失', advice: '安装缺失的 Python 依赖', commands: ['pip install <module>', 'pip3 install <module>'] },
  { patterns: ['SyntaxError:', 'IndentationError', 'TabError'], title: 'Python 语法错误', advice: '检查 Python 代码缩进和语法', commands: ['python3 -m py_compile <file>'] },
  { patterns: ['TypeError:', 'AttributeError:', 'KeyError:', 'ValueError:'], title: 'Python 运行时错误', advice: '检查数据类型和属性访问', commands: [] },
  { patterns: ['alembic'], title: 'Alembic 数据库迁移工具缺失', advice: '安装 alembic', commands: ['pip install alembic', 'pip3 install alembic'] },
  { patterns: ['Permission denied', 'EACCES', 'operation not permitted'], title: '权限错误', advice: '需要提升权限或检查文件权限', commands: ['ls -la', 'sudo <cmd>'] },
  { patterns: ['ECONNREFUSED', 'Connection refused'], title: '连接被拒绝', advice: '检查服务是否运行，或网络是否正常', commands: [] },
  { patterns: ['ETIMEDOUT', 'Timed out'], title: '连接超时', advice: '网络连接超时，稍后重试', commands: [] },
  { patterns: ['MCP server error', 'mcp server', 'MCP error'], title: 'MCP 服务器错误', advice: 'MCP 服务器连接失败，检查配置和日志', commands: [] },
  // 中优先级：特定类型的错误
  { patterns: ['unknown flag:', 'invalid option', 'Unknown skill:'], title: '命令参数错误', advice: '命令参数不正确，检查帮助信息', commands: ['<cmd> --help'] },
  { patterns: ['fatal:', 'not an empty directory', 'needs merge'], title: 'Git 操作错误', advice: '检查 git 仓库状态', commands: ['git status', 'git pull --rebase'] },
  { patterns: ['command not found', 'not found:', 'ENOENT'], title: '命令不存在', advice: '请安装缺失的命令，或检查 PATH', commands: ['which <cmd>', 'brew install <pkg>'] },
  { patterns: ['Traceback', 'most recent call last'], title: '代码执行错误', advice: '查看上方堆栈跟踪定位错误位置', commands: [] },
  { patterns: ['GraphQL:', 'GitHub API'], title: 'GitHub API 错误', advice: '检查 GitHub 认证状态和网络连接', commands: ['gh auth status'] },
  // 低优先级：通用的错误
  { patterns: ['npm', 'node_modules', 'package.json'], title: 'Node.js 项目问题', advice: '检查 Node.js 环境', commands: ['npm install', 'node --version'] },
  { patterns: ['git'], title: 'Git 错误', advice: '检查 git 仓库状态', commands: ['git status', 'git log'] },
];

function lookupExperience(message: string): { title: string; advice: string; commands: string[] } | null {
  for (const exp of EXPERIENCE_PATTERNS) {
    for (const pattern of exp.patterns) {
      if (message.toLowerCase().includes(pattern.toLowerCase())) {
        return { title: exp.title, advice: exp.advice, commands: exp.commands || [] };
      }
    }
  }
  return null;
}

function appendExperience(event: { fingerprint: string; sanitizedMessage: string; eventType: string }, exp: { title: string; advice: string; commands: string[] }) {
  const p = paths();
  appendJsonl(p.experience, {
    fingerprint: event.fingerprint,
    eventType: event.eventType,
    title: exp.title,
    advice: exp.advice,
    commands: exp.commands,
    happenedAt: nowIso(),
    resolved: false,
  });
}

function loadConfig() {
  const p = paths();
  const cfg = readJson(p.config, {} as Record<string, unknown>);
  if (!cfg.clientId) cfg.clientId = `client_${crypto.randomUUID()}`;
  if (!cfg.deviceId) cfg.deviceId = `device_${crypto.randomUUID()}`;
  if (cfg.shareData === undefined) cfg.shareData = false;
  if (cfg.autoSync === undefined) cfg.autoSync = false;
  if (cfg.paused === undefined) cfg.paused = false;
  if (cfg.workerEnabled === undefined) cfg.workerEnabled = true;
  if (cfg.ownerAutoVerify === undefined) cfg.ownerAutoVerify = true;
  if (!cfg.profileId) cfg.profileId = null;
  if (!cfg.agentType) cfg.agentType = null;
  writeJson(p.config, cfg);
  return cfg as { clientId: string; deviceId: string; shareData: boolean; autoSync: boolean; paused: boolean; workerEnabled: boolean; ownerAutoVerify: boolean; email?: string; authToken?: string; profileId?: string; agentType?: string; confirmedAt?: string };
}
function saveConfig(cfg: Record<string, unknown>) { writeJson(paths().config, cfg); }

// ── Worker state management ──
interface WorkerState {
  schemaVersion: number;
  enabled: boolean;
  status: string;
  pid: number | null;
  startedAt: string | null;
  lastCycleAt: string | null;
  lastCycleResult: { solved: number; skipped: number; total: number; reviewed: number; ownerVerified: number } | null;
  nextCycleAt: string | null;
  totalCycles: number;
  totalSolved: number;
  totalSkipped: number;
  totalReviewed: number;
  totalOwnerVerified: number;
  consecutiveErrors: number;
  lastError: string | null;
  recentOwnerActivity: Record<string, { status: string; at: string }>;
}
function defaultWorkerState(): WorkerState {
  return {
    schemaVersion: 1,
    enabled: false,
    status: 'stopped',
    pid: null,
    startedAt: null,
    lastCycleAt: null,
    lastCycleResult: null,
    nextCycleAt: null,
    totalCycles: 0,
    totalSolved: 0,
    totalSkipped: 0,
    totalReviewed: 0,
    totalOwnerVerified: 0,
    consecutiveErrors: 0,
    lastError: null,
    recentOwnerActivity: {},
  };
}
function loadWorkerState(): WorkerState { return readJson<WorkerState>(paths().workerState, defaultWorkerState()); }
function saveWorkerState(state: WorkerState) { writeJson(paths().workerState, state); }

function acquireWorkerLock(): boolean {
  const lockPath = paths().workerLock;
  const payload = JSON.stringify({ pid: process.pid, startedAt: nowIso() }, null, 2) + '\n';
  for (let attempt = 0; attempt < 3; attempt++) {
    let fd: number | null = null;
    try {
      fd = openSync(lockPath, 'wx', 0o600);
      writeFileSync(fd, payload, { encoding: 'utf-8' });
      closeSync(fd);
      return true;
    } catch (error: unknown) {
      if (fd !== null) {
        try { closeSync(fd); } catch { /* best effort */ }
      }
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code !== 'EEXIST') return false;
      const existing = readJson<{ pid?: number; startedAt?: string }>(lockPath, {});
      if (existing.pid === process.pid) return true;
      if (existing.pid && isProcessAlive(existing.pid)) return false;
      try { unlinkSync(lockPath); } catch { /* another process may have raced us */ }
    }
  }
  return false;
}
function releaseWorkerLock() {
  try {
    const lockPath = paths().workerLock;
    const existing = readJson<{ pid?: number }>(lockPath, {});
    if (!existing?.pid || existing.pid === process.pid) unlinkSync(lockPath);
  } catch {}
}

function isProcessAlive(pid: number | null | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function workerSpawn(command: string, args: string[], options: Record<string, unknown>) {
  const spawnImpl = (globalThis as { __MAC_AICHECK_TEST_SPAWN__?: typeof spawn }).__MAC_AICHECK_TEST_SPAWN__ || spawn;
  return spawnImpl(command, args, options as Parameters<typeof spawn>[2]);
}

function startWorkerDaemon() {
  const cfg = loadConfig();
  if (!cfg.workerEnabled) return { ok: true, skipped: true, reason: 'worker disabled' as const };
  if (!agentApiKeyHeaders(cfg)) return { ok: true, skipped: true, reason: 'missing auth token' as const };

  const wState = loadWorkerState();
  if (isProcessAlive(wState.pid)) {
    return { ok: true, alreadyRunning: true, pid: wState.pid };
  }

  const local = installLocalAgent();
  wState.enabled = true;
  wState.status = 'starting';
  wState.startedAt = wState.startedAt || nowIso();
  saveWorkerState(wState);

  const child = workerSpawn('node', [local.agentJs, 'worker', 'daemon'], { detached: true, stdio: 'ignore' });
  child.unref?.();
  return { ok: true, started: true, pid: child.pid };
}

function normalizeAgent(v: string): string { const a = String(v || 'custom').toLowerCase(); return (a === 'claude' || a === 'claude-code' || a === 'claude_code') ? 'claude-code' : a === 'openclaw' || a === 'open-claw' ? 'openclaw' : 'custom'; }
function classifyEvent(agent: string, msg: string): string { const t = msg.toLowerCase(); if (t.includes('mcp')) return 'mcp_error'; if (t.includes('config') || t.includes('json')) return 'agent_config'; if (t.includes('traceback') || t.includes('syntaxerror') || t.includes('typeerror')) return 'coding_error_summary'; return agent === 'custom' ? 'coding_error_summary' : 'agent_runtime'; }
function severityFromMsg(msg: string, fallback = 'error'): string { const t = msg.toLowerCase(); return t.includes('warn') ? 'warn' : t.includes('info') ? 'info' : fallback; }

function computeAgentSuffix(agent: string): string {
  return agent === 'claude-code' ? '_cc' : agent === 'openclaw' ? '_oc' : '';
}

function normalizeDeviceId(deviceId: string, agent?: string): string {
  const base = String(deviceId || '').replace(/(?:_cc|_oc)$/, '');
  return base + computeAgentSuffix(normalizeAgent(agent || ''));
}

function createEvent(input: { agent?: string; message?: string; eventType?: string; severity?: string; occurredAt?: string; fingerprint?: string; eventId?: string }) {
  const config = loadConfig();
  const agent = normalizeAgent(input.agent || '');
  const sanitizedMessage = trimForCapture(input.message || '');
  const eventType = input.eventType || classifyEvent(agent, sanitizedMessage);
  const occurredAt = input.occurredAt || nowIso();
  const deviceId = normalizeDeviceId(String(config.deviceId || ''), agent);
  return {
    schemaVersion: 1,
    eventId: input.eventId || `evt_${crypto.randomUUID()}`,
    clientId: config.clientId,
    deviceId,
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

function normalizeHostname(hostname: string): string {
  return String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
}

function isBlockedIpv4(host: string): boolean {
  const normalized = normalizeHostname(host);
  if (isIP(normalized) !== 4) return false;
  const octets = normalized.split('.').map(part => Number(part));
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function ipv4FromMappedIpv6(host: string): string | null {
  const normalized = normalizeHostname(host);
  if (!normalized.startsWith('::ffff:')) return null;
  const tail = normalized.slice('::ffff:'.length);
  if (isIP(tail) === 4) return tail;
  const parts = tail.split(':');
  if (parts.length !== 2 || parts.some(part => !/^[0-9a-f]{1,4}$/i.test(part))) return null;
  const high = parseInt(parts[0], 16);
  const low = parseInt(parts[1], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

function isBlockedHost(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === 'metadata.google.internal' || h.endsWith('.metadata.google.internal')) return true;
  if (h === '100.100.100.200') return true;
  if (isBlockedIpv4(h)) return true;
  const mappedIpv4 = ipv4FromMappedIpv6(h);
  if (mappedIpv4 && isBlockedIpv4(mappedIpv4)) return true;
  if (isIP(h) === 6) {
    if (h === '::1') return true;
    if (/^fe[89ab][0-9a-f:]*$/i.test(h)) return true;
    if (/^f[cd][0-9a-f:]*$/i.test(h)) return true;
  }
  return false;
}

function apiBase() {
  const configuredBase = [process.env.AICOEVO_API_BASE, process.env.AICOEVO_BASE_URL]
    .find(value => value && !['undefined', 'null'].includes(value.trim().toLowerCase()));
  const raw = (configuredBase || 'https://aicoevo.net').replace(/\/+$/, '');
  try {
    const withScheme = raw.startsWith('http') ? raw : `https://${raw}`;
    const parsed = new URL(withScheme);
    if (isBlockedHost(parsed.hostname)) {
      process.stderr.write(`[安全] AICOEVO_API_BASE 指向内网地址 ${parsed.hostname}，已忽略，使用默认地址\n`);
      return 'https://aicoevo.net/api/v1';
    }
  } catch {}
  if (!raw.startsWith('https://') && process.env.NODE_ENV !== 'development') return raw.replace(/^http:\/\//, 'https://').endsWith('/api/v1') ? raw.replace(/^http:\/\//, 'https://') : `${raw.replace(/^http:\/\//, 'https://')}/api/v1`;
  return raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`;
}

function agentApiBase(version: 'v1' | 'v2' = 'v2') {
  return apiBase().replace(/\/api\/v1$/, `/api/${version}`) + '/agent';
}

type ResolvedAddress = { address: string; family: number };

async function resolveHostname(hostname: string): Promise<ResolvedAddress[]> {
  const override = (globalThis as {
    __MAC_AICHECK_TEST_DNS_LOOKUP__?: (hostname: string) => Promise<ResolvedAddress[]>;
  }).__MAC_AICHECK_TEST_DNS_LOOKUP__;
  if (override) return await override(hostname);
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map(result => ({ address: result.address, family: result.family }));
}

async function assertSafeRequestUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  if (isBlockedHost(parsed.hostname)) {
    throw new Error(`[安全] AICOEVO API 主机 ${parsed.hostname} 属于内网或本机地址，已拒绝请求`);
  }
  let resolved: ResolvedAddress[];
  try {
    resolved = await resolveHostname(parsed.hostname);
  } catch {
    return;
  }
  const blocked = resolved.find(result => isBlockedHost(result.address));
  if (blocked) {
    throw new Error(`[安全] AICOEVO API 主机 ${parsed.hostname} 解析到内网地址 ${blocked.address}，已拒绝请求`);
  }
}

async function heartbeatAgentV2(
  headers: Record<string, string>,
  body: Record<string, unknown> = {},
) {
  return requestJson(`${agentApiBase('v2')}/heartbeat`, {
    method: 'POST',
    headers,
    body: {
      status: 'idle',
      current_tasks: 0,
      max_parallel_tasks: 1,
      ...body,
    },
  });
}

function agentApiKeyHeaders(config: { authToken?: string }): Record<string, string> | null {
  if (!config.authToken || !config.authToken.startsWith('ak_')) return null;
  return { 'X-API-Key': config.authToken };
}

async function requestJson(url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown; timeoutMs?: number } = {}) {
  await assertSafeRequestUrl(url);
  const resp = await fetch(url, { method: init.method || 'GET', headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) }, body: init.body ? JSON.stringify(init.body) : undefined, signal: AbortSignal.timeout(init.timeoutMs || 5000) });
  const text = await resp.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { _raw: text.slice(0, 200) }; }
  return { status: resp.status, data };
}

function unique(values: string[]) {
  return [...new Set((values || []).filter(Boolean))];
}

function clipText(value: string, max = COMMAND_CAPTURE_MAX_CHARS) {
  const text = sanitizeText(String(value || ''));
  return text.length > max ? text.slice(0, max) : text;
}

function tokenizeCommandLine(commandLine: string) {
  const input = String(commandLine || '').trim();
  if (!input) return [];
  const tokens: string[] = [];
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|[^\s]+/g;
  let match;
  while ((match = re.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[0]);
  }
  return tokens;
}

function isPotentialCommandLine(text: string) {
  const normalized = String(text || '').trim();
  if (!normalized || normalized.length > 300 || /[\r\n]/.test(normalized)) return false;
  const tokens = tokenizeCommandLine(normalized);
  if (tokens.length === 0) return false;
  const first = String(tokens[0] || '').toLowerCase();
  return SAFE_DIRECT_EXECUTABLES.has(first) || first === 'npm' || first === 'bun';
}

function extractCommandsFromText(text: string) {
  const commands: string[] = [];
  const source = String(text || '');
  const backtickRe = /`([^`\r\n]+)`/g;
  let match;
  while ((match = backtickRe.exec(source)) !== null) {
    const candidate = String(match[1] || '').trim();
    if (isPotentialCommandLine(candidate)) commands.push(candidate);
  }
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*(?:[-*]|\d+\.)\s*/, '').trim();
    if (isPotentialCommandLine(line)) commands.push(line);
  }
  return unique(commands);
}

function flattenTextCandidates(value: unknown, sink: string[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) flattenTextCandidates(item, sink);
    return sink;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (/command|cmd|step|trigger|repro|validation/i.test(key)) flattenTextCandidates(item, sink);
    }
    return sink;
  }
  if (typeof value === 'string' && value.trim()) sink.push(value);
  return sink;
}

function collectExecutionCandidates({
  item,
  answerContent = '',
  evidencePayload,
  bounty,
}: {
  item: Record<string, unknown>;
  answerContent?: string;
  evidencePayload?: unknown;
  bounty?: Record<string, unknown> | null;
}) {
  const sources: string[] = [];
  flattenTextCandidates(item, sources);
  flattenTextCandidates((bounty || {}).repro_contract, sources);
  flattenTextCandidates(evidencePayload, sources);
  if (answerContent) sources.push(answerContent);
  const commands: string[] = [];
  for (const source of sources) commands.push(...extractCommandsFromText(source));
  return unique(commands).slice(0, WORKER_MAX_EXECUTION_COMMANDS);
}

function validateSafeCommand(commandLine: string) {
  const normalized = String(commandLine || '').trim();
  if (!normalized) return { ok: false, reason: 'empty command' };
  if (/[|;&><]/.test(normalized)) return { ok: false, reason: 'shell metacharacters blocked' };
  if (BLOCKED_COMMAND_PATTERNS.some(pattern => pattern.test(normalized))) {
    return { ok: false, reason: 'blocked command pattern' };
  }
  const tokens = tokenizeCommandLine(normalized);
  if (tokens.length === 0) return { ok: false, reason: 'empty command tokens' };
  const first = String(tokens[0] || '').toLowerCase();
  if (SAFE_DIRECT_EXECUTABLES.has(first)) {
    return { ok: true, executable: tokens[0], args: tokens.slice(1), normalized };
  }
  if (first === 'npm' && SAFE_NPM_SUBCOMMANDS.has(String(tokens[1] || '').toLowerCase())) {
    return { ok: true, executable: tokens[0], args: tokens.slice(1), normalized };
  }
  if (first === 'bun' && SAFE_BUN_SUBCOMMANDS.has(String(tokens[1] || '').toLowerCase())) {
    return { ok: true, executable: tokens[0], args: tokens.slice(1), normalized };
  }
  return { ok: false, reason: `unsupported executable: ${first}` };
}

async function runSafeLocalCommand(commandLine: string): Promise<{ ok: boolean; skipped: boolean; command: string; stdout: string; stderr: string; exitCode: number | null }> {
  const validation = validateSafeCommand(commandLine);
  if (!validation.ok) {
    return { ok: false, skipped: true, command: String(commandLine || '').trim(), stdout: '', stderr: String(validation.reason || ''), exitCode: null as number | null };
  }
  const runner = (globalThis as { __MAC_AICHECK_TEST_COMMAND_RUNNER__?: (command: string) => Promise<{ stdout?: string; stderr?: string; exitCode?: number }> }).__MAC_AICHECK_TEST_COMMAND_RUNNER__;
  const normalized = validation.normalized as string;
  if (runner) {
    const result = await runner(normalized);
    return {
      ok: Number(result?.exitCode ?? 0) === 0,
      skipped: false,
      command: normalized,
      stdout: clipText(result?.stdout || ''),
      stderr: clipText(result?.stderr || ''),
      exitCode: Number(result?.exitCode ?? 0),
    };
  }
  try {
    const executable = validation.executable as string;
    const args = validation.args as string[];
    const stdout = execFileSync(executable, args, {
      encoding: 'utf-8',
      timeout: 20000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, skipped: false, command: normalized, stdout: clipText(stdout || ''), stderr: '', exitCode: 0 };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; status?: number; message?: string };
    return {
      ok: false,
      skipped: false,
      command: normalized,
      stdout: clipText(err?.stdout || ''),
      stderr: clipText(err?.stderr || err?.message || ''),
      exitCode: Number(err?.status ?? 1),
    };
  }
}

function pruneActivityMap(map: Record<string, { status: string; at: string }>, maxEntries = 100) {
  const entries = Object.entries(map || {})
    .sort((a, b) => Date.parse(b[1]?.at || '') - Date.parse(a[1]?.at || ''))
    .slice(0, maxEntries);
  return Object.fromEntries(entries);
}

function shouldCooldownActivity(activityMap: Record<string, { status: string; at: string }>, key: string, successCooldownMs: number, failureCooldownMs: number) {
  const record = activityMap?.[key];
  if (!record?.at) return false;
  const age = Date.now() - Date.parse(record.at);
  if (!Number.isFinite(age) || age < 0) return false;
  const cooldown = record.status === 'success' ? successCooldownMs : failureCooldownMs;
  return age < cooldown;
}

function noteActivity(activityMap: Record<string, { status: string; at: string }>, key: string, status: string) {
  return pruneActivityMap({
    ...(activityMap || {}),
    [key]: { status, at: nowIso() },
  });
}

async function syncEvents() {
  const p = paths();
  const config = loadConfig();
  if (config.paused) return { ok: false, skipped: true, reason: 'paused' };
  if (!config.shareData) return { ok: false, skipped: true, reason: 'not_authorized' };
  const all = readJsonl(p.outbox) as Array<Record<string, unknown>>;
  const pending = all.filter(e => e.syncStatus !== 'synced').slice(0, 50);
  if (!pending.length) return { ok: true, uploaded: 0 };
  const authH: Record<string, string> = {};
  if (config.authToken) {
    if (config.authToken.startsWith('ak_')) { authH['X-API-Key'] = config.authToken; } else { authH['Authorization'] = `Bearer ${config.authToken}`; }
  }
  const remote = await requestJson(`${apiBase()}/agent-events/batch`, { method: 'POST', headers: authH, body: { clientId: config.clientId, deviceId: normalizeDeviceId(String(config.deviceId || '')), events: pending.map(({ syncStatus, ...e }) => e) } });
  if (remote.status < 200 || remote.status >= 300) return { ok: false, uploaded: 0, status: remote.status };
  const pendingIds = new Set(pending.map(e => e.eventId));
  const updated = all.map(e => pendingIds.has(e.eventId) ? { ...e, syncStatus: 'synced', syncedAt: nowIso() } : e);
  writeFileSync(p.outbox, updated.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf-8');
  const respData = remote.data as Record<string, unknown>;
  if (respData?.advice) writeAdvice(respData.advice as Record<string, unknown>);
  // 展示同步反馈：匹配结果和悬赏草稿
  if (respData) {
    const accepted = respData.accepted as number || 0;
    const advice = respData.advice as Record<string, unknown> | undefined;
    const drafts = respData.bountyDrafts as Array<Record<string, unknown>> | undefined;
    if (accepted > 0) {
      const parts = [`[AICOEVO] 已上传 ${accepted} 条事件`];
      if (advice) {
        const conf = typeof advice.confidence === 'number' ? advice.confidence : 0;
        if (conf >= 0.6) {
          parts.push(`匹配到已有方案 (置信度 ${Math.round(conf * 100)}%)`);
        } else if (advice.summary) {
          parts.push(String(advice.summary).split('\n')[0]);
        }
      }
      if (drafts && drafts.length > 0) {
        const d = drafts[0];
        if (d.status === 'open') {
          parts.push(`已自动公开互助悬赏: ${d.title || d.id}`);
        } else {
          parts.push(`已创建悬赏草稿: ${d.title || d.id}`);
          parts.push(`可执行 mac-aicheck agent bounty-draft-publish ${d.id} --reward 0 公开到互助队列`);
        }
      }
      process.stderr.write(parts.join(' | ') + '\n');
    }
  }
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

function ownerVerifyFiles(bountyId: string, answerId: string) {
  const p = paths();
  const slug = [bountyId || 'unknown', answerId || 'unknown']
    .map(value => String(value || '').replace(/[^a-zA-Z0-9_-]+/g, '-'))
    .join('__');
  const dir = join(p.base, 'owner-verify');
  return {
    dir,
    guideMd: join(dir, `${slug}.md`),
    snapshotJson: join(dir, `${slug}.json`),
  };
}

function ownerVerifyLocalContext(config: Record<string, unknown>) {
  return {
    clientId: String(config.clientId || ''),
    deviceId: String(config.deviceId || ''),
    autoSync: config.autoSync !== false,
    paused: Boolean(config.paused),
    shareData: config.shareData !== false,
    host: hostname(),
    platform: process.platform,
    nodeVersion: process.version,
  };
}

function writeOwnerVerifyGuide(item: Record<string, string>, config: Record<string, unknown>) {
  const files = ownerVerifyFiles(String(item.bounty_id || ''), String(item.answer_id || ''));
  const generatedAt = nowIso();
  const localContext = ownerVerifyLocalContext(config);
  const verifyCommand = `mac-aicheck agent owner-verify ${item.bounty_id} --answer ${item.answer_id} --result success|partial|failed --cmd "<local validation command>"`;
  const lines = [
    '# AICOEVO 发起者复现指南',
    '',
    `- Bounty: ${item.bounty_id}`,
    `- Answer: ${item.answer_id}`,
    `- 标题: ${item.title || '(无标题)'}`,
    `- 提交时间: ${item.submitted_at || '-'}`,
    `- 截止时间: ${item.deadline_at || '-'}`,
    '',
    '## 方案摘要',
    '',
    item.solution_summary || '暂无方案摘要。',
    '',
    '## 建议操作',
    '',
    '1. 在你自己的本地环境里手动复现原问题。',
    '2. 按方案摘要执行修复或验证命令，确认现象是否消失。',
    '3. 记录你实际执行过的命令和结果，再提交 owner-verify。',
    '',
    '## 提交命令',
    '',
    `\`${verifyCommand}\``,
    '',
    config.ownerAutoVerify
      ? '当前已开启 ownerAutoVerify：后台 Worker 会自动复现并自动提交验证结果。'
      : '当前未开启 ownerAutoVerify：手工 owner-verify 默认仍会再次要求你确认。',
    '',
  ];
  ensureDir(files.dir);
  writeFileSync(files.guideMd, lines.join('\n') + '\n', 'utf-8');
  const snapshot = {
    schemaVersion: 1,
    generatedAt,
    item,
    localContext,
    verifyCommand,
  };
  writeJson(files.snapshotJson, snapshot);
  return {
    ...files,
    guideSha256: sha256(readFileSync(files.guideMd, 'utf-8')),
    snapshot,
  };
}

function loadOwnerVerifySnapshot(bountyId: string, answerId: string) {
  const files = ownerVerifyFiles(bountyId, answerId);
  const snapshot = readJson<Record<string, unknown> | null>(files.snapshotJson, null);
  const guideSha256 = existsSync(files.guideMd) ? sha256(readFileSync(files.guideMd, 'utf-8')) : '';
  return { ...files, guideSha256, snapshot };
}

async function fetchPendingOwnerVerifications(headers: Record<string, string>) {
  const result = await requestJson(`${agentApiBase('v2')}/status`, { headers });
  if (result.status !== 200) return { ok: false, items: [] as Array<Record<string, unknown>> };
  const data = result.data as Record<string, unknown>;
  return {
    ok: true,
    items: Array.isArray(data.pending_owner_verifications) ? data.pending_owner_verifications as Array<Record<string, unknown>> : [],
  };
}

async function fetchBountyDetail(bountyId: string) {
  if (!bountyId) return { ok: false, data: null as Record<string, unknown> | null };
  const result = await requestJson(`${apiBase()}/bounties/${bountyId}`);
  return { ok: result.status === 200, data: result.status === 200 ? result.data as Record<string, unknown> : null };
}

async function fetchBountyAnswers(bountyId: string) {
  if (!bountyId) return { ok: false, data: [] as Array<Record<string, unknown>> };
  const result = await requestJson(`${apiBase()}/bounties/${bountyId}/answers`);
  return { ok: result.status === 200, data: Array.isArray(result.data) ? result.data as Array<Record<string, unknown>> : [] };
}

async function fetchProblemBriefEvidence(briefId: string, headers: Record<string, string>) {
  if (!briefId) return { ok: false, data: null as Record<string, unknown> | null };
  const result = await requestJson(`${agentApiBase('v1')}/problem-briefs/${briefId}/evidence?include_payload=true`, { headers });
  return { ok: result.status === 200, data: result.status === 200 ? result.data as Record<string, unknown> : null };
}

function buildAutoOwnerVerifyPayload({
  item,
  guideRecord,
  execution,
}: {
  item: Record<string, unknown>;
  guideRecord: ReturnType<typeof loadOwnerVerifySnapshot>;
  execution: { ok: boolean; command: string; stdout: string; stderr: string; exitCode: number | null; skipped?: boolean };
}) {
  const result = execution.ok ? 'success' : (execution.stderr || execution.stdout ? 'partial' : 'failed');
  return {
    answer_id: String(item.answer_id || ''),
    result,
    notes: result === 'success'
      ? `Auto owner verification succeeded for \`${execution.command}\``
      : `Auto owner verification observed non-success result for \`${execution.command}\``,
    commands_run: [execution.command],
    proof_payload: {
      summary: `Auto owner verification for ${item.bounty_id}/${item.answer_id}`,
      steps: [
        `读取本地指南: ${guideRecord.guideMd}`,
        `自动执行验证命令: ${execution.command}`,
        `自动提交结果: ${result}`,
      ],
      before_context: guideRecord.snapshot || { item },
      after_context: {
        submitted_at: nowIso(),
        confirmation_mode: 'auto_worker',
        result,
        exit_code: execution.exitCode,
        stdout_excerpt: clipText(execution.stdout, 1000),
        stderr_excerpt: clipText(execution.stderr, 1000),
        local_context: ownerVerifyLocalContext(loadConfig()),
      },
      validation_cmd: execution.command,
      expected_output: result === 'success'
        ? '问题已消失或行为符合预期'
        : result === 'partial'
          ? '问题部分缓解，但仍有残留'
          : '问题仍然可复现',
    },
    artifacts: {
      owner_reproduction_guide_path: guideRecord.guideMd,
      owner_reproduction_snapshot_path: guideRecord.snapshotJson,
      owner_reproduction_guide_sha256: guideRecord.guideSha256,
      execution_result: {
        ok: execution.ok,
        exit_code: execution.exitCode,
      },
    },
  };
}

async function runAutoOwnerVerifications(
  headers: Record<string, string>,
  config: ReturnType<typeof loadConfig>,
  state: WorkerState,
  maxPerCycle: number,
) {
  if (!config.ownerAutoVerify) return { ownerVerified: 0, reviewed: 0, recentOwnerActivity: state.recentOwnerActivity || {} };
  const pending = await fetchPendingOwnerVerifications(headers);
  if (!pending.ok) return { ownerVerified: 0, reviewed: 0, recentOwnerActivity: state.recentOwnerActivity || {} };

  let ownerVerified = 0;
  let recentOwnerActivity = state.recentOwnerActivity || {};
  for (const item of pending.items.slice(0, maxPerCycle)) {
    const answerId = String(item.answer_id || '');
    const bountyId = String(item.bounty_id || '');
    if (!answerId || !bountyId) continue;
    if (shouldCooldownActivity(recentOwnerActivity, answerId, WORKER_OWNER_SUCCESS_COOLDOWN_MS, WORKER_OWNER_FAILURE_COOLDOWN_MS)) continue;

    const guideRecord = loadOwnerVerifySnapshot(bountyId, answerId).snapshot
      ? loadOwnerVerifySnapshot(bountyId, answerId)
      : writeOwnerVerifyGuide(item as Record<string, string>, config);
    const bountyResult = await fetchBountyDetail(bountyId);
    const answersResult = await fetchBountyAnswers(bountyId);
    const bounty = bountyResult.data;
    const answers = answersResult.data;
    const answer = answers.find(entry => String(entry.id || '') === answerId) || {};
    const briefId = String((bounty || {}).problem_brief_id || '');
    const evidenceResult = await fetchProblemBriefEvidence(briefId, headers);
    const evidence = evidenceResult.data;
    const candidates = collectExecutionCandidates({
      item,
      answerContent: String(answer.content || ''),
      evidencePayload: evidence?.payload,
      bounty,
    });
    if (candidates.length === 0) {
      recentOwnerActivity = noteActivity(recentOwnerActivity, answerId, 'failed');
      continue;
    }

    const execution = await runSafeLocalCommand(candidates[0]);
    if (execution.skipped) {
      recentOwnerActivity = noteActivity(recentOwnerActivity, answerId, 'failed');
      continue;
    }
    const payload = buildAutoOwnerVerifyPayload({ item, guideRecord, execution });
    const submitResult = await requestJson(`${agentApiBase('v2')}/bounties/${bountyId}/owner-verify`, {
      method: 'POST',
      headers,
      body: payload,
    });
    if (submitResult.status === 200) {
      ownerVerified++;
      recentOwnerActivity = noteActivity(recentOwnerActivity, answerId, 'success');
    } else {
      recentOwnerActivity = noteActivity(recentOwnerActivity, answerId, 'failed');
    }
  }

  return { ownerVerified, reviewed: 0, recentOwnerActivity };
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

function targetIncludesClaude(target: string) {
  return !target || target === 'all' || target === 'claude-code' || target === 'claude';
}

function targetIncludesOpenClaw(target: string) {
  return !target || target === 'all' || target === 'openclaw' || target === 'open-claw';
}

function resolveProjectRootForHooks() {
  const execPath = process.argv[1] || __filename;
  const candidates = [
    execPath.includes('/dist/') ? execPath.replace(/\/dist\/.*$/, '') : execPath.replace(/\/src\/.*$/, ''),
    process.cwd(),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(join(candidate, 'hooks-src', 'session-start-hook.js'))) return candidate;
  }
  return process.cwd();
}

function installHook(args: Record<string, unknown>) {
  const p = paths();
  const target = String(args.target || 'all');
  const agents = (target === 'all'
    ? [
        { target: 'claude-code', command: 'claude', functionName: 'claude' },
        { target: 'openclaw', command: 'openclaw', functionName: 'openclaw' },
      ]
    : target === 'claude-code' || target === 'claude'
    ? [{ target: 'claude-code', command: 'claude', functionName: 'claude' }]
    : [{ target: 'openclaw', command: 'openclaw', functionName: 'openclaw' }]
  ).map(a => ({ ...a, original: resolveCommand(a.command) }));
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

// Install SessionStart and PostToolUse hooks to ~/.claude/settings.json
function installSettingsHook(): { hookType: 'settings'; hooks: string[] } {
  const settingsFile = join(getHome(), '.claude', 'settings.json');
  const hooksDir = join(getHome(), '.claude', 'hooks');
  ensureDir(hooksDir);

  // Resolve hook source files from hooks-src/ directory.
  const projectRoot = resolveProjectRootForHooks();

  const sessionHookSrc = join(projectRoot, 'hooks-src', 'session-start-hook.js');
  const postToolHookSrc = join(projectRoot, 'hooks-src', 'post-tool-hook.js');

  const sessionHookDest = join(hooksDir, 'mac-aicheck-session-start.js');
  const postToolHookDest = join(hooksDir, 'mac-aicheck-post-tool.js');

  try {
    if (existsSync(sessionHookSrc)) {
      writeFileSync(sessionHookDest, readFileSync(sessionHookSrc, 'utf-8'), { mode: 0o755 });
    } else {
      throw new Error(`源文件不存在: ${sessionHookSrc}`);
    }
    if (existsSync(postToolHookSrc)) {
      writeFileSync(postToolHookDest, readFileSync(postToolHookSrc, 'utf-8'), { mode: 0o755 });
    } else {
      throw new Error(`源文件不存在: ${postToolHookSrc}`);
    }
  } catch (e) {
    throw new Error(`无法复制 hook 脚本: ${e}`);
  }

  // Read existing settings
  interface Settings {
    hooks?: {
      SessionStart?: Array<{ hooks?: Array<{ type?: string; command?: string; timeout?: number }> }>;
      PostToolUse?: Array<{ matcher?: string; hooks?: Array<{ type?: string; command?: string; timeout?: number }> }>;
    };
    [key: string]: unknown;
  }

  let settings: Settings = {};
  try {
    if (existsSync(settingsFile)) {
      settings = JSON.parse(readFileSync(settingsFile, 'utf-8'));
    }
  } catch (e) {}

  // Ensure hooks object exists
  if (!settings.hooks) {
    settings.hooks = {};
  }

  // Add SessionStart hook if not present
  const sessionHookCmd = `node "${sessionHookDest}"`;
  if (!settings.hooks.SessionStart) {
    settings.hooks.SessionStart = [];
  }
  const hasSessionHook = settings.hooks.SessionStart.some(h =>
    h?.hooks?.some(g => g?.command?.includes('mac-aicheck'))
  );
  if (!hasSessionHook) {
    settings.hooks.SessionStart.push({
      hooks: [{ type: 'command', command: sessionHookCmd, timeout: 10 }],
    });
  }

  // Add PostToolUse hook if not present
  const postToolHookCmd = `node "${postToolHookDest}"`;
  if (!settings.hooks.PostToolUse) {
    settings.hooks.PostToolUse = [];
  }
  const hasPostToolHook = settings.hooks.PostToolUse.some(h =>
    h?.hooks?.some(g => g?.command?.includes('mac-aicheck'))
  );
  if (!hasPostToolHook) {
    settings.hooks.PostToolUse.push({
      matcher: 'Bash|Agent|Task',
      hooks: [{ type: 'command', command: postToolHookCmd, timeout: 10 }],
    });
  }

  // Write updated settings
  try {
    writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  } catch (e) {
    throw new Error(`无法写入 settings.json: ${e}`);
  }

  return {
    hookType: 'settings',
    hooks: ['SessionStart (版本检查)', 'PostToolUse (错误捕获)'],
  };
}

// Remove hooks from settings.json
function uninstallSettingsHook(): void {
  const settingsFile = join(getHome(), '.claude', 'settings.json');

  interface Settings {
    hooks?: {
      SessionStart?: Array<{ hooks?: Array<{ type?: string; command?: string; timeout?: number }> }>;
      PostToolUse?: Array<{ matcher?: string; hooks?: Array<{ type?: string; command?: string; timeout?: number }> }>;
    };
    [key: string]: unknown;
  }

  let settings: Settings = {};
  try {
    if (existsSync(settingsFile)) {
      settings = JSON.parse(readFileSync(settingsFile, 'utf-8'));
    }
  } catch (e) {}

  if (settings.hooks) {
    // Remove mac-aicheck hooks from SessionStart
    if (settings.hooks.SessionStart) {
      settings.hooks.SessionStart = settings.hooks.SessionStart
        .map(h => ({
          ...h,
          hooks: (h.hooks || []).filter(g => !g?.command?.includes('mac-aicheck')),
        }))
        .filter(h => (h.hooks || []).length > 0);
    }
    // Remove mac-aicheck hooks from PostToolUse
    if (settings.hooks.PostToolUse) {
      settings.hooks.PostToolUse = settings.hooks.PostToolUse
        .map(h => ({
          ...h,
          hooks: (h.hooks || []).filter(g => !g?.command?.includes('mac-aicheck')),
        }))
        .filter(h => (h.hooks || []).length > 0);
    }
  }

  try {
    writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  } catch (e) {
    // Silent fail
  }
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
  // 启动时检查更新（参考 gstack，限速 1 小时）
  checkUpdatesWithNotify().catch(() => {});
  const passthrough = (args._ as string[]) || [];
  const stderrChunks: Buffer[] = [];
  const stdoutChunks: Buffer[] = [];
  const child = spawn(original, passthrough, { stdio: ['inherit', 'pipe', 'pipe'], shell: process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh' });
  child.stderr?.on('data', (c: Buffer) => { stderrChunks.push(c); process.stderr.write(c); });
  child.stdout?.on('data', (c: Buffer) => { stdoutChunks.push(c); process.stdout.write(c); });
  const exitCode = await new Promise<number>(resolve => { child.on('error', (e: Error) => { stderrChunks.push(Buffer.from(e.message)); resolve(127); }); child.on('close', c => resolve(c ?? 0)); });
  const stderrText = Buffer.concat(stderrChunks).toString('utf-8');
  const stdoutText = Buffer.concat(stdoutChunks).toString('utf-8');

  // 已知非关键错误的过滤模式（不记录，不上报）
  // 这些是 CLI 参数校验提示，不是真正的运行时失败
  const NOISE_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
    { regex: /Input must be provided either through stdin or as a prompt argument when using --print/i, reason: '--print 参数校验（正常行为）' },
    { regex: /^Error: Input must be provided/i, reason: '--print 参数校验（正常行为）' },
  ];
  function isNoise(msg: string): boolean {
    return NOISE_PATTERNS.some(p => p.regex.test(msg));
  }

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
  const rawErrorMessage = stderrText.trim() || errorBlocks.join('\n---\n');
  const errorMessage = rawErrorMessage;

  // 真正的错误判断：exit code 非零 且 不是已知噪声错误
  const hasRealError = exitCode !== 0 && !isNoise(rawErrorMessage);

  if (hasRealError) {
    const msg = errorMessage || `${normalizeAgent(String(args.agent))} exited with code ${exitCode}`;
    const event = createEvent({ agent: String(args.agent), message: msg, severity: 'error' });
    storeEvent(event);
    // 查找本地经验库，给出即时建议
    const exp = lookupExperience(msg);
    if (exp) {
      appendExperience(event, exp);
      process.stderr.write(`\n💡 mac-aicheck 经验库建议:\n`);
      process.stderr.write(`   ${exp.title}\n`);
      process.stderr.write(`   ${exp.advice}\n`);
      if (exp.commands.length > 0) {
        process.stderr.write(`   可尝试: ${exp.commands.join(' | ')}\n`);
      }
    }
    const config = loadConfig(); if (config.autoSync && config.shareData && !config.paused) { try { await syncEvents(); } catch (e) { process.stderr.write(`[警告] 自动同步失败: ${e instanceof Error ? e.message : String(e)}`); } }
    process.stderr.write(`\nmac-aicheck: 已记录 Agent 问题 ${event.eventId}\n`);
  }
  return exitCode;
}

async function runWorkerDaemon(args: Record<string, unknown>): Promise<number> {
  if (!acquireWorkerLock()) {
    process.stdout.write('Worker 已在运行中，跳过重复启动\n');
    return 1;
  }
  const cfg = loadConfig();
  const apiKey = agentApiKeyHeaders(cfg);
  if (!apiKey) { releaseWorkerLock(); process.stdout.write('Worker 需要 Agent API Key，请先运行 mac-aicheck agent bind\n'); return 1; }
  const rawInterval = Number(args.workerInterval || args.interval || WORKER_DEFAULT_INTERVAL_MS);
  const interval = (isNaN(rawInterval) || rawInterval <= 0) ? WORKER_DEFAULT_INTERVAL_MS : rawInterval;
  const maxPerCycle = Number(args.maxParallelTasks || args.limit || WORKER_MAX_PARALLEL);
  const headers = { ...apiKey, 'Content-Type': 'application/json' };

  const state = loadWorkerState();
  state.enabled = true;
  state.status = 'running';
  state.pid = process.pid;
  state.startedAt = state.startedAt || nowIso();
  saveWorkerState(state);
  process.stdout.write(`[Worker] 启动 (间隔 ${Math.round(interval / 1000)}s, 每轮最多 ${maxPerCycle})\n`);

  try {
    while (true) {
      const currentCfg = loadConfig();
      const currentState = loadWorkerState();
      if (!currentCfg.workerEnabled || currentState.enabled === false) { process.stdout.write('[Worker] 已禁用，退出\n'); break; }
      if (currentCfg.paused) {
        process.stdout.write('[Worker] 已暂停，等待恢复...\n');
        await new Promise(r => setTimeout(r, Math.min(interval, 10 * 1000)));
        continue;
      }
      try {
        const heartbeat = await heartbeatAgentV2(headers, { max_parallel_tasks: maxPerCycle, worker_status: 'active' });
        const recData = heartbeat.data as { recommended_bounties?: Array<{ id: string; recommended_env_id?: string }> };
        const items = (recData.recommended_bounties || []).slice(0, maxPerCycle);
        let solved = 0, skipped = 0;
        if (items.length > 0) {
          process.stdout.write(`[Worker] 发现 ${items.length} 个推荐任务\n`);
          for (const item of items) {
            if (!/^[a-zA-Z0-9_-]+$/.test(item.id)) { skipped++; continue; }
            const solveResult = await requestJson(`${agentApiBase('v1')}/bounties/${item.id}/auto-solve`, { method: 'POST', headers });
            const solveData = solveResult.data as { matched?: boolean; answer?: string; confidence?: number; _raw?: string };
            if ((solveData as Record<string, unknown>)._raw) { process.stdout.write(`[Worker] auto-solve 返回非 JSON 响应，跳过 ${item.id}\n`); skipped++; continue; }
            if (!solveData.matched) { skipped++; continue; }
            if (!solveData.answer || typeof solveData.answer !== 'string') { skipped++; continue; }
            const submitResult = await requestJson(`${agentApiBase('v2')}/bounties/${item.id}/claim-and-submit`, {
              method: 'POST', headers, body: { ...(item.recommended_env_id ? { env_id: item.recommended_env_id } : {}), content: solveData.answer, source: 'kb_auto', confidence: solveData.confidence || 0.8, execution_mode: 'agent' },
            });
            if (submitResult.status >= 200 && submitResult.status < 300) solved++;
          }
        }
        const ownerRun = await runAutoOwnerVerifications(headers, currentCfg, currentState, maxPerCycle);
        const updated = loadWorkerState();
        updated.lastCycleAt = nowIso();
        updated.lastCycleResult = { solved, skipped, total: items.length, reviewed: ownerRun.reviewed, ownerVerified: ownerRun.ownerVerified };
        updated.totalCycles = (updated.totalCycles || 0) + 1;
        updated.totalSolved = (updated.totalSolved || 0) + solved;
        updated.totalSkipped = (updated.totalSkipped || 0) + skipped;
        updated.totalReviewed = (updated.totalReviewed || 0) + ownerRun.reviewed;
        updated.totalOwnerVerified = (updated.totalOwnerVerified || 0) + ownerRun.ownerVerified;
        updated.recentOwnerActivity = ownerRun.recentOwnerActivity;
        updated.consecutiveErrors = 0;
        updated.lastError = null;
        updated.nextCycleAt = new Date(Date.now() + interval).toISOString();
        saveWorkerState(updated);
      } catch (e: unknown) {
        const failed = loadWorkerState();
        failed.consecutiveErrors = (failed.consecutiveErrors || 0) + 1;
        failed.totalCycles = (failed.totalCycles || 0) + 1;
        failed.lastError = e instanceof Error ? e.message : String(e);
        const backoff = Math.min(interval * Math.pow(2, failed.consecutiveErrors - 1), 60 * 60 * 1000);
        failed.nextCycleAt = new Date(Date.now() + backoff).toISOString();
        saveWorkerState(failed);
        process.stdout.write(`[Worker] 循环错误: ${failed.lastError}\n`);
      }
      const st = loadWorkerState();
      const sleepMs = st.consecutiveErrors > 0
        ? Math.min(interval * Math.pow(2, st.consecutiveErrors - 1), 60 * 60 * 1000)
        : interval;
      await new Promise(r => setTimeout(r, sleepMs));
    }
  } finally {
    const finalState = loadWorkerState();
    finalState.status = 'stopped';
    finalState.pid = null;
    finalState.nextCycleAt = null;
    saveWorkerState(finalState);
    releaseWorkerLock();
  }
  return 0;
}

export async function main(argv: string[]) {
  const [command, ...rest] = [argv[0], ...argv.slice(1)];
  const args = parseArgs(argv.slice(1));
  if (!command || command === '--help') {
    process.stdout.write(`mac-aicheck Agent Lite

用法:
  mac-aicheck agent enable --target claude-code|openclaw|all  一键启用监控（新方式，推荐）
  mac-aicheck agent migrate                迁移到 SessionStart Hook（新方式，推荐）
  mac-aicheck agent install-hook --target claude-code|openclaw|all
  mac-aicheck agent uninstall-hook --target all
  mac-aicheck agent capture --agent <name> --message <text>
  mac-aicheck agent sync
  mac-aicheck agent pause|resume
  mac-aicheck agent disable                       — 彻底禁用 Worker 互助循环
  mac-aicheck agent worker-enable                 — 重新启用 Worker 互助循环
  mac-aicheck agent worker start|stop|status      — Worker 后台循环控制
  mac-aicheck agent bounty-draft-list             — 查看当前账号的私有悬赏草稿
  mac-aicheck agent bounty-draft-detail <id>      — 查看单个私有悬赏草稿详情
  mac-aicheck agent bounty-draft-publish <id> [--reward 0]
                                                  — 将草稿公开到悬赏市场
  mac-aicheck agent advice --format json|markdown
  mac-aicheck agent diagnose          分析失败模式，类比 Evolver 信号诊断
  mac-aicheck agent bind [--agent claude-code|openclaw]  绑定设备（自动打开浏览器确认）
  mac-aicheck agent review-list
  mac-aicheck agent review-submit <lease_id> --result success|partial|failed
  mac-aicheck agent owner-check                            查看待复现确认的方案列表
  mac-aicheck agent owner-verify <bounty_id> --answer <id> --result success|partial|failed
                                                           提交复现验证结果
  mac-aicheck agent owner-auto-enable|owner-auto-disable   配置 owner 待验证方案自动提交
  mac-aicheck agent install-local-agent
  mac-aicheck agent upgrade            一键更新 claude-code / openclaw 到最新版本
  mac-aicheck agent upgrade self       更新 mac-aicheck 自身到最新版本
  mac-aicheck agent upgrade snooze     暂停更新提醒 (24h/48h/1w 递增)
`);
    return 0;
  }
  if (command === 'capture') {
    const msg = String(args.message || '');
    if (!msg.trim()) throw new Error('没有可记录的错误内容');
    const event = storeEvent(createEvent({ agent: String(args.agent), message: msg, severity: args.severity as string }));
    const cfg = loadConfig(); if (cfg.autoSync && cfg.shareData && !cfg.paused) { try { await syncEvents(); } catch (e) { process.stderr.write(`[警告] 自动同步失败: ${e instanceof Error ? e.message : String(e)}`); } }
    process.stdout.write(JSON.stringify({ ok: true, eventId: event.eventId, fingerprint: event.fingerprint }) + '\n');
    return 0;
  }
  if (command === 'sync') { const result = await syncEvents(); process.stdout.write(JSON.stringify(result) + '\n'); return result.ok || result.skipped ? 0 : 1; }
  if (command === 'pause' || command === 'resume') { const cfg = loadConfig(); cfg.paused = command === 'pause'; saveConfig(cfg); process.stdout.write(command === 'pause' ? '已暂停自动上传和 Worker 互助循环。\n' : '已恢复自动上传和 Worker 互助循环。\n'); return 0; }

  if (command === 'disable') {
    const cfg = loadConfig();
    cfg.workerEnabled = false;
    saveConfig(cfg);
    const wState = loadWorkerState();
    if (wState.pid) { try { process.kill(wState.pid); } catch {} }
    wState.enabled = false;
    wState.status = 'stopped';
    wState.pid = null;
    wState.nextCycleAt = null;
    saveWorkerState(wState);
    releaseWorkerLock();
    process.stdout.write('已彻底禁用 Worker 互助循环。使用 worker-enable 可重新开启。\n');
    return 0;
  }

  if (command === 'worker-enable') {
    const cfg = loadConfig();
    cfg.workerEnabled = true;
    saveConfig(cfg);
    process.stdout.write('Worker 互助循环已重新启用。运行 worker start 启动后台循环。\n');
    return 0;
  }
  if (command === 'install-hook') { const r = installHook(args); process.stdout.write(`已安装 Hook: ${r.agents.map((a: { target: string }) => a.target).join(', ')}\n`); return 0; }
  if (command === 'install-local-agent') { const r = installLocalAgent(); process.stdout.write(JSON.stringify({ ok: true, ...r }) + '\n'); return 0; }
  if (command === 'enable') {
    // 一键安装：runner + 针对目标 Agent 的 hook + 启用同步
    const target = String(args.target || 'all');
    const r = installLocalAgent();
    const hookOutputs: string[] = [];
    if (targetIncludesClaude(target)) {
      const settingsHook = installSettingsHook();
      hookOutputs.push(...settingsHook.hooks.map(h => `Claude Code settings: ${h}`));
    }
    if (targetIncludesOpenClaw(target)) {
      const shellHook = installHook({ target: 'openclaw' });
      hookOutputs.push(`OpenClaw shell: ${shellHook.agents.map((a: { target: string }) => a.target).join(', ')}`);
    }
    const cfg = loadConfig();
    cfg.shareData = true;
    cfg.autoSync = true;
    cfg.paused = false;
    if (cfg.workerEnabled === undefined) cfg.workerEnabled = true;
    cfg.ownerAutoVerify = true;
    saveConfig(cfg);
    process.stdout.write(`mac-aicheck Agent Lite 已启用\n`);
    process.stdout.write(`  Agent Runner: ${r.agentJs}\n`);
    if (hookOutputs.length > 0) process.stdout.write(`  Hook: ${hookOutputs.join('; ')}\n`);
    process.stdout.write(`  自动同步: 已启用\n`);
    process.stdout.write(`  Owner 自动复现: 已启用\n`);
    if (cfg.workerEnabled) {
      try {
        const workerStart = startWorkerDaemon();
        if (workerStart.started) {
          process.stdout.write(`  Worker 互助循环: 已启动 (pid ${workerStart.pid})\n`);
        } else if (workerStart.alreadyRunning) {
          process.stdout.write(`  Worker 互助循环: 已运行中\n`);
        } else if (workerStart.reason === 'missing auth token') {
          process.stdout.write(`  Worker 互助循环: 等待绑定完成后自动启动\n`);
        } else {
          process.stdout.write(`  Worker 互助循环: 已禁用\n`);
        }
      } catch (e: unknown) {
        process.stdout.write(`  Worker 互助循环: 启动失败 (${(e as Error).message})\n`);
      }
    } else {
      process.stdout.write(`  Worker 互助循环: 已禁用\n`);
    }

    // Auto-detect installed agents and bind (#30)
    if (!cfg.authToken) {
      const agents: Array<{ name: string; cmd: string; agentType: string }> = [];
      for (const { name, cmd, agentType } of [{ name: 'Claude Code', cmd: 'claude', agentType: 'claude-code' }, { name: 'OpenClaw', cmd: 'openclaw', agentType: 'openclaw' }]) {
        if ((agentType === 'claude-code' && !targetIncludesClaude(target)) || (agentType === 'openclaw' && !targetIncludesOpenClaw(target))) continue;
        try {
          execFileSync('command', ['-v', cmd], { encoding: 'utf-8', timeout: 3000, stdio: 'pipe' });
          agents.push({ name, cmd, agentType });
        } catch { /* not installed */ }
      }
      if (agents.length > 0) {
        process.stdout.write(`\n检测到 ${agents.map(a => a.name).join(', ')}\n`);
        for (const agent of agents) {
          try {
            const deviceInfo = `${hostname()}/${process.platform}`;
            const reqResult = await requestJson(
              `${apiBase()}/bind/request?agent_type=${encodeURIComponent(agent.agentType)}&device_info=${encodeURIComponent(deviceInfo)}&device_id=${encodeURIComponent(cfg.deviceId)}`,
              { method: 'POST', timeoutMs: 15000 },
            );
            if (reqResult.status === 200) {
              const { confirm_url } = reqResult.data as Record<string, unknown>;
              process.stdout.write(`  ${agent.name}: 请在浏览器确认绑定 ${confirm_url}\n`);
              // Try opening browser
              try {
                const openCmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
                execFileSync(openCmd, [confirm_url as string], { timeout: 5000 });
              } catch { /* manual */ }
            }
          } catch {
            process.stdout.write(`  ${agent.name}: 绑定请求失败（跳过，可稍后手动绑定）\n`);
          }
        }
      }
    }

    process.stdout.write(`\n请重启终端或运行: source ~/.zshrc\n`);
    return 0;
  }
  if (command === 'uninstall-hook') { uninstallHook(args); uninstallSettingsHook(); process.stdout.write('已卸载 mac-aicheck Agent Hook（shell + settings）。\n'); return 0; }
  if (command === 'migrate') {
    // Migrate from shell hook to SessionStart hook (gstack style)
    process.stderr.write('正在迁移到 SessionStart Hook 方式...\n');

    // Step 1: Remove old shell hooks
    const p = paths();
    const hooks = readJson<{ profiles?: string[] }>(p.hooks, { profiles: [] });
    for (const profile of hooks.profiles || []) {
      if (existsSync(profile)) {
        const content = readFileSync(profile, 'utf-8');
        const cleaned = stripHookBlock(content);
        writeFileSync(profile, cleaned, 'utf-8');
      }
    }
    process.stderr.write('  ✓ 已移除 zshrc 中的 shell 函数\n');

    // Step 2: Install new SessionStart/PostToolUse hooks
    const settingsHooks = installSettingsHook();
    process.stderr.write(`  ✓ 已安装 SessionStart Hook: ${settingsHooks.hooks.join(', ')}\n`);

    // Step 3: Backup and update hooks.json
    const hooksData = readJson<{ migratedAt?: string; hookType?: string }>(p.hooks, {});
    hooksData.migratedAt = nowIso();
    hooksData.hookType = 'settings';
    writeJson(p.hooks, hooksData);

    process.stdout.write('\n✅ 迁移完成！\n');
    process.stdout.write('  SessionStart Hook: 版本检查（后台运行，不阻塞启动）\n');
    process.stdout.write('  PostToolUse Hook: 错误捕获\n');
    process.stdout.write('\n请重启终端或运行: source ~/.zshrc\n');
    return 0;
  }
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
  if (command === 'bind') {
    const config = loadConfig();
    const bindCode = String(args.code || '').trim();

    // 兼容旧流程：如果用户提供了 --code，走旧的 6 位码交换
    if (bindCode && /^\d{6}$/.test(bindCode)) {
      process.stdout.write('正在绑定设备...\n');
      const result = await requestJson(`${apiBase()}/bind/${bindCode}`, { method: 'POST' });

      if (result.status !== 200) {
        const detail = ((result.data as Record<string, unknown>)?.detail as string) || '验证码无效或已过期';
        process.stderr.write(`绑定失败 (${result.status}): ${detail}\n`);
        return 1;
      }

      const { api_key } = result.data as Record<string, unknown>;
      config.authToken = api_key as string;
      config.shareData = true;
      config.autoSync = true;
      config.paused = false;
      config.confirmedAt = nowIso();
      config.ownerAutoVerify = true;
      saveConfig(config);

      process.stdout.write('\n绑定成功!\n  自动同步: 已启用\n  Owner 自动复现: 已启用\n\n');
      if (config.workerEnabled) {
        try {
          const workerStart = startWorkerDaemon();
          if (workerStart.started) process.stdout.write(`  Worker 互助循环: 已启动 (pid ${workerStart.pid})\n\n`);
        } catch (e: unknown) {
          process.stdout.write(`  Worker 互助循环: 启动失败 (${(e as Error).message})\n\n`);
        }
      }
      return 0;
    }

    // 新流程：OAuth 设备流（自动打开浏览器）
    const agentName = String(args.agent || 'unknown').trim();
    const deviceInfo = `${hostname()}/${process.platform}`;

    process.stdout.write('正在发起设备绑定...\n');

    // Step 1: 创建绑定请求
    const reqResult = await requestJson(
      `${apiBase()}/bind/request?agent_type=${encodeURIComponent(agentName)}&device_info=${encodeURIComponent(deviceInfo)}&device_id=${encodeURIComponent(config.deviceId)}`,
      { method: 'POST' },
    );

    if (reqResult.status !== 200) {
      const detail = ((reqResult.data as Record<string, unknown>)?.detail as string) || '未知错误';
      process.stderr.write(`绑定请求失败 (${reqResult.status}): ${detail}\n`);
      return 1;
    }

    const { request_token, confirm_url, expires_in } = reqResult.data as Record<string, unknown>;
    process.stdout.write(`\n请在浏览器中确认绑定:\n  ${confirm_url}\n\n`);

    // Step 2: 尝试自动打开浏览器
    try {
      const openCmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
      execFileSync(openCmd, [confirm_url as string], { timeout: 5000 });
      process.stdout.write('已自动打开浏览器。\n\n');
    } catch {
      process.stdout.write('请手动复制上方链接到浏览器中打开。\n\n');
    }

    // Step 3: 轮询等待确认
    process.stdout.write('等待确认中');
    const maxPolls = Math.min(Math.floor((expires_in as number) / 3), 200);
    for (let i = 0; i < maxPolls; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      process.stdout.write('.');

      const pollResult = await requestJson(
        `${apiBase()}/bind/poll?request_token=${encodeURIComponent(request_token as string)}`,
        { method: 'GET' },
      );

      if (pollResult.status !== 200) {
        process.stderr.write('\n绑定请求已过期，请重新运行 bind 命令。\n');
        return 1;
      }

      const pollData = pollResult.data as Record<string, unknown>;

      if (pollData.status === 'confirmed' && pollData.api_key) {
        process.stdout.write('\n\n');
        config.authToken = pollData.api_key as string;
        config.shareData = true;
        config.autoSync = true;
        config.paused = false;
        config.confirmedAt = nowIso();
        config.ownerAutoVerify = true;
        saveConfig(config);

        process.stdout.write('绑定成功!\n  自动同步: 已启用\n  Owner 自动复现: 已启用\n\n');
        if (config.workerEnabled) {
          try {
            const workerStart = startWorkerDaemon();
            if (workerStart.started) process.stdout.write(`  Worker 互助循环: 已启动 (pid ${workerStart.pid})\n\n`);
          } catch (e: unknown) {
            process.stdout.write(`  Worker 互助循环: 启动失败 (${(e as Error).message})\n\n`);
          }
        }
        process.stdout.write('现在 Claude Code 中的错误会自动记录并同步到 aicoevo.net。\n');
        return 0;
      }

      if (pollData.status === 'expired') {
        process.stdout.write('\n\n');
        process.stderr.write('绑定请求已过期，请重新运行 bind 命令。\n');
        return 1;
      }
    }

    process.stdout.write('\n\n绑定超时，请重新运行 bind 命令。\n');
    return 1;
  }
  if (command === 'upgrade') {
    const sub = rest[0];
    // mac-aicheck self-upgrade
    if (sub === 'self') {
      process.stderr.write('正在更新 mac-aicheck...\n');
      try {
        execFileSync('npm', ['install', '-g', 'mac-aicheck@latest'], { stdio: 'inherit', timeout: 60000 });
        // Write just-upgraded marker
        const stateDir = join(getBaseDir(), 'state');
        ensureDir(stateDir);
        writeFileSync(join(stateDir, 'just-upgraded-from'), LOCAL_VERSION);
        // Clear cache
        try { writeFileSync(join(stateDir, 'last-update-check'), '{}'); } catch {}
        try { const sf = join(stateDir, 'update-snoozed'); if (existsSync(sf)) writeFileSync(sf, ''); } catch {}
        process.stdout.write('mac-aicheck 已更新到最新版本!\n');
        return 0;
      } catch (e: unknown) {
        process.stderr.write(`更新失败: ${(e as Error).message}\n`);
        process.stderr.write('请手动运行: npm install -g mac-aicheck@latest\n');
        return 1;
      }
    }
    // snooze: 暂停更新提醒
    if (sub === 'snooze') {
      const stateDir = join(getBaseDir(), 'state');
      ensureDir(stateDir);
      const snoozeFile = join(stateDir, 'update-snoozed');
      let level = 0;
      let version = '';
      try {
        const existing = readFileSync(snoozeFile, 'utf8').trim().split(' ');
        version = existing[0] || '';
        level = parseInt(existing[1] || '0') + 1;
      } catch {}
      // Get the pending version from cache
      try {
        const cache = JSON.parse(readFileSync(join(stateDir, 'last-update-check'), 'utf8'));
        version = cache.remote || version;
      } catch {}
      writeFileSync(snoozeFile, `${version} ${level} ${Date.now()}`);
      const hours = [24, 48, 168][Math.min(level, 2)];
      process.stdout.write(`更新提醒已暂停 ${hours} 小时。\n`);
      return 0;
    }
    // Default: update claude-code and openclaw (original behavior)
    process.stderr.write('正在检查可用更新...\n');
    const result = await upgradeCommand();
    for (const r of result.results) {
      if (r.status === 'up to date') {
        process.stdout.write(`${r.name}: 已是最新版本 ${r.to}\n`);
      } else if (r.status === 'upgraded') {
        process.stdout.write(`${r.name}: ${r.from} → ${r.to} (已更新)\n`);
      } else if (r.status === 'unknown') {
        process.stdout.write(`${r.name}: 无法确定最新版本\n`);
      } else {
        process.stdout.write(`${r.name}: 更新失败 (${r.status})\n`);
      }
    }
    return result.ok ? 0 : 1;
  }

  // ── Bounty commands: list, recommended ──
  if (command === 'bounty-list') {
    const cfg = loadConfig();
    const headers = agentApiKeyHeaders(cfg);
    if (!headers) { process.stdout.write('悬赏命令需要 Agent API Key，请先运行 mac-aicheck agent bind\n'); return 1; }
    const page = String(args.page || '1');
    const pageSize = String(args.limit || '10');
    const sortBy = String(args.sort || 'reward');
    try {
      const result = await requestJson(`${agentApiBase('v1')}/bounties?page=${page}&page_size=${pageSize}&sort_by=${sortBy}`, {
        headers,
      });
      process.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
    } catch (e: unknown) { process.stdout.write(`获取悬赏列表失败: ${(e as Error).message}\n`); return 1; }
    return 0;
  }

  // ── Worker commands ──
  if (command === 'worker') {
    const [subcommand] = rest;
    if (subcommand === 'status') {
      const cfg = loadConfig();
      const wState = loadWorkerState();
      process.stdout.write(JSON.stringify({ ok: true, workerEnabled: cfg.workerEnabled, ownerAutoVerify: cfg.ownerAutoVerify, paused: cfg.paused, worker: wState }, null, 2) + '\n');
      return 0;
    }
    if (subcommand === 'start') {
      const cfg = loadConfig();
      if (!cfg.workerEnabled) { process.stdout.write('Worker 已被禁用。使用 worker-enable 重新启用。\n'); return 1; }
      try {
        const result = startWorkerDaemon();
        if (result.alreadyRunning) {
          process.stdout.write(JSON.stringify({ ok: true, alreadyRunning: true, worker: loadWorkerState() }, null, 2) + '\n');
          return 0;
        }
        if (result.started) {
          process.stdout.write(JSON.stringify({ ok: true, started: true, pid: result.pid, worker: loadWorkerState() }, null, 2) + '\n');
          return 0;
        }
        process.stdout.write(JSON.stringify({ ok: false, reason: result.reason, worker: loadWorkerState() }, null, 2) + '\n');
        return 1;
      } catch (e: unknown) {
        process.stdout.write(`Worker 启动失败: ${(e as Error).message}\n`);
        return 1;
      }
    }
    if (subcommand === 'stop') {
      const wState = loadWorkerState();
      wState.enabled = false;
      if (wState.pid) { try { process.kill(wState.pid); } catch {} }
      wState.status = 'stopped';
      wState.pid = null;
      wState.nextCycleAt = null;
      saveWorkerState(wState);
      releaseWorkerLock();
      process.stdout.write(JSON.stringify({ ok: true, stopped: true, worker: loadWorkerState() }, null, 2) + '\n');
      return 0;
    }
    if (subcommand === 'daemon') {
      return runWorkerDaemon(args);
    }
    process.stdout.write('用法: mac-aicheck agent worker start|stop|status|daemon\n');
    return 1;
  }

  if (command === 'owner-auto-enable' || command === 'owner-auto-disable') {
    const cfg = loadConfig();
    cfg.ownerAutoVerify = command === 'owner-auto-enable';
    saveConfig(cfg);
    process.stdout.write(
      cfg.ownerAutoVerify
        ? 'Owner 自动复现验证已启用。后台 Worker 会自动执行安全验证命令并自动提交结果。\n'
        : 'Owner 自动复现验证已禁用。待确认方案仅保留在 owner-check / owner-verify 手工流程。\n',
    );
    return 0;
  }

  if (command === 'bounty-recommended') {
    const cfg = loadConfig();
    const headers = agentApiKeyHeaders(cfg);
    if (!headers) { process.stdout.write('悬赏命令需要 Agent API Key，请先运行 mac-aicheck agent bind\n'); return 1; }
    const strategy = String(args.strategy || 'balanced');
    const limit = String(args.limit || '10');
    try {
      const result = await heartbeatAgentV2(headers, { max_parallel_tasks: Number(args.maxParallelTasks || 1) });
      const data = result.data as { recommended_bounties?: unknown[] };
      process.stdout.write(JSON.stringify({
        items: (data.recommended_bounties || []).slice(0, Number(limit)),
        total: Array.isArray(data.recommended_bounties) ? data.recommended_bounties.length : 0,
        strategy,
      }, null, 2) + '\n');
    } catch (e: unknown) { process.stdout.write(`获取推荐悬赏失败: ${(e as Error).message}\n`); return 1; }
    return 0;
  }

  if (command === 'bounty-draft-list') {
    const cfg = loadConfig();
    const headers = agentApiKeyHeaders(cfg);
    if (!headers) { process.stdout.write('悬赏命令需要 Agent API Key，请先运行 mac-aicheck agent bind\n'); return 1; }
    try {
      const result = await requestJson(`${apiBase()}/bounty-drafts/mine`, { headers });
      process.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
    } catch (e: unknown) { process.stdout.write(`获取私有草稿失败: ${(e as Error).message}\n`); return 1; }
    return 0;
  }

  if (command === 'bounty-draft-detail') {
    const cfg = loadConfig();
    const headers = agentApiKeyHeaders(cfg);
    if (!headers) { process.stdout.write('悬赏命令需要 Agent API Key，请先运行 mac-aicheck agent bind\n'); return 1; }
    const id = (args._ as string[])[0];
    if (!id) { process.stdout.write('用法: mac-aicheck agent bounty-draft-detail <id>\n'); return 1; }
    try {
      const result = await requestJson(`${apiBase()}/bounty-drafts/${id}`, { headers });
      process.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
    } catch (e: unknown) { process.stdout.write(`获取私有草稿详情失败: ${(e as Error).message}\n`); return 1; }
    return 0;
  }

  if (command === 'bounty-draft-publish') {
    const cfg = loadConfig();
    const headers = agentApiKeyHeaders(cfg);
    if (!headers) { process.stdout.write('悬赏命令需要 Agent API Key，请先运行 mac-aicheck agent bind\n'); return 1; }
    const id = (args._ as string[])[0];
    if (!id) {
      process.stdout.write('用法: mac-aicheck agent bounty-draft-publish <id> [--reward 0] [--visibility anonymous|public]\n');
      return 1;
    }
    try {
      const result = await requestJson(`${apiBase()}/bounty-drafts/${id}/publish`, {
        method: 'POST',
        headers,
        body: {
          reward: Number(args.reward || 0),
          visibility: String(args.visibility || 'anonymous'),
        },
      });
      if (result.status >= 400) {
        process.stdout.write(`公开草稿失败: ${JSON.stringify(result.data)}\n`);
        return 1;
      }
      const data = result.data as Record<string, unknown>;
      process.stdout.write(`✓ 草稿已公开 ${data.id || id}\n`);
      if (data.status) process.stdout.write(`状态: ${data.status}\n`);
      if (data.reward !== undefined) process.stdout.write(`悬赏: ${data.reward} EVO\n`);
    } catch (e: unknown) { process.stdout.write(`公开草稿失败: ${(e as Error).message}\n`); return 1; }
    return 0;
  }

  // ── Bounty: solve (KB 匹配获取答案) ──
  if (command === 'bounty-solve') {
    const cfg = loadConfig();
    const headers = agentApiKeyHeaders(cfg);
    if (!headers) { process.stdout.write('悬赏命令需要 Agent API Key，请先运行 mac-aicheck agent bind\n'); return 1; }
    const id = (args._ as string[])[0];
    if (!id) { process.stdout.write('用法: mac-aicheck agent bounty-solve <id>\n'); return 1; }
    try {
      const result = await requestJson(`${agentApiBase('v1')}/bounties/${id}/auto-solve`, {
        method: 'POST',
        headers,
      });
      if (result.status >= 400) { process.stdout.write(`KB 匹配失败: ${JSON.stringify(result.data)}\n`); return 1; }
      process.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
    } catch (e: unknown) { process.stdout.write(`KB 匹配失败: ${(e as Error).message}\n`); return 1; }
    return 0;
  }

  // ── Bounty: claim (认领悬赏) ──
  if (command === 'bounty-claim') {
    const cfg = loadConfig();
    const headers = agentApiKeyHeaders(cfg);
    if (!headers) { process.stdout.write('悬赏命令需要 Agent API Key，请先运行 mac-aicheck agent bind\n'); return 1; }
    const id = (args._ as string[])[0];
    if (!id) { process.stdout.write('用法: mac-aicheck agent bounty-claim <id>\n'); return 1; }
    const envId = String(args.env || '').trim();
    try {
      const heartbeat = await heartbeatAgentV2(headers, {
        available_env_ids: envId ? [envId] : [],
      });
      if (heartbeat.status >= 400) { process.stdout.write(`心跳失败: ${JSON.stringify(heartbeat.data)}\n`); return 1; }
      const result = await requestJson(`${agentApiBase('v2')}/bounties/${id}/claim`, {
        method: 'POST',
        headers,
        body: envId ? { env_id: envId } : {},
      });
      if (result.status >= 400) { process.stdout.write(`认领失败: ${JSON.stringify(result.data)}\n`); return 1; }
      const d = result.data as Record<string, unknown>;
      process.stdout.write(`✓ 认领成功 ${d.bounty_id} (lease ${d.lease_id})\n`);
      if (d.claimed_until) process.stdout.write(`  截止: ${d.claimed_until}\n`);
      if (d.slot_limit) process.stdout.write(`  并行槽位: ${d.slot_limit}\n`);
    } catch (e: unknown) { process.stdout.write(`认领失败: ${(e as Error).message}\n`); return 1; }
    return 0;
  }

  // ── Bounty: submit (提交回答) ──
  if (command === 'bounty-submit') {
    const cfg = loadConfig();
    const headers = agentApiKeyHeaders(cfg);
    if (!headers) { process.stdout.write('悬赏命令需要 Agent API Key，请先运行 mac-aicheck agent bind\n'); return 1; }
    const id = (args._ as string[])[0];
    const content = String(args.content || '');
    if (!id || !content) { process.stdout.write('用法: mac-aicheck agent bounty-submit <id> --content <text>\n'); return 1; }
    try {
      const result = await requestJson(`${agentApiBase('v2')}/bounties/${id}/submit`, {
        method: 'POST',
        headers,
        body: {
          content,
          source: String(args.source || 'manual'),
          confidence: Number(args.confidence || 0),
          execution_mode: String(args.executionMode || 'agent'),
        },
      });
      if (result.status >= 400) { process.stdout.write(`提交失败: ${JSON.stringify(result.data)}\n`); return 1; }
      const d = result.data as Record<string, unknown>;
      process.stdout.write(`✓ 回答已提交 ${d.id}\n`);
    } catch (e: unknown) { process.stdout.write(`提交失败: ${(e as Error).message}\n`); return 1; }
    return 0;
  }

  // ── Bounty: release (释放认领) ──
  if (command === 'bounty-release') {
    const cfg = loadConfig();
    const headers = agentApiKeyHeaders(cfg);
    if (!headers) { process.stdout.write('悬赏命令需要 Agent API Key，请先运行 mac-aicheck agent bind\n'); return 1; }
    const id = (args._ as string[])[0];
    if (!id) { process.stdout.write('用法: mac-aicheck agent bounty-release <id>\n'); return 1; }
    try {
      const result = await requestJson(`${agentApiBase('v2')}/bounties/${id}/claim`, {
        method: 'DELETE',
        headers,
      });
      if (result.status >= 400) { process.stdout.write(`释放失败: ${JSON.stringify(result.data)}\n`); return 1; }
      const d = result.data as Record<string, unknown>;
      process.stdout.write(`✓ 认领已释放 ${d.bounty_id}\n`);
    } catch (e: unknown) { process.stdout.write(`释放失败: ${(e as Error).message}\n`); return 1; }
    return 0;
  }

  // ── Bounty: auto (自动循环: 推荐 → KB匹配 → claim+submit) ──
  if (command === 'bounty-auto') {
    const cfg = loadConfig();
    const apiKeyHeaders = agentApiKeyHeaders(cfg);
    if (!apiKeyHeaders) { process.stdout.write('悬赏命令需要 Agent API Key，请先运行 mac-aicheck agent bind\n'); return 1; }
    const interval = parseInt(String(args.interval || '300'), 10);
    const maxPerCycle = parseInt(String(args.limit || '3'), 10);
    const strategy = String(args.strategy || 'balanced');
    const hdr = apiKeyHeaders;

    process.stdout.write(`bounty-auto 启动 (间隔 ${interval}s, 每轮最多 ${maxPerCycle})\n`);

    let cycle = 0;
    while (true) {
      cycle++;
      try {
        // 1. 心跳
        const recResult = await heartbeatAgentV2(hdr, { max_parallel_tasks: maxPerCycle });
        const recData = recResult.data as { recommended_bounties?: Array<Record<string, unknown> & { recommended_env_id?: string }> };
        const items = (recData.recommended_bounties || []).slice(0, maxPerCycle);

        if (items.length === 0) {
          process.stdout.write(`[${cycle}] 无推荐悬赏\n`);
        } else {
          process.stdout.write(`[${cycle}] 发现 ${items.length} 个推荐悬赏\n`);
          let solved = 0;

          for (const item of items) {
            // 3. KB 匹配
            const solveResult = await requestJson(`${agentApiBase('v1')}/bounties/${item.id}/auto-solve`, {
              method: 'POST', headers: hdr,
            });
            const solveData = solveResult.data as { matched?: boolean; answer?: string; confidence?: number; reason?: string };

            if (!solveData.matched) {
              process.stdout.write(`  [${item.id}] KB 无匹配，跳过 (${solveData.reason || ''})\n`);
              continue;
            }

            // 4. Delayed claim + submit
            const submitResult = await requestJson(`${agentApiBase('v2')}/bounties/${item.id}/claim-and-submit`, {
              method: 'POST',
              headers: hdr,
              body: {
                ...(item.recommended_env_id ? { env_id: item.recommended_env_id } : {}),
                content: solveData.answer,
                source: 'kb_auto',
                confidence: solveData.confidence || 0.8,
                execution_mode: 'agent',
              },
            });

            if (submitResult.status < 400) {
              const submitData = submitResult.data as { id?: string };
              process.stdout.write(`  ✓ [${item.id}] 已提交 KB 匹配回答 (${submitData.id})\n`);
              solved++;
            } else {
              process.stdout.write(`  ✗ [${item.id}] 提交失败: ${JSON.stringify(submitResult.data)}\n`);
            }
          }

          process.stdout.write(`[${cycle}] 本轮解决 ${solved}/${items.length}\n`);
        }
      } catch (e: unknown) {
        process.stdout.write(`[${cycle}] 循环错误: ${(e as Error).message}\n`);
      }

      process.stdout.write(`等待 ${interval}s...\n`);
      await new Promise(r => setTimeout(r, interval * 1000));
    }
  }

  if (command === 'review-list') {
    const cfg = loadConfig();
    const headers = agentApiKeyHeaders(cfg);
    if (!headers) { process.stdout.write('评审命令需要 Agent API Key，请先运行 mac-aicheck agent bind\n'); return 1; }
    try {
      const result = await requestJson(`${agentApiBase('v2')}/reviews/recommended`, {
        headers,
      });
      process.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
    } catch (e: unknown) { process.stdout.write(`获取评审任务失败: ${(e as Error).message}\n`); return 1; }
    return 0;
  }

  if (command === 'review-submit') {
    const cfg = loadConfig();
    const headers = agentApiKeyHeaders(cfg);
    if (!headers) { process.stdout.write('评审命令需要 Agent API Key，请先运行 mac-aicheck agent bind\n'); return 1; }
    const leaseId = (args._ as string[])[0];
    const resultValue = String(args.result || '');
    if (!leaseId || !/^(success|partial|failed)$/.test(resultValue)) {
      process.stdout.write('用法: mac-aicheck agent review-submit <lease_id> --result success|partial|failed\n');
      return 1;
    }
    try {
      const result = await requestJson(`${agentApiBase('v2')}/reviews/${leaseId}/submit`, {
        method: 'POST',
        headers,
        body: {
          result: resultValue,
          method: String(args.method || 'semantic'),
          notes: String(args.notes || ''),
          confidence: Number(args.confidence || 0),
          review_score: Number(args.reviewScore || 0),
          review_summary: String(args.summary || ''),
          execution_mode: String(args.executionMode || 'agent'),
        },
      });
      if (result.status >= 400) { process.stdout.write(`提交评审失败: ${JSON.stringify(result.data)}\n`); return 1; }
      process.stdout.write(`✓ 评审已提交 ${leaseId}\n`);
    } catch (e: unknown) { process.stdout.write(`提交评审失败: ${(e as Error).message}\n`); return 1; }
    return 0;
  }

  // ── TASK-100: 发起者复现循环 ──

  if (command === 'owner-check') {
    const cfg = loadConfig();
    const headers = agentApiKeyHeaders(cfg);
    if (!headers) { process.stdout.write('需要 Agent API Key，请先运行 mac-aicheck agent bind\n'); return 1; }
    try {
      const result = await requestJson(`${agentApiBase('v2')}/status`, { headers });
      if (result.status !== 200) { process.stdout.write(`获取状态失败: ${result.status}\n`); return 1; }
      const pending = (result.data as Record<string, unknown>).pending_owner_verifications as Array<Record<string, string>> || [];
      if (pending.length === 0) {
        process.stdout.write('没有待复现确认的方案。\n');
        return 0;
      }
      process.stdout.write(`待复现确认 (${pending.length}):\n\n`);
      for (const item of pending) {
        const guide = writeOwnerVerifyGuide(item, cfg);
        process.stdout.write(`## ${item.title || '(无标题)'}\n`);
        process.stdout.write(`  Bounty:   ${item.bounty_id}\n`);
        process.stdout.write(`  Answer:   ${item.answer_id}\n`);
        process.stdout.write(`  方案摘要: ${item.solution_summary}\n`);
        process.stdout.write(`  提交时间: ${item.submitted_at}\n`);
        process.stdout.write(`  截止时间: ${item.deadline_at}\n\n`);
        process.stdout.write(`  指南:     ${guide.guideMd}\n`);
        process.stdout.write(`  快照:     ${guide.snapshotJson}\n\n`);
        process.stdout.write(`  → mac-aicheck agent owner-verify ${item.bounty_id} --answer ${item.answer_id} --result success|partial|failed\n\n`);
      }
    } catch (e: unknown) { process.stdout.write(`获取待复现列表失败: ${(e as Error).message}\n`); return 1; }
    return 0;
  }

  if (command === 'owner-verify') {
    const cfg = loadConfig();
    const headers = agentApiKeyHeaders(cfg);
    if (!headers) { process.stdout.write('需要 Agent API Key，请先运行 mac-aicheck agent bind\n'); return 1; }
    const bountyId = (args._ as string[])[0];
    const answerId = String(args.answer || '');
    const resultValue = String(args.result || '');
    if (!bountyId || !answerId || !/^(success|partial|failed)$/.test(resultValue)) {
      process.stdout.write('用法: mac-aicheck agent owner-verify <bounty_id> --answer <id> --result success|partial|failed\n');
      process.stdout.write('       [--notes <text>] [--cmd <cmd1,cmd2>]\n');
      return 1;
    }
    const notes = String(args.notes || '');
    const commandsRun = args.cmd ? String(args.cmd).split(',').map((s: string) => s.trim()).filter(Boolean) : [];
    const fallbackItem = {
      bounty_id: bountyId,
      answer_id: answerId,
      title: '待确认方案',
      solution_summary: notes || '请在本地环境确认问题是否已消失。',
      submitted_at: '',
      deadline_at: '',
    };
    let guideRecord = loadOwnerVerifySnapshot(bountyId, answerId);
    if (!guideRecord.snapshot) {
      guideRecord = writeOwnerVerifyGuide(fallbackItem, cfg);
    }

    // prompt 策略: 默认必须提示用户确认
    const skipPrompt = args.yes === true || args.yes === 'true';
    if (!skipPrompt) {
      process.stdout.write(`\n即将提交复现验证:\n`);
      process.stdout.write(`  Bounty: ${bountyId}\n`);
      process.stdout.write(`  Answer: ${answerId}\n`);
      process.stdout.write(`  Result: ${resultValue}\n`);
      process.stdout.write(`\n请确认您已在本地环境验证该方案。输入 yes 继续: `);
      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const confirm = await new Promise<string>(resolve => rl.question('', (ans: string) => { rl.close(); resolve(ans.trim().toLowerCase()); }));
      if (confirm !== 'yes' && confirm !== 'y') {
        process.stdout.write('已取消。\n');
        return 0;
      }
    }

    try {
      const submittedAt = nowIso();
      const afterContext = {
        submitted_at: submittedAt,
        confirmation_mode: skipPrompt ? 'flag_yes' : 'interactive_prompt',
        result: resultValue,
        notes,
        commands_run: commandsRun,
        local_context: ownerVerifyLocalContext(cfg),
      };
      const result = await requestJson(`${agentApiBase('v2')}/bounties/${bountyId}/owner-verify`, {
        method: 'POST',
        headers,
        body: {
          answer_id: answerId,
          result: resultValue,
          notes,
          commands_run: commandsRun,
          proof_payload: {
            summary: `Owner verification for ${bountyId}/${answerId}`,
            steps: [
              `读取本地指南: ${guideRecord.guideMd}`,
              commandsRun.length
                ? `本地执行验证命令: ${commandsRun.join(' ; ')}`
                : '按本地指南手动确认问题是否消失。',
              `用户确认结果: ${resultValue}`,
            ],
            before_context: guideRecord.snapshot || {},
            after_context: afterContext,
            validation_cmd: commandsRun[0] || '',
            expected_output:
              resultValue === 'success'
                ? '问题已消失或行为符合预期'
                : resultValue === 'partial'
                  ? '问题部分缓解，但仍有残留'
                  : '问题仍然可复现',
          },
          artifacts: {
            owner_reproduction_guide_path: guideRecord.guideMd,
            owner_reproduction_snapshot_path: guideRecord.snapshotJson,
            owner_reproduction_guide_sha256: guideRecord.guideSha256,
            owner_reproduction_snapshot_generated_at: (guideRecord.snapshot as Record<string, unknown> | null)?.generatedAt || '',
          },
        },
      });
      if (result.status !== 200) {
        process.stdout.write(`提交失败 (${result.status}): ${JSON.stringify(result.data)}\n`);
        return 1;
      }
      const data = result.data as Record<string, unknown>;
      process.stdout.write(`复现验证已提交:\n`);
      process.stdout.write(`  状态: ${data.review_status || 'unknown'}\n`);
      process.stdout.write(`  Owner 分数: ${data.owner_score ?? '-'}\n`);
      process.stdout.write(`  社区分数: ${data.community_score ?? '-'}\n`);
      process.stdout.write(`  总分: ${data.total_score ?? '-'} / ${data.threshold ?? 70}\n`);
    } catch (e: unknown) { process.stdout.write(`提交复现验证失败: ${(e as Error).message}\n`); return 1; }
    return 0;
  }

  throw new Error(`未知 agent 命令: ${command}`);
}

export const _testHelpers = {
  agentApiKeyHeaders,
  agentApiBase,
  apiBase,
  isBlockedHost,
  assertSafeRequestUrl,
  acquireWorkerLock,
  releaseWorkerLock,
  createEvent,
  loadConfig,
  saveConfig,
  loadWorkerState,
  saveWorkerState,
};

if (require.main === module) {
  main(process.argv.slice(2)).then(code => { process.exitCode = typeof code === 'number' ? code : 0; }).catch(e => { console.error(`mac-aicheck Agent 错误: ${e.message}`); process.exitCode = 1; });
}
