#!/usr/bin/env node
// mac-aicheck-hook-version: 1.0.0
// PostToolUse hook: 捕获 Bash/Agent 执行错误，存储到经验库
// 从 stdin 读取 hook payload

const { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const crypto = require('crypto');

function getHome(): string { return process.env.HOME || homedir(); }
const BASE_DIR = join(getHome(), '.mac-aicheck');
const OUTBOX_FILE = join(BASE_DIR, 'outbox', 'events.jsonl');
const EXPERIENCE_FILE = join(BASE_DIR, 'experience.jsonl');
const DAILY_DIR = join(BASE_DIR, 'daily');

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function nowIso(): string { return new Date().toISOString(); }
function today(): string { return nowIso().slice(0, 10); }

function shortHash(v: string): string {
  return crypto.createHash('sha256').update(v).digest('hex').slice(0, 16);
}

// Experience patterns (same as agent-lite)
const EXPERIENCE_PATTERNS: Array<{ patterns: string[]; title: string; advice: string; commands?: string[] }> = [
  { patterns: ['ModuleNotFoundError', 'No module named', 'ImportError'], title: 'Python 模块缺失', advice: '安装缺失的 Python 依赖', commands: ['pip install <module>', 'pip3 install <module>'] },
  { patterns: ['SyntaxError:', 'IndentationError', 'TabError'], title: 'Python 语法错误', advice: '检查 Python 代码缩进和语法', commands: ['python3 -m py_compile <file>'] },
  { patterns: ['TypeError:', 'AttributeError:', 'KeyError:', 'ValueError:'], title: 'Python 运行时错误', advice: '检查数据类型和属性访问', commands: [] },
  { patterns: ['alembic'], title: 'Alembic 数据库迁移工具缺失', advice: '安装 alembic', commands: ['pip install alembic', 'pip3 install alembic'] },
  { patterns: ['Permission denied', 'EACCES', 'operation not permitted'], title: '权限错误', advice: '需要提升权限或检查文件权限', commands: ['ls -la', 'sudo <cmd>'] },
  { patterns: ['ECONNREFUSED', 'Connection refused'], title: '连接被拒绝', advice: '检查服务是否运行，或网络是否正常', commands: [] },
  { patterns: ['ETIMEDOUT', 'Timed out'], title: '连接超时', advice: '网络连接超时，稍后重试', commands: [] },
  { patterns: ['MCP server error', 'mcp server', 'MCP error'], title: 'MCP 服务器错误', advice: 'MCP 服务器连接失败，检查配置和日志', commands: [] },
  { patterns: ['unknown flag:', 'invalid option', 'Unknown skill:'], title: '命令参数错误', advice: '命令参数不正确，检查帮助信息', commands: ['<cmd> --help'] },
  { patterns: ['fatal:', 'not an empty directory', 'needs merge'], title: 'Git 操作错误', advice: '检查 git 仓库状态', commands: ['git status', 'git pull --rebase'] },
  { patterns: ['command not found', 'not found:', 'ENOENT'], title: '命令不存在', advice: '请安装缺失的命令，或检查 PATH', commands: ['which <cmd>', 'brew install <pkg>'] },
  { patterns: ['Traceback', 'most recent call last'], title: '代码执行错误', advice: '查看上方堆栈跟踪定位错误位置', commands: [] },
  { patterns: ['GraphQL:', 'GitHub API'], title: 'GitHub API 错误', advice: '检查 GitHub 认证状态和网络连接', commands: ['gh auth status'] },
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

interface HookPayload {
  toolName: string;
  toolInput?: { command?: string };
  toolOutput?: { error?: string; stderr?: string; stdout?: string };
  exitCode?: number;
  sessionId?: string;
  error?: string;
}

// Read payload from stdin
let payload = '';
process.stdin.on('data', (chunk: Buffer) => {
  payload += chunk.toString();
});

process.stdin.on('end', () => {
  try {
    const data: HookPayload = JSON.parse(payload);
    handleToolResult(data);
  } catch (e) {
    // Silent exit on parse error - don't block Claude Code
    process.exit(0);
  }
});

function handleToolResult(data: HookPayload): void {
  // Only handle Bash and Agent tools
  if (!['Bash', 'Agent', 'Task', 'bashcon'].some(t => data.toolName?.toLowerCase().includes(t))) {
    return;
  }

  // Check for errors
  const errorMsg = data.error || data.toolOutput?.stderr || data.toolOutput?.error || '';
  const exitCode = data.exitCode;

  // No error = skip
  if (!errorMsg && exitCode === 0) {
    return;
  }

  // Noise patterns to filter out
  const NOISE_PATTERNS = [
    /Input must be provided either through stdin or as a prompt argument when using --print/i,
    /^Error: Input must be provided/i,
  ];

  if (NOISE_PATTERNS.some(p => p.test(errorMsg))) {
    return;
  }

  // Skip if no meaningful error message
  if (!errorMsg.trim()) {
    return;
  }

  const fingerprint = shortHash(`${data.toolName}\n${errorMsg.replace(/\d+/g, '<N>')}`);

  // Create event
  const event = {
    schemaVersion: 1,
    eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    clientId: 'hook',
    deviceId: 'hook',
    source: 'mac-aicheck-post-tool-hook' as const,
    agent: 'claude-code',
    eventType: 'post_tool_error',
    occurredAt: nowIso(),
    fingerprint,
    sanitizedMessage: errorMsg.slice(0, 8000),
    severity: 'error' as const,
    localContext: {
      os: `${process.platform} ${process.release}`,
      shell: process.env.SHELL || '',
      node: process.version,
      cwdHash: shortHash(process.cwd()),
    },
    syncStatus: 'pending' as const,
  };

  // Store event
  ensureDir(join(BASE_DIR, 'outbox'));
  ensureDir(DAILY_DIR);
  appendFileSync(OUTBOX_FILE, JSON.stringify(event) + '\n');

  // Update daily pack
  const dateFile = join(DAILY_DIR, `${today()}.json`);
  interface DailyPack {
    date: string;
    totalEvents: number;
    uniqueFingerprints: number;
    repeatedEvents: number;
    fixedEvents: number;
    consecutiveFailures: number;
    lastFailureFingerprint: string | null;
    lastEventAt: string | null;
    topProblems: Array<{ fingerprint: string; title: string; count: number; status: string }>;
  }

  const defaultPack: DailyPack = {
    date: today(),
    totalEvents: 0,
    uniqueFingerprints: 0,
    repeatedEvents: 0,
    fixedEvents: 0,
    consecutiveFailures: 0,
    lastFailureFingerprint: null,
    lastEventAt: null,
    topProblems: [],
  };

  let pack: DailyPack = defaultPack;
  try {
    if (existsSync(dateFile)) {
      pack = JSON.parse(readFileSync(dateFile, 'utf8'));
    }
  } catch (e) {}

  pack.totalEvents++;
  pack.lastEventAt = event.occurredAt;

  if (pack.lastFailureFingerprint === fingerprint) {
    pack.consecutiveFailures++;
  } else {
    pack.consecutiveFailures = 1;
    pack.lastFailureFingerprint = fingerprint;
  }

  const existingProblem = pack.topProblems.find(p => p.fingerprint === fingerprint);
  if (existingProblem) {
    existingProblem.count++;
    existingProblem.status = 'repeated';
    pack.repeatedEvents++;
  } else {
    pack.topProblems.push({
      fingerprint,
      title: errorMsg.split('\n')[0].slice(0, 120) || event.eventType,
      count: 1,
      status: 'new',
    });
  }
  pack.uniqueFingerprints = pack.topProblems.length;
  pack.topProblems.sort((a, b) => b.count - a.count);

  writeFileSync(dateFile, JSON.stringify(pack, null, 2));

  // Lookup and display experience advice
  const exp = lookupExperience(errorMsg);
  if (exp) {
    // Append to experience log
    appendFileSync(EXPERIENCE_FILE, JSON.stringify({
      fingerprint,
      eventType: event.eventType,
      title: exp.title,
      advice: exp.advice,
      commands: exp.commands,
      happenedAt: nowIso(),
      resolved: false,
    }) + '\n');

    // Output advice to stderr (will be shown to user)
    process.stderr.write(`\n💡 mac-aicheck 经验库建议:\n`);
    process.stderr.write(`   ${exp.title}\n`);
    process.stderr.write(`   ${exp.advice}\n`);
    if (exp.commands.length > 0) {
      process.stderr.write(`   可尝试: ${exp.commands.join(' | ')}\n`);
    }
  }

  process.stderr.write(`\nmac-aicheck: 已记录问题 ${event.eventId}\n`);
}
