import { readdirSync, readFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
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
  private intervalMs: number;
  private lastSeen: Set<string> = new Set();

  constructor(intervalMs = 2000) {
    this.intervalMs = intervalMs;
  }

  start(): void {
    // Ensure directory exists
    if (!existsSync(IPC_DIR)) {
      mkdirSync(IPC_DIR, { recursive: true });
    }
    // Seed lastSeen with existing files
    for (const f of readdirSync(IPC_DIR)) {
      if (f.endsWith('.json')) this.lastSeen.add(f);
    }
    // Poll for new files
    setInterval(() => this.poll(), this.intervalMs);
  }

  private poll(): void {
    try {
      for (const f of readdirSync(IPC_DIR)) {
        if (!f.endsWith('.json') || this.lastSeen.has(f)) continue;
        this.lastSeen.add(f);
        const content = readFileSync(join(IPC_DIR, f), 'utf-8');
        const result = JSON.parse(content) as HermesResult;
        for (const cb of this.callbacks) {
          try { cb(result); } catch { /* noop */ }
        }
      }
    } catch { /* ignore poll errors */ }
  }

  onResult(callback: HermesResultCallback): void {
    this.callbacks.push(callback);
  }

  // Read a specific result (blocking)
  awaitResult(taskId: string, timeoutMs = 120000): Promise<HermesResult | null> {
    return new Promise((resolve) => {
      const filePath = join(IPC_DIR, `${taskId}.json`);
      if (existsSync(filePath)) {
        try {
          resolve(JSON.parse(readFileSync(filePath, 'utf-8')));
        } catch { resolve(null); }
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