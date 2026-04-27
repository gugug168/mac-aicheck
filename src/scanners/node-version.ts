import type { Scanner, ScanResult } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'node-version',
  name: 'Node.js',
  category: 'toolchain',

  async scan(): Promise<ScanResult> {
    const { stdout, exitCode } = runCommand('node --version', 5000);
    if (exitCode !== 0) {
      return { id: this.id, name: this.name, category: this.category, status: 'fail',
        error_type: 'missing',
        fixCommand: 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash && nvm install --lts',
        severity: 'high',
        message: 'Node.js 未安装。建议用 nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash' };
    }
    const version = stdout.trim();
    const nodePath = runCommand('which node', 3000).stdout.trim() || null;
    const major = parseInt(version.replace('v', '').split('.')[0]);
    if (major < 18) {
      return { id: this.id, name: this.name, category: this.category, status: 'warn',
        error_type: 'outdated',
        version, path: nodePath,
        fixCommand: 'nvm install --lts',
        severity: 'medium',
        message: `Node.js ${version} 过旧（建议 18+）` };
    }
    return { id: this.id, name: this.name, category: this.category, status: 'pass',
      version, path: nodePath,
      message: `Node.js ${version}` };
  },
};
registerScanner(scanner);
