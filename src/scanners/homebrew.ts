import type { Scanner, ScanResult } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'homebrew',
  name: 'Homebrew 检测',
  category: 'brew',

  async scan(): Promise<ScanResult> {
    const { stdout, exitCode } = runCommand('brew --version', 5000);
    if (exitCode !== 0) {
      return { id: this.id, name: this.name, category: this.category, status: 'fail',
        error_type: 'missing',
        fixCommand: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
        severity: 'high',
        message: 'Homebrew 未安装，请运行: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"' };
    }
    const match = stdout.match(/Homebrew (\d+\.\d+\.\d+)/);
    const version = match?.[1] || null;
    return { id: this.id, name: this.name, category: this.category, status: 'pass',
      version,
      message: `Homebrew ${version || 'unknown'} 已安装` };
  },
};
registerScanner(scanner);
