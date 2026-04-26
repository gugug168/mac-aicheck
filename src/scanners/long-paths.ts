import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { Scanner, ScanResult } from './types';
import { registerScanner } from './registry';

function scanLongPaths(root: string, limit: number): string[] {
  const found: string[] = [];
  const stack = [root];
  while (stack.length && found.length < 20) {
    const dir = stack.pop()!;
    let entries: string[] = [];
    try { entries = readdirSync(dir); } catch { continue; }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git') continue;
      const full = join(dir, entry);
      if (full.length > limit) found.push(full);
      try { if (statSync(full).isDirectory()) stack.push(full); } catch { /* ignore */ }
      if (found.length >= 20) break;
    }
  }
  return found;
}

const scanner: Scanner = {
  id: 'long-paths',
  name: '长路径检测',
  category: 'system',
  affectsScore: false,
  defaultEnabled: false,

  async scan(): Promise<ScanResult> {
    const warnLimit = 240;
    const found = scanLongPaths(process.cwd(), warnLimit);
    if (found.length > 0) {
      return { id: this.id, name: this.name, category: this.category, status: 'warn', error_type: 'misconfigured', message: `发现 ${found.length} 个较长路径`, detail: found.join('\n') };
    }
    return { id: this.id, name: this.name, category: this.category, status: 'pass', message: `当前项目未发现超过 ${warnLimit} 字符的路径` };
  },
};

registerScanner(scanner);
