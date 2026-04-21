import type { Scanner, ScanResult } from './types';
import { commandExists, runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'gpu-driver',
  name: 'GPU/Metal 驱动检测',
  category: 'apple',

  async scan(): Promise<ScanResult> {
    const output = runCommand('system_profiler SPDisplaysDataType 2>/dev/null', 10000).stdout;
    const chipsets = [...output.matchAll(/Chipset Model:\s*(.+)/g)].map(match => match[1].trim());
    const metalLines = output.split('\n').filter(line => /Metal/i.test(line.trim()));
    const hasMetalCli = commandExists('metal');

    if (chipsets.length === 0) {
      return { id: this.id, name: this.name, category: this.category, status: 'unknown', message: '无法读取 GPU 信息' };
    }

    const hasMetalSupport = metalLines.some(line => !/unsupported/i.test(line));
    return {
      id: this.id, name: this.name, category: this.category,
      status: hasMetalSupport ? 'pass' : 'warn',
      error_type: hasMetalSupport ? undefined : 'incompatible',
      message: hasMetalSupport ? `Metal 支持正常: ${chipsets.join(', ')}` : `未确认 Metal 支持: ${chipsets.join(', ')}`,
      detail: [`GPU: ${chipsets.join(', ')}`, `metal CLI: ${hasMetalCli ? '可用' : '未检测到'}`, ...metalLines].join('\n'),
      suggestions: hasMetalCli ? undefined : ['xcode-select --install'],
    };
  },
};

registerScanner(scanner);
