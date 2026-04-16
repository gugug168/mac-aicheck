import type { Scanner, ScanResult } from './types';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'path-chinese',
  name: '路径中文字符检测',
  category: 'system',

  async scan(): Promise<ScanResult> {
    const targets = [process.cwd(), process.env.HOME || '', process.env.SHELL || ''].filter(Boolean);
    const withCjk = targets.filter(value => /[\u4e00-\u9fff]/.test(value));
    if (withCjk.length > 0) {
      return { id: this.id, name: this.name, category: this.category, status: 'warn', message: '关键路径包含中文字符，少数旧工具可能兼容性较差', details: withCjk.join('\n') };
    }
    return { id: this.id, name: this.name, category: this.category, status: 'pass', message: '关键路径未发现中文字符' };
  },
};

registerScanner(scanner);
