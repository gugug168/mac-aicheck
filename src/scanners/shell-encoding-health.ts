import type { ScanResult, Scanner } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'shell-encoding-health',
  name: '终端编码兼容检测',
  category: 'permission',
  affectsScore: false,
  defaultEnabled: false,

  async scan(): Promise<ScanResult> {
    const locale = runCommand('locale', 5000).stdout;
    const lang = process.env.LANG || '';
    const lcAll = process.env.LC_ALL || '';
    const utf8 = /utf-?8/i.test(`${lang}\n${lcAll}\n${locale}`);
    return {
      id: this.id, name: this.name, category: this.category,
      status: utf8 ? 'pass' : 'warn',
      error_type: utf8 ? undefined : 'misconfigured',
      message: utf8 ? '终端 locale 使用 UTF-8' : '终端 locale 未明确使用 UTF-8，可能出现中文或 JSON 输出乱码',
      detail: `LANG=${lang || '(未设置)'}\nLC_ALL=${lcAll || '(未设置)'}\n${locale}`,
    };
  },
};

registerScanner(scanner);
