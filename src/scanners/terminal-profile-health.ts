import { existsSync, readFileSync } from 'fs';
import type { ScanResult, Scanner } from './types';
import { registerScanner } from './registry';
import { getHomeDir, getTerminalSettingsCandidates } from './config-utils';

const MODERN_SHELL_PATTERNS = [/zsh/i, /fish/i, /nu/i, /bash/i];

const scanner: Scanner = {
  id: 'terminal-profile-health',
  name: 'macOS 终端配置检测',
  category: 'permission',
  affectsScore: false,
  defaultEnabled: false,

  async scan(): Promise<ScanResult> {
    const shell = process.env.SHELL || '';
    const startupFiles = getTerminalSettingsCandidates().filter(existsSync);
    const home = getHomeDir();
    const suspicious: string[] = [];

    for (const file of startupFiles) {
      try {
        const text = readFileSync(file, 'utf-8');
        if (/conda activate base|source .*conda.*activate/i.test(text)) suspicious.push(`${file}: 自动激活 conda`);
        if (/export\s+PATH=.*PATH.*PATH/i.test(text)) suspicious.push(`${file}: PATH 可能重复拼接`);
      } catch {
        suspicious.push(`${file}: 无法读取`);
      }
    }

    const modernShell = MODERN_SHELL_PATTERNS.some(pattern => pattern.test(shell));
    return {
      id: this.id, name: this.name, category: this.category,
      status: suspicious.length ? 'warn' : (modernShell ? 'pass' : 'unknown'),
      error_type: suspicious.length ? 'misconfigured' : undefined,
      message: suspicious.length ? 'Shell 启动配置存在潜在问题' : `默认 Shell 配置正常 (${shell || 'unknown'})`,
      detail: `HOME: ${home}\nSHELL: ${shell || '(未设置)'}\n启动文件:\n${startupFiles.join('\n') || '(未发现)'}${suspicious.length ? `\n\n问题:\n${suspicious.join('\n')}` : ''}`,
    };
  },
};

registerScanner(scanner);
