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
        message: 'Homebrew 未安装，请运行: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"' };
    }
    const match = stdout.match(/Homebrew (\d+\.\d+\.\d+)/);
    const version = match?.[1] || 'unknown';
    return { id: this.id, name: this.name, category: this.category, status: 'pass',
      message: `Homebrew ${version} 已安装` };
  },
};
registerScanner(scanner);
