import type { Scanner, ScanResult } from './types';
import { commandExists, runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'cpp-compiler',
  name: 'C/C++ 编译器检测',
  category: 'toolchain',

  async scan(): Promise<ScanResult> {
    if (commandExists('clang')) {
      const version = runCommand('clang --version', 5000).stdout.split('\n')[0] || 'clang';
      return { id: this.id, name: this.name, category: this.category, status: 'pass', message: `Clang 可用 (${version})` };
    }
    if (commandExists('gcc')) {
      const version = runCommand('gcc --version', 5000).stdout.split('\n')[0] || 'gcc';
      return { id: this.id, name: this.name, category: this.category, status: 'pass', message: `GCC 可用 (${version})` };
    }
    return {
      id: this.id, name: this.name, category: this.category,
      status: 'fail',
      error_type: 'missing',
      detail: 'macOS 上建议安装 Xcode Command Line Tools。',
      suggestions: ['xcode-select --install'],
    };
  },
};

registerScanner(scanner);
