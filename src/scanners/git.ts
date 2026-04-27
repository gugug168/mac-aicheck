import type { Scanner, ScanResult } from './types';
import { runCommand, commandExists } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'git',
  name: 'Git',
  category: 'toolchain',

  async scan(): Promise<ScanResult> {
    const { stdout, exitCode } = runCommand('git --version', 5000);
    if (exitCode !== 0) {
      return { id: this.id, name: this.name, category: this.category, status: 'fail',
        error_type: 'missing',
        fixCommand: 'xcode-select --install',
        severity: 'high',
        message: 'Git 未安装' };
    }
    const match = stdout.match(/git version (\d+\.\d+\.\d+)/);
    const version = match?.[1] || null;
    const gitPath = runCommand('which git', 3000).stdout.trim() || null;
    if (version) {
      const [major, minor] = version.split('.').map(Number);
      if (major < 2 || (major === 2 && minor < 30)) {
        return { id: this.id, name: this.name, category: this.category, status: 'warn',
          error_type: 'outdated',
          version, path: gitPath,
          fixCommand: 'brew upgrade git',
          severity: 'medium',
          message: `Git ${version} 过旧，建议升级到 2.30+` };
      }
    }
    return { id: this.id, name: this.name, category: this.category, status: 'pass',
      version, path: gitPath,
      message: `Git ${version || 'unknown'}` };
  },
};
registerScanner(scanner);
