import type { Scanner, ScanResult } from './types';
import { runCommand, commandExists } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'claude-code',
  name: 'Claude Code',
  category: 'ai-tools',

  async scan(): Promise<ScanResult> {
    if (!commandExists('claude')) {
      return {
        id: this.id, name: this.name, category: this.category,
        status: 'fail',
        message: 'Claude Code 未安装。安装: brew install --cask claude-code 或 https://claude.com/code',
        error_type: 'missing',
      };
    }
    const ver = runCommand('claude --version 2>/dev/null || echo "unknown"', 5000);
    return {
      id: this.id, name: this.name, category: this.category,
      status: 'pass',
      message: `Claude Code 已安装 (${ver.stdout.trim() || 'unknown'})`,
    };
  },
};
registerScanner(scanner);
