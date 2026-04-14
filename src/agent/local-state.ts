import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { copyFileSync } from 'fs';
import type { AgentStatus } from './types';

function getBaseDir(): string {
  return join(homedir(), '.mac-aicheck');
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function readJsonl(file: string): unknown[] {
  try {
    if (!existsSync(file)) return [];
    return readFileSync(file, 'utf-8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getPaths() {
  const base = getBaseDir();
  return {
    base,
    config: join(base, 'config.json'),
    hooks: join(base, 'hooks.json'),
    outbox: join(base, 'outbox', 'events.jsonl'),
    ledger: join(base, 'uploads', 'ledger.jsonl'),
    adviceJson: join(base, 'advice', 'latest.json'),
    adviceMd: join(base, 'advice', 'latest.md'),
    dailyDir: join(base, 'daily'),
    agentDir: join(base, 'agent'),
    agentJs: join(base, 'agent', 'agent-lite.js'),
    agentCmd: join(base, 'agent', 'mac-aicheck-agent'),
  };
}

function today(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function runAgentCommand(args: string[]): string {
  const paths = getPaths();
  if (existsSync(paths.agentCmd)) {
    return execFileSync(paths.agentCmd, args, {
      encoding: 'utf-8',
      timeout: 30000,
    });
  }

  const localWrapper = join(process.cwd(), 'bin', 'mac-aicheck-agent');
  if (existsSync(localWrapper)) {
    return execFileSync(process.execPath, [localWrapper, ...args], {
      encoding: 'utf-8',
      timeout: 30000,
    });
  }

  return execFileSync('npx', ['mac-aicheck', 'agent', ...args], {
    encoding: 'utf-8',
    timeout: 60000,
  });
}

function installEmbeddedLocalAgent() {
  const p = getPaths();
  mkdirSync(p.agentDir, { recursive: true });
  // 从 dist/agent/index.js 复制（已编译，可直接运行）
  const src = join(__dirname, '../agent/index.js');
  copyFileSync(src, p.agentJs);
  const hash = require('crypto').createHash('sha256').update(readFileSync(p.agentJs, 'utf-8')).digest('hex');
  writeFileSync(
    join(p.agentDir, 'agent-lite.hash.json'),
    JSON.stringify({ sha256: hash, source: 'cli', installedAt: new Date().toISOString() }, null, 2) + '\n',
    'utf-8',
  );
  const cmd = [
    '#!/bin/bash',
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    'exec node "$SCRIPT_DIR/agent-lite.js" "$@"',
    '',
  ].join('\n');
  writeFileSync(p.agentCmd, cmd, 'utf-8');
  return {
    agentDir: p.agentDir,
    agentJs: p.agentJs,
    agentCmd: p.agentCmd,
  };
}

export function getAgentLocalStatus(): AgentStatus {
  const paths = getPaths();
  const config = readJson<Record<string, unknown>>(paths.config, {});
  const hooks = readJson<Record<string, unknown>>(paths.hooks, {});
  const events = readJsonl(paths.outbox);
  const ledger = readJsonl(paths.ledger);
  const todayPack = readJson(join(paths.dailyDir, `${today()}.json`), {
    date: today(),
    totalEvents: 0,
    uniqueFingerprints: 0,
    repeatedEvents: 0,
    fixedEvents: 0,
    topProblems: [],
  });
  const advice = readJson<Record<string, unknown>>(paths.adviceJson, {});

  return {
    enabled: existsSync(paths.agentCmd) && Array.isArray(hooks.agents) && (hooks.agents as unknown[]).length > 0,
    localRunnerInstalled: existsSync(paths.agentCmd),
    paused: !!config.paused,
    shareData: !!config.shareData,
    autoSync: !!config.autoSync,
    email: (config.email as string) || null,
    agentCmd: paths.agentCmd,
    hooks: hooks as unknown as AgentStatus['hooks'],
    totals: {
      events: events.length,
      pending: events.filter((event: unknown) => (event as { syncStatus?: string }).syncStatus !== 'synced').length,
      synced: events.filter((event: unknown) => (event as { syncStatus?: string }).syncStatus === 'synced').length,
      uploads: ledger.length,
    },
    today: todayPack as AgentStatus['today'],
    latestEvents: events.slice(-20).reverse() as AgentStatus['latestEvents'],
    latestUploads: ledger.slice(-20).reverse() as AgentStatus['latestUploads'],
    advice: advice as AgentStatus['advice'],
  };
}

export function enableAgentExperience(target = 'all'): { ok: boolean; localAgent: ReturnType<typeof installEmbeddedLocalAgent>; hook: string; status: AgentStatus } {
  const localAgent = installEmbeddedLocalAgent();
  let hookOutput = '';
  let hookOk = false;
  try {
    hookOutput = runAgentCommand(['install-hook', '--target', target]);
    hookOk = true;
  } catch {
    hookOk = false;
  }
  return {
    ok: hookOk,
    localAgent,
    hook: hookOutput,
    status: getAgentLocalStatus(),
  };
}

export function pauseAgentUploads(paused: boolean): { ok: boolean; output: string; status: AgentStatus } {
  const output = runAgentCommand([paused ? 'pause' : 'resume']);
  return {
    ok: true,
    output,
    status: getAgentLocalStatus(),
  };
}

export function syncAgentEvents(): { ok: boolean; output: string; status: AgentStatus } {
  try {
    const output = runAgentCommand(['sync']);
    const parsed = JSON.parse(output);
    return {
      ok: parsed.ok !== false && !parsed.error,
      output,
      status: getAgentLocalStatus(),
    };
  } catch {
    return {
      ok: false,
      output: '',
      status: getAgentLocalStatus(),
    };
  }
}
