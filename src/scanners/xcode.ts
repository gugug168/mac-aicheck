import type { Scanner, ScanResult } from './types';
import { runCommand, commandExists } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'xcode',
  name: 'Xcode Command Line Tools',
  category: 'toolchain',

  async scan(): Promise<ScanResult> {
    const { exitCode } = runCommand('xcode-select -p 2>/dev/null && devtoolsctl -v 2>/dev/null || echo "not found"', 5000);
    if (exitCode !== 0) {
      return {
        id: this.id, name: this.name, category: this.category, status: 'fail',
        message: 'Xcode Command Line Tools 未安装。安装命令: xcode-select --install',
      };
    }
    const { stdout } = runCommand('xcode-select -p', 3000);
    return {
      id: this.id, name: this.name, category: this.category, status: 'pass',
      message: `Xcode CLT 已安装: ${stdout.trim()}`,
    };
  },
};
registerScanner(scanner);
