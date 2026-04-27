import type { Scanner, ScanResult } from './types';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'path-spaces',
  name: '路径空格检测',
  category: 'system',
  affectsScore: false,
  defaultEnabled: false,

  async scan(): Promise<ScanResult> {
    const paths = [process.cwd(), ...(process.env.PATH || '').split(':')].filter(Boolean);
    const withSpaces = paths.filter(value => /\s/.test(value));
    if (withSpaces.length > 0) {
      return { id: this.id, name: this.name, category: this.category, status: 'warn', error_type: 'misconfigured', message: `发现 ${withSpaces.length} 个包含空格的路径`, detail: withSpaces.slice(0, 20).join('\n') };
    }
    return { id: this.id, name: this.name, category: this.category, status: 'pass', message: 'PATH 与当前目录未发现空格路径' };
  },
};

registerScanner(scanner);
