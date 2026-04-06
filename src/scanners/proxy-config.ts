import type { Scanner, ScanResult } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'proxy-config',
  name: '代理配置',
  category: 'network',

  async scan(): Promise<ScanResult> {
    const httpProxy = runCommand('echo $HTTP_PROXY $HTTPS_PROXY $http_proxy $https_proxy | tr " " "\\n" | grep -v "^$" | head -5', 3000).stdout.trim();
    if (!httpProxy) {
      return { id: this.id, name: this.name, category: this.category, status: 'pass',
        message: '未检测到代理配置' };
    }
    const lines = httpProxy.split('\n').filter(Boolean);
    return { id: this.id, name: this.name, category: this.category, status: 'warn',
      message: `检测到代理: ${lines.join(', ')}` };
  },
};
registerScanner(scanner);
