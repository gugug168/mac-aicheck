import type { Scanner, ScanResult } from './types';
import { registerScanner } from './registry';
import { getApplePlatform, hasRosettaInstalled } from './apple-platform';

const scanner: Scanner = {
  id: 'rosetta',
  name: 'Rosetta 2',
  category: 'apple',

  async scan(): Promise<ScanResult> {
    const { isAppleSilicon } = getApplePlatform();

    if (!isAppleSilicon) {
      return { id: this.id, name: this.name, category: this.category, status: 'pass',
        message: '非 Apple Silicon，跳过 Rosetta 检测' };
    }

    if (!hasRosettaInstalled()) {
      return { id: this.id, name: this.name, category: this.category, status: 'warn',
        error_type: 'incompatible',
        message: 'Apple Silicon 但 Rosetta 2 未安装，部分 x86 软件无法运行。安装命令: softwareupdate --install-rosetta',
        fixCommand: 'softwareupdate --install-rosetta' };
    }
    return { id: this.id, name: this.name, category: this.category, status: 'pass',
      message: 'Rosetta 2 已安装' };
  },
};
registerScanner(scanner);
