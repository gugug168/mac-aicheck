import type { Scanner, ScanResult } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'npm-mirror',
  name: 'npm 镜像源',
  category: 'network',

  async scan(): Promise<ScanResult> {
    const { stdout } = runCommand('npm config get registry', 5000);
    const registry = stdout.trim();
    const isChina = registry.includes('npmmirror.com') ||
                    registry.includes('taobao.org') ||
                    registry.includes('cnpm');
    const isOffical = registry === 'https://registry.npmjs.org/';
    if (isOffical) {
      return { id: this.id, name: this.name, category: this.category, status: 'pass',
        message: 'npm 使用官方源 (registry.npmjs.org)' };
    }
    if (isChina) {
      return { id: this.id, name: this.name, category: this.category, status: 'pass',
        message: `npm 使用国内镜像: ${registry}` };
    }
    return { id: this.id, name: this.name, category: this.category, status: 'warn',
      message: `npm 使用非标准源: ${registry}`,
      error_type: 'misconfigured' };
  },
};
registerScanner(scanner);
