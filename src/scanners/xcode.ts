import type { Scanner, ScanResult } from './types';
import { runCommand, commandExists } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'xcode',
  name: 'Xcode Command Line Tools',
  category: 'toolchain',

  async scan(): Promise<ScanResult> {
    // First check: does xcode-select -p succeed?
    const { stdout: pathOutput, exitCode: xcodeExit } = runCommand('xcode-select -p', 3000);
    if (xcodeExit !== 0) {
      return {
        id: this.id, name: this.name, category: this.category, status: 'fail',
        error_type: 'missing',
        fixCommand: 'xcode-select --install',
        severity: 'high',
        message: 'Xcode Command Line Tools 未安装。安装命令: xcode-select --install',
      };
    }
    const xcodePath = pathOutput.trim() || null;
    return {
      id: this.id, name: this.name, category: this.category, status: 'pass',
      path: xcodePath,
      message: `Xcode CLT 已安装: ${xcodePath}`,
    };
  },
};
registerScanner(scanner);
