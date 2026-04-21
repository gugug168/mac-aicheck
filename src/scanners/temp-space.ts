import type { Scanner, ScanResult } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'temp-space',
  name: '临时目录磁盘空间检测',
  category: 'system',

  async scan(): Promise<ScanResult> {
    const tempDir = process.env.TMPDIR || '/tmp';
    const output = runCommand(`df -Pk "${tempDir}" | tail -n 1`, 5000).stdout;
    const parts = output.trim().split(/\s+/);
    const availableKb = parseInt(parts[3] || '0', 10);
    const freeGb = Math.round(availableKb / 1024 / 1024);
    if (!availableKb) return { id: this.id, name: this.name, category: this.category, status: 'unknown', message: '无法读取临时目录剩余空间', detail: `TMPDIR: ${tempDir}` };
    return {
      id: this.id, name: this.name, category: this.category,
      status: freeGb < 10 ? 'fail' : 'pass',
      error_type: freeGb < 10 ? 'resource' : undefined,
      message: freeGb < 10 ? `临时目录所在磁盘空间不足 (${freeGb} GB < 10 GB)` : `临时目录所在磁盘空间充足 (${freeGb} GB)`,
      detail: `TMPDIR: ${tempDir}\n${output}`,
    };
  },
};

registerScanner(scanner);
