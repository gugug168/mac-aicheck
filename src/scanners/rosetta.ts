import type { Scanner, ScanResult } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'rosetta',
  name: 'Rosetta 2',
  category: 'apple',

  async scan(): Promise<ScanResult> {
    // 检查 Apple Silicon 上是否有 Rosetta 2
    const { exitCode } = runCommand('sysctl -n machdep.cpu.brand_string 2>/dev/null', 3000);
    const cpu = runCommand('sysctl -n machdep.cpu.brand_string', 3000).stdout;
    const isAppleSilicon = cpu.includes('Apple');

    if (!isAppleSilicon) {
      return { id: this.id, name: this.name, category: this.category, status: 'pass',
        message: '非 Apple Silicon，跳过 Rosetta 检测' };
    }

    const { exitCode: rcheck } = runCommand('pkgutil --pkg-info=com.apple.pkg.RosettaUpdateLegacy 2>/dev/null || echo "not installed"', 3000);
    if (rcheck !== 0) {
      return { id: this.id, name: this.name, category: this.category, status: 'warn',
        error_type: 'incompatible',
        message: 'Apple Silicon 但 Rosetta 2 未安装，部分 x86 软件无法运行。安装命令: softwareupdate --install-rosetta' };
    }
    return { id: this.id, name: this.name, category: this.category, status: 'pass',
      message: 'Rosetta 2 已安装' };
  },
};
registerScanner(scanner);
