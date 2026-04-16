import type { Scanner, ScanResult } from './types';
import { commandExists, runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'git-path',
  name: 'Git PATH 完整性检测',
  category: 'toolchain',

  async scan(): Promise<ScanResult> {
    if (!commandExists('git')) {
      return { id: this.id, name: this.name, category: this.category, status: 'fail', message: '未检测到 Git' };
    }

    const gitPath = runCommand('which git', 5000).stdout.trim();
    const missing = ['ssh', 'scp', 'tar', 'awk', 'sed'].filter(cmd => !commandExists(cmd));
    if (missing.length > 0) {
      return {
        id: this.id, name: this.name, category: this.category,
        status: 'fail',
        message: `Git 可用，但常用配套命令缺失: ${missing.join(', ')}`,
        details: `git: ${gitPath}`,
      };
    }

    return {
      id: this.id, name: this.name, category: this.category,
      status: 'pass',
      message: 'Git 与常用 Unix 配套命令可用',
      details: `git: ${gitPath}`,
    };
  },
};

registerScanner(scanner);
