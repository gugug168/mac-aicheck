import type { Scanner, ScanResult } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'ssl-certs',
  name: 'SSL 证书',
  category: 'network',
  affectsScore: false,

  async scan(): Promise<ScanResult> {
    const sites = [
      { name: 'github.com', url: 'https://github.com' },
      { name: 'registry.npmjs.org', url: 'https://registry.npmjs.org' },
    ];

    const checks = sites.map(site => {
      const result = runCommand(
        `curl -s --connect-timeout 5 -o /dev/null -w "%{http_code}" ${site.url} 2>/dev/null || echo "FAIL"`,
        10000,
      );
      const code = result.stdout.trim();
      const ok = code === '200' || code === '301' || code === '302';
      return { ...site, code, ok };
    });

    const failed = checks.filter(item => !item.ok);
    if (failed.length === 0) {
      return {
        id: this.id,
        name: this.name,
        category: this.category,
        status: 'pass',
        message: 'SSL 证书正常（常用 HTTPS 站点握手成功）',
        detail: checks.map(item => `${item.name}: ${item.code}`).join('\n'),
      };
    }

    const status = failed.length === checks.length ? 'fail' : 'warn';
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      status,
      message: `SSL / HTTPS 握手异常: ${failed.map(item => `${item.name}=${item.code}`).join(', ')}`,
      detail: checks.map(item => `${item.name}: ${item.code}`).join('\n'),
      error_type: 'network',
    };
  },
};
registerScanner(scanner);
