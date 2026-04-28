import type { Scanner, ScanResult } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';

function normalizeRegistry(registry: string): string {
  return registry.trim().replace(/\/+$/, '').toLowerCase();
}

const scanner: Scanner = {
  id: 'npm-mirror',
  name: 'npm 镜像源',
  category: 'network',

  async scan(): Promise<ScanResult> {
    const { stdout } = runCommand('npm config get registry', 5000);
    const registry = stdout.trim();
    const normalized = normalizeRegistry(registry);

    if (!normalized) {
      return {
        id: this.id,
        name: this.name,
        category: this.category,
        status: 'unknown',
        message: '无法读取 npm registry 配置',
        error_type: 'unknown',
      };
    }

    const isChina = normalized.includes('npmmirror.com') ||
      normalized.includes('taobao.org') ||
      normalized.includes('cnpm');
    const isOfficial = normalized === 'https://registry.npmjs.org';

    if (isOfficial) {
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
