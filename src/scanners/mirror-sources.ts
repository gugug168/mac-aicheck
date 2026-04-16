import type { Scanner, ScanResult } from './types';
import { commandExists, runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'mirror-sources',
  name: '镜像源配置检测',
  category: 'network',

  async scan(): Promise<ScanResult> {
    const details: string[] = [];
    if (commandExists('npm')) details.push(`npm: ${runCommand('npm config get registry', 5000).stdout}`);
    if (commandExists('pip')) details.push(`pip: ${runCommand('pip config get global.index-url 2>/dev/null', 5000).stdout || '(默认)'}`);
    if (commandExists('brew')) details.push(`brew: ${runCommand('brew --repo', 5000).stdout}`);
    if (commandExists('uv')) details.push(`uv: ${process.env.UV_DEFAULT_INDEX || process.env.UV_INDEX_URL || '(默认)'}`);

    const text = details.join('\n');
    const usesMirror = /(npmmirror|tuna|aliyun|ustc|sjtu|pku|douban)/i.test(text);
    return {
      id: this.id, name: this.name, category: this.category,
      status: details.length ? 'pass' : 'unknown',
      message: usesMirror ? '检测到国内镜像源配置' : '未检测到显式镜像源配置',
      details: text || 'npm/pip/brew/uv 均不可用，无法检查镜像源。',
    };
  },
};

registerScanner(scanner);
