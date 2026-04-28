import type { Scanner, ScanResult } from './types';
import { registerScanner } from './registry';
import { getApplePlatform, hasRosettaInstalled } from './apple-platform';

const scanner: Scanner = {
  id: 'apple-silicon',
  name: 'Apple Silicon 检测',
  category: 'apple',
  affectsScore: false,

  async scan(): Promise<ScanResult> {
    const { isAppleSilicon, chip } = getApplePlatform();

    if (!isAppleSilicon) {
      return {
        id: this.id, name: this.name, category: this.category,
        status: 'pass',
        message: 'Intel Mac，无需 Apple Silicon 相关适配',
      };
    }

    return {
      id: this.id, name: this.name, category: this.category,
      status: 'pass',
      message: `Apple Silicon (${chip})`,
      detail: hasRosettaInstalled()
        ? 'Rosetta 2 已安装，可兼容多数 x86 CLI 工具'
        : 'Rosetta 2 未安装。仅在需要运行 x86 CLI 工具时再安装即可',
    };
  },
};
registerScanner(scanner);
