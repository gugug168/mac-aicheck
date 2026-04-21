import type { Scanner, ScanResult } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';

function parseBytes(value: string): number {
  return parseInt(value.trim(), 10);
}

const scanner: Scanner = {
  id: 'vram-usage',
  name: '统一内存/GPU 内存压力检测',
  category: 'system',

  async scan(): Promise<ScanResult> {
    const vm = runCommand('vm_stat', 5000).stdout;
    const mem = runCommand('sysctl -n hw.memsize', 3000).stdout;
    const totalBytes = parseBytes(mem);
    const pageSize = parseInt(vm.match(/page size of (\d+) bytes/i)?.[1] || '4096', 10);
    const freePages = parseInt(vm.match(/Pages free:\s+(\d+)/)?.[1] || '0', 10);
    const inactivePages = parseInt(vm.match(/Pages inactive:\s+(\d+)/)?.[1] || '0', 10);
    const speculativePages = parseInt(vm.match(/Pages speculative:\s+(\d+)/)?.[1] || '0', 10);
    const availableBytes = (freePages + inactivePages + speculativePages) * pageSize;
    const usedPct = totalBytes > 0 ? Math.round(((totalBytes - availableBytes) / totalBytes) * 100) : 0;
    const gpuInfo = runCommand("system_profiler SPDisplaysDataType 2>/dev/null | grep -E 'Chipset Model|VRAM'", 8000).stdout;

    if (!totalBytes || !vm) {
      return { id: this.id, name: this.name, category: this.category, status: 'unknown', message: '无法读取内存压力信息' };
    }

    return {
      id: this.id, name: this.name, category: this.category,
      status: usedPct > 90 ? 'warn' : 'pass',
      error_type: usedPct > 90 ? 'resource' : undefined,
      message: usedPct > 90 ? `统一内存使用率偏高 (${usedPct}%)，可能影响本地模型推理` : `统一内存压力正常 (${usedPct}%)`,
      details: `总内存: ${Math.round(totalBytes / 1024 ** 3)} GB\n估算可用: ${Math.round(availableBytes / 1024 ** 3)} GB\n${gpuInfo}`,
    };
  },
};

registerScanner(scanner);
