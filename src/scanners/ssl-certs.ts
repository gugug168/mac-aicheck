import type { Scanner, ScanResult } from './types';
import * as https from 'https';
import { registerScanner } from './registry';

function checkHttpsSite(hostname: string, path: string = '/'): Promise<{ code: string; ok: boolean }> {
  return new Promise((resolve) => {
    const req = https.request({ hostname, path, method: 'HEAD', timeout: 5000 }, (res) => {
      const code = String(res.statusCode || 'FAIL');
      const ok = code === '200' || code === '301' || code === '302';
      resolve({ code, ok });
    });
    req.on('error', () => resolve({ code: 'FAIL', ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ code: 'TIMEOUT', ok: false }); });
    req.end();
  });
}

const scanner: Scanner = {
  id: 'ssl-certs',
  name: 'SSL 证书',
  category: 'network',
  affectsScore: false,

  async scan(): Promise<ScanResult> {
    const sites = [
      { name: 'github.com', hostname: 'github.com' },
      { name: 'registry.npmjs.org', hostname: 'registry.npmjs.org' },
    ];

    const checks = await Promise.all(
      sites.map(async (site) => {
        const result = await checkHttpsSite(site.hostname);
        return { name: site.name, ...result };
      })
    );

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
