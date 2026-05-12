/**
 * embedded-agent-manager.ts
 *
 * 负责写入 ~/.mac-aicheck/agent/agent-lite.js 并管理其生命周期。
 *
 * 核心职责：
 * 1. writeAgentLite() — 将 AGENT_LITE_SOURCE 写入 agent-lite.js
 * 2. installAgentLite() — 写入 + 设置可执行权限
 * 3. spawnAgentLite() — 启动为 long-lived subprocess（IPC 模式）
 * 4. ipcCall() — 向 subprocess 发送 JSON-RPC 风格消息
 * 5. shutdown() — 优雅终止 subprocess
 *
 * IPC 协议（stdin/stdout JSON）：
 *   → {"method": "capture", "params": {...}, "id": 1}
 *   ← {"id": 1, "result": {"ok": true, "eventId": "..."}}
 *   ← {"id": 1, "error": {"code": -32600, "message": "..."}}
 *
 * 对应 Milestone 2：embedded-agent-lite.js
 */

import {
  spawn,
  ChildProcess,
} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AGENT_LITE_SOURCE } from './embedded-agent-source.js';

function getBaseDir(): string {
  return process.env.MAC_AICHECK_BASE_DIR || path.join(os.homedir(), '.mac-aicheck');
}

function agentDir(): string {
  return path.join(getBaseDir(), 'agent');
}

function agentLitePath(): string {
  return path.join(agentDir(), 'agent-lite.js');
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Agent Lite Install ─────────────────────────────────────────────────────────

export interface InstallResult {
  ok: boolean;
  path: string;
  installedAt: string;
  hash: string | null;
}

/**
 * Write agent-lite.js to ~/.mac-aicheck/agent/
 */
export function writeAgentLite(source?: string): InstallResult {
  const targetPath = agentLitePath();
  ensureDir(agentDir());

  const content = source ?? AGENT_LITE_SOURCE;
  fs.writeFileSync(targetPath, content, 'utf8');
  // Make readable/executable
  fs.chmodSync(targetPath, 0o755);

  // Simple hash of content for change detection
  const crypto = require('node:crypto') as typeof import('node:crypto');
  const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

  return {
    ok: true,
    path: targetPath,
    installedAt: new Date().toISOString(),
    hash,
  };
}

// ── IPC Subprocess Management ────────────────────────────────────────────────

let _activeProcess: ChildProcess | null = null;
let _pendingCalls: Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }> = new Map();
let _nextId = 1;
let _stderrLines: string[] = [];

interface IpcRequest {
  method: string;
  params?: Record<string, unknown>;
  id: number;
}

interface IpcResponse {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

function _handleIpcMessage(raw: string): void {
  try {
    const msg: IpcResponse = JSON.parse(raw);
    const pending = _pendingCalls.get(msg.id);
    if (!pending) return;
    _pendingCalls.delete(msg.id);
    if (msg.error) pending.reject(new Error(msg.error.message));
    else pending.resolve(msg.result);
  } catch {
    // ignore unparseable lines
  }
}

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
}

export interface SpawnResult {
  ok: boolean;
  pid: number | null;
  error?: string;
}

/**
 * Spawn agent-lite.js as a long-lived subprocess for IPC.
 * Returns immediately; use ipcCall() to communicate.
 */
export function spawnAgentLite(opts: SpawnOptions = {}): SpawnResult {
  if (_activeProcess && !_activeProcess.killed) {
    return { ok: true, pid: _activeProcess.pid ?? null };
  }

  const agentPath = agentLitePath();
  if (!fs.existsSync(agentPath)) {
    return { ok: false, pid: null, error: `agent-lite.js not found at ${agentPath}` };
  }

  _pendingCalls.clear();
  _stderrLines = [];

  const child = spawn('node', [agentPath], {
    cwd: opts.cwd ?? getBaseDir(),
    env: { ...process.env, ...opts.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  _activeProcess = child;

  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');

  let stdoutBuffer = '';
  child.stdout?.on('data', (chunk: string) => {
    stdoutBuffer += chunk;
    // Handle both streaming (newline-delimited) and buffered modes
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) _handleIpcMessage(line.trim());
    }
  });

  child.stderr?.on('data', (chunk: string) => {
    const line = chunk.toString().trim();
    if (line) _stderrLines.push(line);
  });

  child.on('exit', (code, signal) => {
    _activeProcess = null;
    // Reject any pending calls
    for (const [, p] of _pendingCalls) p.reject(new Error(`agent-lite exited: ${signal ?? code}`));
    _pendingCalls.clear();
  });

  child.on('error', (err) => {
    _activeProcess = null;
    for (const [, p] of _pendingCalls) p.reject(err);
    _pendingCalls.clear();
  });

  return { ok: true, pid: child.pid ?? null };
}

/**
 * Send an IPC call to the agent-lite subprocess.
 * Returns a promise that resolves with the result.
 */
export async function ipcCall(
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 30_000,
): Promise<unknown> {
  if (!_activeProcess || _activeProcess.killed) {
  const { spawn: spawnCmd } = await import('node:child_process');
  return new Promise((resolve, reject) => {
    const child = spawnCmd('node', [path.join(__dirname, '../index.js'), 'capture',
      ...Object.entries(params).flatMap(([k, v]) => [`--${k}`, String(v)]),
    ], { cwd: __dirname });
    let stdout = '';
    child.stdout?.on('data', (c: string) => { stdout += c; });
    child.on('close', (code) => {
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error(`capture CLI failed: ${stdout}`)); }
    });
  });
  }

  const id = _nextId++;
  const req: IpcRequest = { method, params, id };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pendingCalls.delete(id);
      reject(new Error(`IPC call ${method} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    _pendingCalls.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });

    if (_activeProcess?.stdin) {
      _activeProcess.stdin.write(`${JSON.stringify(req)}\n`, 'utf8');
    }
  });
}

/**
 * Gracefully shut down the agent-lite subprocess.
 */
export function shutdownAgentLite(): Promise<void> {
  return new Promise((resolve) => {
    if (!_activeProcess || _activeProcess.killed) { resolve(); return; }

    const child = _activeProcess;
    child.once('exit', () => resolve());
    child.kill('SIGTERM');

    // Force after 5s
    setTimeout(() => {
      if (!_activeProcess?.killed) {
        try { _activeProcess?.kill('SIGKILL'); } catch { /* already dead */ }
      }
      resolve();
    }, 5000).unref();
  });
}

/**
 * Get recent stderr output from the subprocess.
 */
export function getStderr(): string[] {
  return [..._stderrLines];
}

/**
 * Check if agent-lite subprocess is alive.
 */
export function isAgentLiteRunning(): boolean {
  return _activeProcess !== null && !_activeProcess.killed;
}
