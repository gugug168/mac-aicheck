import type { Scanner, ScanResult } from './types';
import { runCommand, commandExists } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'node-manager-conflict',
  name: 'Node 版本管理器冲突',
  category: 'toolchain',

  async scan(): Promise<ScanResult> {
    const hasNvm = commandExists('nvm') || runCommand('ls ~/.nvm 2>/dev/null && echo exists', 3000).stdout.includes('exists');
    const hasFnm = commandExists('fnm') || runCommand('ls ~/.fnm 2>/dev/null && echo exists', 3000).stdout.includes('exists');
    const conflicts: string[] = [];
    if (hasNvm) conflicts.push('nvm');
    if (hasFnm) conflicts.push('fnm');

    if (conflicts.length === 0) {
      return { id: this.id, name: this.name, category: this.category, status: 'pass',
        message: '未检测到 Node 版本管理器冲突' };
    }
    if (conflicts.length === 1) {
      return { id: this.id, name: this.name, category: this.category, status: 'pass',
        message: `${conflicts[0]} 单一版本管理器，无冲突` };
    }
    return { id: this.id, name: this.name, category: this.category, status: 'warn',
      message: `检测到多个 Node 版本管理器: ${conflicts.join(', ')}，可能导致 node/npm 路径混乱，建议保留一个` };
  },
};
registerScanner(scanner);
