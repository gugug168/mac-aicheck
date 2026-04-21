import type { Scanner, ScanResult } from './types';
import { commandExists, runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'powershell-policy',
  name: 'Shell 脚本执行策略检测',
  category: 'permission',

  async scan(): Promise<ScanResult> {
    const shell = process.env.SHELL || '';
    const pwsh = commandExists('pwsh');
    const zshNoGlobalRcs = runCommand('zsh -f -c "echo ok"', 5000).exitCode === 0;
    return {
      id: this.id, name: this.name, category: this.category,
      status: zshNoGlobalRcs ? 'pass' : 'warn',
      error_type: zshNoGlobalRcs ? undefined : 'misconfigured',
      message: zshNoGlobalRcs ? 'macOS Shell 脚本执行正常' : 'zsh 基础启动异常，可能影响安装脚本',
      details: `SHELL: ${shell || '(未设置)'}\npwsh: ${pwsh ? '已安装' : '未安装，macOS 通常不需要 PowerShell 执行策略'}\nzsh -f: ${zshNoGlobalRcs ? '正常' : '异常'}`,
    };
  },
};

registerScanner(scanner);
