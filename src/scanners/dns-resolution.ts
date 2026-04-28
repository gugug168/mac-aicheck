import type { Scanner, ScanResult } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'dns-resolution',
  name: 'DNS 解析',
  category: 'network',
  affectsScore: false,

  async scan(): Promise<ScanResult> {
    // 测试与开发环境更相关、且在国内外都更有代表性的域名
    const sites = ['github.com', 'registry.npmjs.org', 'pypi.org'];
    const results: string[] = [];

    const checks = sites.map(async (site) => {
      const t0 = Date.now();
      const { exitCode } = runCommand(`nslookup ${site} 2>/dev/null | head -5`, 5000);
      const ms = Date.now() - t0;
      return `${site}:${exitCode === 0 ? ms + 'ms' : 'FAIL'}`;
    });
    const resolved = await Promise.all(checks);
    results.push(...resolved);

    const failures = results.filter(r => r.includes('FAIL'));
    if (failures.length > 0) {
      const status = failures.length === sites.length ? 'fail' : 'warn';
      return { id: this.id, name: this.name, category: this.category, status,
        error_type: 'network',
        message: `DNS 解析异常: ${failures.join(', ')}`,
        detail: results.join('\n') };
    }

    const avg = results.filter(r => !r.includes('FAIL')).map(r => parseInt(r.split(':')[1])).reduce((a, b) => a + b, 0) / results.filter(r => !r.includes('FAIL')).length;
    return { id: this.id, name: this.name, category: this.category, status: 'pass',
      message: `DNS 解析正常 (avg ${Math.round(avg)}ms)`,
      detail: results.join('\n') };
  },
};
registerScanner(scanner);
