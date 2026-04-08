import type { Scanner, ScannerResult } from './types';
import { commandExists, runCommand } from '../executor/index';
import { registerScanner } from './registry';

const GPU_SUMMARY_COMMAND = "system_profiler SPDisplaysDataType 2>/dev/null | grep -E 'Chipset Model|VRAM'";
const FULL_GPU_COMMAND = 'system_profiler SPDisplaysDataType 2>/dev/null';
const SYSCTL_CPU_COMMAND = 'sysctl machdep.cpu 2>/dev/null';

interface GpuDevice {
  chipset: string;
  bus?: string;
  vram?: string;
}

function parseGpuDevices(output: string): GpuDevice[] {
  const devices: GpuDevice[] = [];
  let current: GpuDevice | null = null;

  for (const line of output.split('\n')) {
    const chipsetMatch = line.match(/Chipset Model:\s*(.+)/);
    if (chipsetMatch) {
      if (current) devices.push(current);
      current = { chipset: chipsetMatch[1].trim() };
      continue;
    }

    if (!current) continue;

    const busMatch = line.match(/Bus:\s*(.+)/);
    if (busMatch) {
      current.bus = busMatch[1].trim();
      continue;
    }

    const vramMatch = line.match(/VRAM(?: \((?:Dynamic, Max|Total)\))?:\s*(.+)/);
    if (vramMatch) {
      current.vram = vramMatch[1].trim();
    }
  }

  if (current) devices.push(current);
  return devices;
}

function parseExternalDisplays(output: string): string[] {
  const displays: string[] = [];
  let inDisplays = false;
  let currentDisplay: string | null = null;
  let currentIsExternal = false;

  const flushCurrent = () => {
    if (currentDisplay && currentIsExternal) {
      displays.push(currentDisplay);
    }
    currentDisplay = null;
    currentIsExternal = false;
  };

  for (const line of output.split('\n')) {
    const trimmed = line.trim();

    if (trimmed === 'Displays:') {
      inDisplays = true;
      flushCurrent();
      continue;
    }

    if (!inDisplays) continue;

    const displayHeaderMatch = line.match(/^\s{8}(.+):\s*$/);
    if (displayHeaderMatch) {
      flushCurrent();
      currentDisplay = displayHeaderMatch[1].trim();
      currentIsExternal = !/built-?in|retina|color lcd|liquid retina|internal/i.test(currentDisplay);
      continue;
    }

    if (!currentDisplay) continue;

    if (/Display Type:\s*External/i.test(line) || /Connection Type:/i.test(line)) {
      currentIsExternal = true;
    }
  }

  flushCurrent();
  return [...new Set(displays)];
}

function isDiscreteGpu(device: GpuDevice): boolean {
  const text = `${device.chipset} ${device.bus ?? ''}`.toLowerCase();
  if (text.includes('apple ') || text.includes('intel')) return false;
  return /amd|nvidia|radeon|geforce/.test(text) || text.includes('pcie') || text.includes('thunderbolt');
}

export async function checkGpu(): Promise<ScannerResult> {
  const details: string[] = [];
  const suggestions = [GPU_SUMMARY_COMMAND];

  const sysctlCpu = runCommand(SYSCTL_CPU_COMMAND, 3000).stdout;
  const profilerOutput = runCommand(FULL_GPU_COMMAND, 8000).stdout;
  const profilerSummary = runCommand(GPU_SUMMARY_COMMAND, 5000).stdout;
  const hasMetalCli = commandExists('metal');

  const cpuBrand = sysctlCpu.match(/machdep\.cpu\.brand_string:\s*(.+)/)?.[1]?.trim() ?? '';
  const gpuDevices = parseGpuDevices(profilerOutput);
  const externalDisplays = parseExternalDisplays(profilerOutput);
  const discreteGpus = gpuDevices.filter(isDiscreteGpu);
  const appleGpu = gpuDevices.find(device => /^Apple\b/i.test(device.chipset));
  const hasUnifiedAppleGpu = Boolean(
    /^Apple\b/i.test(cpuBrand) ||
    appleGpu ||
    (/^arm64$/i.test(runCommand('uname -m', 3000).stdout.trim()) && gpuDevices.length > 0),
  );

  if (cpuBrand) {
    details.push(`CPU: ${cpuBrand}`);
  }

  if (hasUnifiedAppleGpu) {
    details.push(`统一 GPU: ${(appleGpu?.chipset || cpuBrand || 'Apple Silicon').trim()}`);
  }

  if (gpuDevices.length > 0) {
    details.push(
      `GPU 列表: ${gpuDevices.map(device => `${device.chipset}${device.vram ? ` (${device.vram})` : ''}`).join(', ')}`
    );
  }

  if (externalDisplays.length > 0) {
    details.push(`外接显示器: ${externalDisplays.join(', ')}`);
  }

  if (discreteGpus.length > 0) {
    details.push(`独立 GPU: ${discreteGpus.map(device => device.chipset).join(', ')}`);
  }

  if (profilerSummary) {
    details.push(`推荐命令输出:\n${profilerSummary}`);
  }

  details.push(`Metal 命令行工具: ${hasMetalCli ? '已检测到 metal' : '未检测到 metal'}`);

  if (!hasMetalCli) {
    suggestions.push('xcode-select --install');
  }

  if (!cpuBrand && gpuDevices.length === 0 && !profilerSummary) {
    return {
      id: 'gpu-monitor',
      name: 'GPU 检测',
      category: 'system',
      status: 'fail',
      message: '未能读取 GPU 信息',
      details: details.join('\n'),
      suggestions,
    };
  }

  const summaryParts: string[] = [];
  if (hasUnifiedAppleGpu) {
    summaryParts.push(`Apple Silicon 统一 GPU: ${appleGpu?.chipset || cpuBrand || '已检测到'}`);
  } else if (gpuDevices.length > 0) {
    summaryParts.push(`GPU: ${gpuDevices.map(device => device.chipset).join(', ')}`);
  }

  if (externalDisplays.length > 0 && discreteGpus.length > 0) {
    summaryParts.push(`外接显示器已连接，独立 GPU: ${discreteGpus.map(device => device.chipset).join(', ')}`);
  } else if (externalDisplays.length > 0) {
    summaryParts.push(`外接显示器已连接: ${externalDisplays.join(', ')}`);
  }

  return {
    id: 'gpu-monitor',
    name: 'GPU 检测',
    category: 'system',
    status: hasMetalCli ? 'pass' : 'warn',
    message: summaryParts.join('；') || 'GPU 信息已检测',
    details: details.join('\n'),
    suggestions,
  };
}

const scanner: Scanner = {
  id: 'gpu-monitor',
  name: 'GPU 检测',
  category: 'system',
  scan: checkGpu,
};

registerScanner(scanner);
