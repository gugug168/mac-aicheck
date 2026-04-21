import type { Scanner, ScanResult } from './types';
import { commandExists, runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'package-managers',
  name: '包管理器检测',
  category: 'toolchain',

  async scan(): Promise<ScanResult> {
    const managers = ['brew', 'npm', 'pnpm', 'yarn', 'pip', 'pipx', 'uv'].filter(commandExists);
    if (managers.length === 0) {
      return { id: this.id, name: this.name, category: this.category, status: 'fail', message: '未检测到常用包管理器', error_type: 'missing', suggestions: ['安装 Homebrew: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'] };
    }
    const detail = managers.map(cmd => `${cmd}: ${runCommand(`${cmd} --version`, 5000).stdout.split('\n')[0] || '可用'}`).join('\n');
    if (managers.includes('brew')) {
      return { id: this.id, name: this.name, category: this.category, status: 'pass', message: `检测到包管理器: ${managers.join(', ')}`, detail };
    }
    return { id: this.id, name: this.name, category: this.category, status: 'warn', message: `检测到包管理器: ${managers.join(', ')}（缺少 Homebrew）`, detail, error_type: 'missing' };
  },
};

registerScanner(scanner);
