import type { Scanner, ScanResult } from './types';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'env-path-length',
  name: 'PATH 长度检测',
  category: 'system',

  async scan(): Promise<ScanResult> {
    const pathVar = process.env.PATH || '';
    const entries = pathVar.split(':').filter(Boolean);
    const seen = new Map<string, number>();
    for (const entry of entries) seen.set(entry.replace(/\/$/, ''), (seen.get(entry.replace(/\/$/, '')) || 0) + 1);
    const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
    const warnLength = 8192;

    if (pathVar.length > warnLength || duplicates.length > 0) {
      return {
        id: this.id, name: this.name, category: this.category,
        status: 'warn',
        message: `PATH 偏长或存在重复项 (${pathVar.length} 字符，${entries.length} 个条目)`,
        details: duplicates.length ? `重复项:\n${duplicates.map(([p, c]) => `  ${p} (x${c})`).join('\n')}` : `建议低于 ${warnLength} 字符。`,
      };
    }

    return {
      id: this.id, name: this.name, category: this.category,
      status: 'pass',
      message: `PATH 长度正常 (${pathVar.length} 字符，${entries.length} 个条目)`,
    };
  },
};

registerScanner(scanner);
