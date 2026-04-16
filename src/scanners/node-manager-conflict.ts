import type { Scanner, ScanResult } from './types';
import { commandExists, runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'node-manager-conflict',
  name: 'Node 版本管理器冲突检测',
  category: 'toolchain',

  async scan(): Promise<ScanResult> {
    const managers = ['nvm', 'fnm', 'volta', 'asdf', 'mise'].filter(commandExists);
    const nodePath = runCommand('which node 2>/dev/null', 3000).stdout.trim();
    const npmPath = runCommand('which npm 2>/dev/null', 3000).stdout.trim();
    return {
      id: this.id, name: this.name, category: this.category,
      status: managers.length > 1 ? 'warn' : 'pass',
      message: managers.length > 1 ? `检测到多个 Node 版本管理器: ${managers.join(', ')}` : `Node 版本管理器正常${managers.length ? ` (${managers[0]})` : ''}`,
      details: `node: ${nodePath || '(未检测到)'}\nnpm: ${npmPath || '(未检测到)'}`,
    };
  },
};

registerScanner(scanner);
