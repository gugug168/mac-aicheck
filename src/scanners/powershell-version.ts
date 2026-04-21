import type { Scanner, ScanResult } from './types';
import { commandExists, runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'powershell-version',
  name: 'PowerShell/macOS Shell 版本检测',
  category: 'toolchain',

  async scan(): Promise<ScanResult> {
    const zshVersion = runCommand('zsh --version', 3000).stdout.trim();
    const bashVersion = runCommand('bash --version', 3000).stdout.split('\n')[0]?.trim() || '';
    if (commandExists('pwsh')) {
      const pwsh = runCommand('pwsh -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"', 8000).stdout.trim();
      return { id: this.id, name: this.name, category: this.category, status: 'pass', message: `PowerShell ${pwsh} 可用`, detail: `zsh: ${zshVersion}\nbash: ${bashVersion}` };
    }
    return { id: this.id, name: this.name, category: this.category, status: 'pass', message: 'macOS 默认 Shell 可用', detail: `zsh: ${zshVersion}\nbash: ${bashVersion}\nPowerShell 不是 macOS AI 开发必需项。` };
  },
};

registerScanner(scanner);
