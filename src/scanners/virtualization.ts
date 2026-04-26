import { existsSync } from 'fs';
import type { Scanner, ScanResult } from './types';
import { commandExists, runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'virtualization',
  name: '虚拟化支持检测',
  category: 'apple',
  affectsScore: false,
  defaultEnabled: false,

  async scan(): Promise<ScanResult> {
    const cpuFeatures = runCommand('sysctl -n machdep.cpu.features 2>/dev/null', 3000).stdout;
    const isAppleSilicon = /Apple/i.test(runCommand('sysctl -n machdep.cpu.brand_string', 3000).stdout);
    const hasHypervisor = isAppleSilicon || /\bVMX\b/.test(cpuFeatures);
    const tools = [
      commandExists('prlctl') ? 'Parallels CLI' : '',
      commandExists('utmctl') ? 'UTM CLI' : '',
      commandExists('docker') ? 'Docker' : '',
      existsSync('/Applications/Parallels Desktop.app') ? 'Parallels Desktop.app' : '',
      existsSync('/Applications/UTM.app') ? 'UTM.app' : '',
    ].filter(Boolean);

    if (!hasHypervisor) {
      return { id: this.id, name: this.name, category: this.category, status: 'warn', error_type: 'incompatible', message: '未确认硬件虚拟化支持', detail: `CPU features: ${cpuFeatures || '(无)'}` };
    }

    return {
      id: this.id, name: this.name, category: this.category,
      status: 'pass',
      message: tools.length ? `虚拟化可用，已检测到 ${tools.join(', ')}` : '硬件虚拟化能力可用',
      detail: isAppleSilicon ? 'Apple Silicon 支持 Virtualization.framework；可使用 UTM、Docker Desktop 或 Parallels。' : `CPU features: ${cpuFeatures}`,
    };
  },
};

registerScanner(scanner);
