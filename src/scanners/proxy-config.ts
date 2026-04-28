import type { Scanner, ScanResult } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';

function isLikelyProxyValue(value: string): boolean {
  return /^(https?|socks5h?):\/\/\S+$/i.test(value.trim());
}

const scanner: Scanner = {
  id: 'proxy-config',
  name: '代理配置',
  category: 'network',
  affectsScore: false,

  async scan(): Promise<ScanResult> {
    const httpProxy = runCommand('echo $HTTP_PROXY $HTTPS_PROXY $http_proxy $https_proxy | tr " " "\\n" | grep -v "^$" | head -5', 3000).stdout.trim();
    if (!httpProxy) {
      return { id: this.id, name: this.name, category: this.category, status: 'pass',
        message: '未检测到代理配置' };
    }
    const lines = httpProxy.split('\n').filter(Boolean);
    const invalid = lines.filter(line => !isLikelyProxyValue(line));
    if (invalid.length > 0) {
      return { id: this.id, name: this.name, category: this.category, status: 'warn',
        error_type: 'misconfigured',
        message: `检测到可能异常的代理配置: ${invalid.join(', ')}`,
        detail: `当前代理配置:\n${lines.join('\n')}` };
    }
    return { id: this.id, name: this.name, category: this.category, status: 'pass',
      message: `检测到代理配置: ${lines.join(', ')}`,
      detail: lines.join('\n') };
  },
};
registerScanner(scanner);
