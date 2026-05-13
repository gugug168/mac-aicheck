/**
 * hermes-ipc.ts
 *
 * Hermes IPC channel for mac-aicheck.
 * Provides bidirectional communication via filesystem:
 * - Hermes writes JSON results to ~/.mac-aicheck/hermes-results/{task_id}.json
 * - HermesResultWatcher monitors the directory and fires callbacks on new results
 */

import { readdirSync, readFileSync, unlinkSync, existsSync, mkdirSync, watch } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface HermesResult {
  taskId: string;
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
  completedAt: string;
}

export type HermesResultCallback = (result: HermesResult) => void;

const IPC_DIR = join(homedir(), '.mac-aicheck', 'hermes-results');

export class HermesResultWatcher {
  private callbacks: HermesResultCallback[] = [];
  private watcher: ReturnType<typeof watch> | null = null;
  private lastSeen: Set<string> = new Set();

  constructor() {
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!existsSync(IPC_DIR)) {
      mkdirSync(IPC_DIR, { recursive: true });
    }
  }

  /**
   * Start watching the results directory for new JSON files.
   * Uses fs.watch for efficient directory monitoring.
   */
  start(): void {
    this.ensureDir();

    // Seed lastSeen with existing files to avoid processing old files
    if (existsSync(IPC_DIR)) {
      for (const f of readdirSync(IPC_DIR)) {
        if (f.endsWith('.json')) this.lastSeen.add(f);
      }
    }

    // Use fs.watch for cross-platform directory monitoring
    try {
      this.watcher = watch(IPC_DIR, { persistent: false }, (eventType, filename) => {
        if (eventType === 'rename' && filename && filename.endsWith('.json')) {
          this.handleNewFile(filename);
        }
      });

      this.watcher.on('error', (err) => {
        // Ignore errors from watcher (e.g., directory deleted)
        console.error('[HermesResultWatcher] Watcher error:', err.message);
      });
    } catch {
      // Fallback to polling if watch fails
      this.startPolling();
    }
  }

  private handleNewFile(filename: string): void {
    if (this.lastSeen.has(filename)) return;
    this.lastSeen.add(filename);

    const filePath = join(IPC_DIR, filename);
    try {
      if (!existsSync(filePath)) return;
      const content = readFileSync(filePath, 'utf-8');
      const result = JSON.parse(content) as HermesResult;

      for (const cb of this.callbacks) {
        try {
          cb(result);
        } catch {
          // Callback error - continue with other callbacks
        }
      }
    } catch {
      // Parse error or read error - ignore
    }
  }

  private startPolling(intervalMs = 2000): void {
    setInterval(() => {
      try {
        for (const f of readdirSync(IPC_DIR)) {
          if (f.endsWith('.json') && !this.lastSeen.has(f)) {
            this.handleNewFile(f);
          }
        }
      } catch {
        // Poll errors - ignore
      }
    }, intervalMs);
  }

  /**
   * Register a callback to be invoked when a new result arrives.
   */
  onResult(callback: HermesResultCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Stop watching for new results.
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Delete a result file to clean up after processing.
   */
  deleteResult(taskId: string): boolean {
    const filePath = join(IPC_DIR, `${taskId}.json`);
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        this.lastSeen.delete(`${taskId}.json`);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Read a specific result file (blocking).
   * Returns null if file doesn't exist or can't be parsed.
   */
  readResult(taskId: string): HermesResult | null {
    const filePath = join(IPC_DIR, `${taskId}.json`);
    try {
      if (!existsSync(filePath)) return null;
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as HermesResult;
    } catch {
      return null;
    }
  }

  /**
   * Wait for a specific result with timeout.
   * Returns null if timeout expires.
   */
  awaitResult(taskId: string, timeoutMs = 120000): Promise<HermesResult | null> {
    return new Promise((resolve) => {
      // Check if already exists
      const existing = this.readResult(taskId);
      if (existing) {
        resolve(existing);
        return;
      }

      const timer = setTimeout(() => resolve(null), timeoutMs);

      this.onResult((r) => {
        if (r.taskId === taskId) {
          clearTimeout(timer);
          resolve(r);
        }
      });

      this.start();
    });
  }
}

/**
 * Write a result to the IPC directory.
 * Called by Hermes after task completion.
 */
export function writeResult(result: HermesResult): string {
  const filePath = join(IPC_DIR, `${result.taskId}.json`);
  try {
    ensureDir(IPC_DIR);
    const content = JSON.stringify(result, null, 2);
    const { writeFileSync } = require('node:fs');
    writeFileSync(filePath, content, 'utf-8');
    return filePath;
  } catch (err) {
    throw new Error(`Failed to write result: ${(err as Error).message}`);
  }
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export default HermesResultWatcher;