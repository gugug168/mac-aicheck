import { existsSync } from 'fs';
import type { Scanner, ScanResult } from './types';
import { commandExists, runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'wsl-version',
  name: 'Rosetta/虚拟 Linux 环境检测',
  category: 'apple',

  async scan(): Promise<ScanResult> {
    const arch = runCommand('uname -m', 3000).stdout.trim();
    const rosetta = runCommand('pkgutil --pkg-info=com.apple.pkg.RosettaUpdateLegacy 2>/dev/null', 3000).exitCode === 0;
    const linuxTools = [
      commandExists('docker') ? 'Docker' : '',
      commandExists('colima') ? 'Colima' : '',
      commandExists('limactl') ? 'Lima' : '',
      existsSync('/Applications/UTM.app') ? 'UTM' : '',
      existsSync('/Applications/Parallels Desktop.app') ? 'Parallels' : '',
    ].filter(Boolean);

    if (arch !== 'arm64') {
      return { id: this.id, name: this.name, category: this.category, status: 'pass', message: 'Intel Mac，无需 Rosetta 运行 x86_64 工具' };
    }

    return {
      id: this.id, name: this.name, category: this.category,
      status: rosetta || linuxTools.length > 0 ? 'pass' : 'warn',
      message: rosetta ? 'Rosetta 2 已安装，可运行多数 x86_64 macOS CLI' : '未检测到 Rosetta 2 或虚拟 Linux 工具',
      details: `虚拟 Linux 工具: ${linuxTools.length ? linuxTools.join(', ') : '(未检测到)'}`,
      suggestions: rosetta ? undefined : ['softwareupdate --install-rosetta --agree-to-license', 'brew install --cask utm'],
    };
  },
};

registerScanner(scanner);
