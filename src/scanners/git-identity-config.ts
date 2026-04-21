import type { Scanner, ScanResult } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'git-identity',
  name: 'Git 身份配置',
  category: 'toolchain',

  async scan(): Promise<ScanResult> {
    const name = runCommand('git config --global user.name 2>/dev/null || echo ""', 3000).stdout.trim();
    const email = runCommand('git config --global user.email 2>/dev/null || echo ""', 3000).stdout.trim();

    if (!name || !email) {
      return { id: this.id, name: this.name, category: this.category, status: 'warn',
        message: 'Git 全局身份未配置（git config --global user.name/email）',
        error_type: 'misconfigured' };
    }
    return { id: this.id, name: this.name, category: this.category, status: 'pass',
      message: `Git 身份: ${name} <${email}>` };
  },
};
registerScanner(scanner);
