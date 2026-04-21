import type { Scanner, ScanResult } from './types';
import { commandExists } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'unix-commands',
  name: 'Unix 命令检测',
  category: 'toolchain',

  async scan(): Promise<ScanResult> {
    const commands = ['ls', 'grep', 'curl', 'ssh', 'tar', 'awk', 'sed'];
    const missing = commands.filter(cmd => !commandExists(cmd));
    const available = commands.filter(cmd => !missing.includes(cmd));

    if (missing.length === commands.length) {
      return { id: this.id, name: this.name, category: this.category, status: 'fail', error_type: 'missing', message: '所有常用 Unix 命令均不可用' };
    }
    if (missing.length > 0) {
      return { id: this.id, name: this.name, category: this.category, status: 'warn', error_type: 'missing', message: `缺少命令: ${missing.join(', ')}`, details: `可用: ${available.join(', ')}` };
    }
    return { id: this.id, name: this.name, category: this.category, status: 'pass', message: `所有 Unix 命令可用 (${available.join(', ')})` };
  },
};

registerScanner(scanner);
