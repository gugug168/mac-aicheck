import type { Scanner, ScanResult } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'developer-mode',
  name: '开发者模式',
  category: 'apple',

  async scan(): Promise<ScanResult> {
    const spctl = runCommand('spctl --status', 3000);
    const isEnabled = spctl.stdout.includes('requires authentication') ||
                      spctl.stdout.includes('assessment enabled');
    return {
      id: this.id, name: this.name, category: this.category,
      status: isEnabled ? 'pass' : 'warn',
      message: isEnabled ? '系统完整性保护 (SIP) 已启用，开发者模式需在恢复模式手动开启'
                         : '建议开启开发者模式：sudo nvram boot-args="devmode=1" 或 Recovery Mode 设置',
    };
  },
};
registerScanner(scanner);
