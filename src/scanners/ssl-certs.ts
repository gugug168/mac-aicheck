import type { Scanner, ScanResult } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'ssl-certs',
  name: 'SSL 证书',
  category: 'network',

  async scan(): Promise<ScanResult> {
    // Mac: 通过 curl 测试 SSL 握手，检测系统 CA 证书是否正常
    const result = runCommand(
      'curl -s --connect-timeout 5 -o /dev/null -w "%{http_code}" https://github.com 2>/dev/null || echo "FAIL"',
      10000
    );
    const httpCode = result.stdout.trim();
    if (httpCode === '200' || httpCode === '301' || httpCode === '302') {
      return { id: this.id, name: this.name, category: this.category, status: 'pass',
        message: `SSL 证书正常（github.com HTTPS 正常, HTTP ${httpCode}）` };
    }
    return { id: this.id, name: this.name, category: this.category, status: 'fail',
      message: `SSL 证书异常（github.com 返回 ${httpCode}）`,
      error_type: 'network' };
  },
};
registerScanner(scanner);
