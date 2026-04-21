import { existsSync } from 'fs';
import { join } from 'path';
import type { Scanner, ScanResult } from './types';
import { commandExists, runCommand } from '../executor/index';
import { registerScanner } from './registry';
import { getHomeDir } from './config-utils';

const scanner: Scanner = {
  id: 'ccswitch',
  name: 'CCSwitch 检测',
  category: 'ai-tools',

  async scan(): Promise<ScanResult> {
    if (commandExists('ccswitch')) {
      const version = runCommand('ccswitch --version', 8000);
      return {
        id: this.id, name: this.name, category: this.category,
        status: 'pass',
        message: `CCSwitch 已安装${version.stdout ? ` (${version.stdout.trim()})` : ''}`,
      };
    }

    const home = getHomeDir();
    const appCandidates = [
      '/Applications/CC Switch.app',
      join(home, 'Applications', 'CC Switch.app'),
      join(home, '.ccswitch'),
    ];
    if (appCandidates.some(existsSync)) {
      return {
        id: this.id, name: this.name, category: this.category,
        status: 'pass',
        message: 'CCSwitch 图形版或配置目录已存在',
        detail: appCandidates.filter(existsSync).join('\n'),
      };
    }

    return {
      id: this.id, name: this.name, category: this.category,
      status: 'warn',
      error_type: 'missing',
      detail: 'macOS 可优先使用 npm install -g ccswitch；若使用图形版，通常位于 /Applications 或 ~/Applications。',
      suggestions: ['npm install -g ccswitch'],
    };
  },
};

registerScanner(scanner);
