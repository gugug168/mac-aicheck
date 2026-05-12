/**
 * hermes-delegation.ts
 *
 * Hermes delegation service for mac-aicheck.
 * Dispatches tasks to the Hermes agent via `hermes chat` CLI and returns structured results.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface DelegationOptions {
  toolsets?: string[];       // e.g. ['terminal', 'file', 'web']
  timeoutMs?: number;        // default 300000 (5 min)
  model?: string;            // e.g. 'minimax'
  provider?: string;         // e.g. 'minimax'
}

export interface DelegationResult {
  success: boolean;
  taskId: string;
  output: string;
  error?: string;
  durationMs: number;
}

function getBaseDir(): string {
  return process.env.MAC_AICHECK_BASE_DIR || join(homedir(), '.mac-aicheck');
}

function hermesResultsDir(): string {
  return join(getBaseDir(), 'hermes-results');
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function generateTaskId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${random}`;
}

export class HermesDelegationService {
  private hermesPath: string;
  private resultsDir: string;

  constructor(hermesPath?: string) {
    this.hermesPath = hermesPath ?? 'hermes';
    this.resultsDir = hermesResultsDir();
    ensureDir(this.resultsDir);
  }

  /**
   * Delegates a task to Hermes agent and returns structured result.
   */
  async delegateTask(
    goal: string,
    context?: string,
    options?: DelegationOptions
  ): Promise<DelegationResult> {
    const taskId = generateTaskId();
    const timeoutMs = options?.timeoutMs ?? 300000; // 5 min default
    const startTime = Date.now();

    // Build hermes arguments
    // -Q = quiet mode (suppress session banner/progress, needed for pipe parsing)
    const args: string[] = ['chat', '-q', goal, '-t', 'terminal', '-Q'];

    if (options?.toolsets && options.toolsets.length > 0) {
      args.push('--toolsets', options.toolsets.join(','));
    }
    if (options?.provider) {
      args.push('--provider', options.provider);
    }
    if (options?.model) {
      args.push('--model', options.model);
    }

    // Context is appended to the goal as additional lines (no stdin needed)
    const fullQuery = context ? `${goal}\n\nContext:\n${context}` : goal;

    const result = await this.spawnHermes(taskId, fullQuery, args, timeoutMs, startTime);

    // Write result to IPC file
    const resultPath = join(this.resultsDir, `${taskId}.json`);
    try {
      writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf8');
    } catch {
      // Non-fatal: result is still returned
    }

    return result;
  }

  private spawnHermes(
    taskId: string,
    query: string,
    args: string[],
    timeoutMs: number,
    startTime: number
  ): Promise<DelegationResult> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      const proc: ChildProcess = spawn(this.hermesPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      // Query is already passed via -q flag in args — do NOT write to stdin
      // (writing here would interfere with hermes's -q argument parsing)

      if (proc.stdout) {
        proc.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });
      }

      if (proc.stderr) {
        proc.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
      }

      // Timeout handler
      const timer = setTimeout(() => {
        killed = true;
        proc.kill('SIGKILL');
      }, timeoutMs);

      proc.on('close', (code: number | null) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;

        if (killed) {
          resolve({
            success: false,
            taskId,
            output: stdout,
            error: `Task timed out after ${timeoutMs}ms`,
            durationMs,
          });
          return;
        }

        if (code !== 0) {
          resolve({
            success: false,
            taskId,
            output: stdout,
            error: stderr || `Hermes exited with code ${code}`,
            durationMs,
          });
          return;
        }

        resolve({
          success: true,
          taskId,
          output: stdout.trim(),
          durationMs,
        });
      });

      proc.on('error', (err: Error) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        resolve({
          success: false,
          taskId,
          output: '',
          error: `Failed to spawn hermes: ${err.message}`,
          durationMs,
        });
      });
    });
  }

  /**
   * Checks if Hermes is healthy and reachable.
   */
  async isHealthy(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(this.hermesPath, ['--version'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      if (proc.stdout) {
        proc.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });
      }
      if (proc.stderr) {
        proc.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
      }

      proc.on('close', (code: number | null) => {
        resolve(code === 0);
      });

      proc.on('error', () => {
        resolve(false);
      });

      // 5 second health check timeout
      setTimeout(() => {
        proc.kill('SIGKILL');
        resolve(false);
      }, 5000);
    });
  }

  /**
   * Gets the Hermes version string.
   */
  async getVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = spawn(this.hermesPath, ['--version'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      if (proc.stdout) {
        proc.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });
      }
      if (proc.stderr) {
        proc.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
      }

      proc.on('close', (code: number | null) => {
        if (code === 0 && stdout.trim()) {
          resolve(stdout.trim());
        } else if (stderr.trim()) {
          resolve(stderr.trim());
        } else {
          resolve(null);
        }
      });

      proc.on('error', () => {
        resolve(null);
      });

      // 5 second timeout
      setTimeout(() => {
        proc.kill('SIGKILL');
        resolve(null);
      }, 5000);
    });
  }
}

export default HermesDelegationService;
