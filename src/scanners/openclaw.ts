import type { Scanner, ScanResult } from './types';
import { runCommand, commandExists } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'openclaw',
  name: 'OpenClaw',
  category: 'ai-tools',
  affectsScore: false,

  async scan(): Promise<ScanResult> {
    if (!commandExists('openclaw')) {
      return {
        id: this.id, name: this.name, category: this.category,
        status: 'warn',
        message: 'OpenClaw 未安装。安装: npm install -g openclaw',
        error_type: 'missing',
      };
    }
    const ver = runCommand('openclaw --version 2>/dev/null || echo "unknown"', 5000);
    return {
      id: this.id, name: this.name, category: this.category,
      status: 'pass',
      message: `OpenClaw 已安装 (${ver.stdout.trim() || 'unknown'})`,
    };
  },
};
registerScanner(scanner);
