/**
 * hermes.ts — Hermes Agent Scanner
 *
 * 检测 Hermes AI Agent 是否安装、版本、可用工具集、能力范围。
 *
 * 对应 Milestone B: MacAICheck → Hermes delegate_task 集成
 */

import { execSync } from 'child_process';
import { homedir } from 'os';
import type { Scanner, ScanResult } from './types';
import { registerScanner } from './registry';

// ── Helpers ──────────────────────────────────────────────────────────────────

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd} 2>/dev/null`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

function execQuiet(cmd: string, timeout = 5000): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout, stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

// ── Hermes Capabilities ───────────────────────────────────────────────────────

interface HermesCapabilities {
  version: string | null;
  path: string | null;
  delegateTask: boolean;
  kanban: boolean;
  cron: boolean;
  mcp: boolean;
  toolsets: string[];
  model: string | null;
  pythonVersion: string | null;
}

function detectHermesCapabilities(): HermesCapabilities {
  const caps: HermesCapabilities = {
    version: null,
    path: null,
    delegateTask: false,
    kanban: false,
    cron: false,
    mcp: false,
    toolsets: [],
    model: null,
    pythonVersion: null,
  };

  if (!commandExists('hermes')) return caps;

  // Path
  try {
    caps.path = execSync('command -v hermes', { encoding: 'utf-8' }).trim();
  } catch { /* noop */ }

  // Version
  const ver = execQuiet('hermes --version 2>/dev/null');
  caps.version = ver || null;

  // Python version
  caps.pythonVersion = execQuiet('python3 --version 2>/dev/null').replace(/^python\s+/i, '') || null;

  // Subcommands (capabilities)
  const subcommands = execQuiet('hermes --help 2>/dev/null', 8000);
  caps.delegateTask = subcommands.includes('chat');
  caps.kanban = subcommands.includes('kanban');
  caps.cron = subcommands.includes('cron');
  caps.mcp = subcommands.includes('mcp');

  // Available toolsets: probe via hermes tools
  try {
    const toolsHelp = execSync('hermes tools --help 2>/dev/null || hermes chat --help 2>/dev/null', { encoding: 'utf-8', timeout: 8000 });
    const toolsetMatch = toolsHelp.match(/toolsets?\s+TOOLSETS?[\s\S]*?default:\s+([^\n]+)/i)
      || toolsHelp.match(/-t,?\s+--toolsets\s+([^\n]+)/i);
    if (toolsetMatch) {
      caps.toolsets = toolsetMatch[1].split(/[,|]/).map((t: string) => t.trim()).filter(Boolean);
    } else {
      // Default known toolsets
      caps.toolsets = ['terminal', 'file', 'web', 'browser', 'delegation', 'vision'];
    }
  } catch {
    caps.toolsets = ['terminal', 'file', 'web', 'browser', 'delegation', 'vision'];
  }

  // Model
  try {
    const statusOut = execSync('hermes status 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
    const modelMatch = statusOut.match(/model:\s*([^\n]+)/i) || statusOut.match(/provider:\s*([^\n]+)/i);
    if (modelMatch) caps.model = modelMatch[1].trim();
  } catch { /* model check optional */ }

  return caps;
}

// ── Delegate Task Health Check ────────────────────────────────────────────────

interface HermesDelegateHealth {
  reachable: boolean;
  responseTimeMs: number | null;
  error: string | null;
}

function checkDelegateHealth(): HermesDelegateHealth {
  const start = Date.now();
  try {
    execSync('hermes chat -q "echo ok" -t terminal --provider minimax 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return { reachable: true, responseTimeMs: Date.now() - start, error: null };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    // Non-zero exit is OK if we got output; timeout is the real failure
    if (err.includes('SIGKILL') || err.includes('timeout') || err.includes('Timed out')) {
      return { reachable: false, responseTimeMs: null, error: 'timeout' };
    }
    return { reachable: false, responseTimeMs: Date.now() - start, error: err };
  }
}

// ── Scanner ───────────────────────────────────────────────────────────────────

const scanner: Scanner = {
  id: 'hermes',
  name: 'Hermes Agent',
  category: 'ai-tools',
  affectsScore: false,
  defaultEnabled: true,

  async scan(): Promise<ScanResult> {
    // Step 1: Command exists
    if (!commandExists('hermes')) {
      return {
        id: this.id,
        name: this.name,
        category: this.category,
        status: 'warn',
        message: 'Hermes Agent 未安装。安装: cd ~/Hermes-Agent && ./setup-hermes.sh',
        error_type: 'missing',
        fixCommand: 'cd ~/Hermes-Agent && ./setup-hermes.sh',
        suggestions: [
          '参考: https://github.com/gugug168/hermes-agent',
          '或使用 pip: pip install hermes-agent',
        ],
      };
    }

    // Step 2: Detect capabilities
    const caps = detectHermesCapabilities();
    const health = checkDelegateHealth();

    if (!health.reachable && health.error === 'timeout') {
      return {
        id: this.id,
        name: this.name,
        category: this.category,
        status: 'fail',
        message: `Hermes 已安装 (${caps.version || 'unknown'})，但委托调用超时（30s）`,
        version: caps.version,
        path: caps.path,
        error_type: 'network',
        detail: `Path: ${caps.path || 'unknown'}\nPython: ${caps.pythonVersion || 'unknown'}\nModel: ${caps.model || 'unknown'}\nToolsets: ${caps.toolsets.join(', ') || 'unknown'}`,
        suggestions: [
          '检查 API key 配置: hermes auth status',
          '检查网络连接: hermes doctor',
          '尝试简化任务: hermes chat -q "echo ok" -t terminal',
        ],
      };
    }

    const parts: string[] = [];
    parts.push(`Hermes ${caps.version || 'unknown'}`);
    if (caps.path) parts.push(`Path: ${caps.path ? caps.path.replace(homedir(), '~') : 'unknown'}`);
    parts.push(`Python: ${caps.pythonVersion || 'unknown'}`);
    if (caps.model) parts.push(`Model: ${caps.model}`);
    parts.push(`delegate_task: ${caps.delegateTask ? '✓' : '✗'}`);
    parts.push(`kanban: ${caps.kanban ? '✓' : '✗'}`);
    parts.push(`cron: ${caps.cron ? '✓' : '✗'}`);
    parts.push(`mcp: ${caps.mcp ? '✓' : '✗'}`);
    parts.push(`toolsets: ${caps.toolsets.join(', ') || 'unknown'}`);

    return {
      id: this.id,
      name: this.name,
      category: this.category,
      status: 'pass',
      message: parts.join(' | '),
      version: caps.version,
      path: caps.path,
      detail: `delegate_task: ${caps.delegateTask ? 'supported' : 'not available'}\n`
        + `kanban: ${caps.kanban ? 'supported' : 'not available'}\n`
        + `cron: ${caps.cron ? 'supported' : 'not available'}\n`
        + `mcp: ${caps.mcp ? 'supported' : 'not available'}\n`
        + `toolsets: ${caps.toolsets.join(', ')}\n`
        + `health: ${health.reachable ? `OK (${health.responseTimeMs}ms)` : `ERROR: ${health.error}`}`,
    };
  },
};

registerScanner(scanner);
