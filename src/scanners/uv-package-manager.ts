import type { Scanner, ScanResult } from './types';
import { commandExists, runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'uv-package-manager',
  name: 'uv 包管理器检测',
  category: 'toolchain',

  async scan(): Promise<ScanResult> {
    if (!commandExists('uv')) {
      return {
        id: this.id, name: this.name, category: this.category,
        status: 'warn',
        error_type: 'missing',
        suggestions: ['curl -LsSf https://astral.sh/uv/install.sh | sh', 'brew install uv', 'pip install uv'],
      };
    }
    const version = runCommand('uv --version', 5000).stdout.trim();
    return { id: this.id, name: this.name, category: this.category, status: 'pass', message: `uv 已安装 (${version})` };
  },
};

registerScanner(scanner);
