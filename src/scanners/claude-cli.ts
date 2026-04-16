import type { Scanner, ScanResult } from './types';
import { commandExists, runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'claude-cli',
  name: 'Claude Code CLI 检测',
  category: 'ai-tools',

  async scan(): Promise<ScanResult> {
    if (!commandExists('claude')) {
      return {
        id: this.id, name: this.name, category: this.category,
        status: 'warn',
        message: 'Claude Code CLI 未安装',
        details: 'Claude Code 是 Anthropic 官方命令行 AI 编程助手。',
        suggestions: ['npm install -g @anthropic-ai/claude-code'],
      };
    }

    const version = runCommand('claude --version', 8000);
    return {
      id: this.id, name: this.name, category: this.category,
      status: 'pass',
      message: `Claude Code 已安装${version.stdout ? ` (${version.stdout.trim()})` : ''}`,
    };
  },
};

registerScanner(scanner);
