import type { Scanner, ScanResult } from './types';
import { commandExists, runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'cuda-version',
  name: 'Apple GPU/MPS 检测',
  category: 'apple',

  async scan(): Promise<ScanResult> {
    const cpu = runCommand('sysctl -n machdep.cpu.brand_string', 3000).stdout.trim();
    const arch = runCommand('uname -m', 3000).stdout.trim();
    const profiler = runCommand("system_profiler SPDisplaysDataType 2>/dev/null | grep -E 'Chipset Model|Metal|VRAM'", 8000).stdout;
    const metal = commandExists('metal');
    const pythonMps = runCommand('python3 -c "import torch; print(torch.backends.mps.is_available())" 2>/dev/null', 8000);
    const mpsAvailable = /^true$/i.test(pythonMps.stdout.trim());

    if (/Apple/i.test(cpu) || arch === 'arm64') {
      return {
        id: this.id, name: this.name, category: this.category,
        status: metal || mpsAvailable ? 'pass' : 'warn',
        error_type: 'incompatible',
        message: metal || mpsAvailable ? 'Apple GPU / Metal 环境可用' : 'Apple Silicon 已检测到，但未确认 Metal CLI 或 PyTorch MPS',
        details: `CPU: ${cpu || arch}\nMPS: ${mpsAvailable ? 'PyTorch MPS 可用' : '未确认'}\n${profiler}`,
        suggestions: metal ? undefined : ['xcode-select --install'],
      };
    }

    return {
      id: this.id, name: this.name, category: this.category,
      status: 'unknown',
      message: '未检测到 Apple Silicon 统一 GPU',
      details: profiler || 'Intel Mac 可使用 CPU、外接 GPU 或远程 GPU；CUDA 不属于 macOS 原生 AI 加速路径。',
    };
  },
};

registerScanner(scanner);
