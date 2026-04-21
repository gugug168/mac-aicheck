import type { Scanner, ScanResult } from './types';
import { commandExists, runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'node-global-bin-path',
  name: 'Node 全局 bin 路径检测',
  category: 'toolchain',

  async scan(): Promise<ScanResult> {
    if (!commandExists('npm')) return { id: this.id, name: this.name, category: this.category, status: 'unknown', message: 'npm 不可用，跳过全局 bin 检测' };
    const prefix = runCommand('npm prefix -g', 5000).stdout.trim();
    const bin = runCommand('npm bin -g 2>/dev/null || echo "$(npm prefix -g)/bin"', 5000).stdout.trim();
    const entries = (process.env.PATH || '').split(':');
    const inPath = entries.includes(bin) || entries.includes(prefix);
    return {
      id: this.id, name: this.name, category: this.category,
      status: inPath ? 'pass' : 'warn',
      error_type: inPath ? undefined : 'misconfigured',
      message: inPath ? 'Node 全局 bin 已在 PATH 中' : 'Node 全局 bin 可能未加入 PATH',
      detail: `prefix: ${prefix}\nbin: ${bin}`,
    };
  },
};

registerScanner(scanner);
