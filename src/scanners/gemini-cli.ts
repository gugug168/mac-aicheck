import type { Scanner, ScanResult } from './types';
import { runCommand, commandExists } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'gemini-cli',
  name: 'Gemini CLI',
  category: 'ai-tools',
  affectsScore: false,

  async scan(): Promise<ScanResult> {
    if (!commandExists('gemini')) {
      return {
        id: this.id, name: this.name, category: this.category,
        status: 'warn',
        message: 'Gemini CLI 未安装。安装: npm install -g @google/gemini-cli',
        error_type: 'missing',
      };
    }
    const ver = runCommand('gemini --version 2>/dev/null || echo "unknown"', 5000);
    return {
      id: this.id, name: this.name, category: this.category,
      status: 'pass',
      message: `Gemini CLI 已安装 (${ver.stdout.trim() || 'unknown'})`,
    };
  },
};
registerScanner(scanner);
