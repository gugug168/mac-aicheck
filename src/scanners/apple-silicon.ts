import type { Scanner, ScanResult } from './types';
import { runCommand, commandExists } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'apple-silicon',
  name: 'Apple Silicon 检测',
  category: 'apple',

  async scan(): Promise<ScanResult> {
    const uname = runCommand('uname -m', 3000);
    const isArm = uname.stdout.trim() === 'arm64';

    if (!isArm) {
      return {
        id: this.id, name: this.name, category: this.category,
        status: 'pass',
        message: 'Intel Mac，无需 Apple Silicon 相关适配',
      };
    }

    const sysctl = runCommand('sysctl -n machdep.cpu.brand_string', 3000);
    const chip = sysctl.stdout.trim();
    const hasRosetta = commandExists('rosetta');

    return {
      id: this.id, name: this.name, category: this.category,
      status: hasRosetta ? 'pass' : 'warn',
      message: hasRosetta
        ? `Apple Silicon (${chip}) + Rosetta 2 已安装`
        : `Apple Silicon (${chip})，建议安装 Rosetta 2`,
    };
  },
};
registerScanner(scanner);
