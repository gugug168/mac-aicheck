import { runCommand } from '../executor/index';

export interface SystemInfo {
  os: string;
  cpu: string;
  ramGB: number;
  gpu: string;
  diskFreeGB: number;
}

export function collectSystemInfo(): SystemInfo {
  return {
    os: collectOS(),
    cpu: collectCPU(),
    ramGB: collectRAM(),
    gpu: collectGPU(),
    diskFreeGB: collectDiskFree(),
  };
}

function collectOS(): string {
  const product = runCommand('sw_vers -productName', 3000).stdout.trim();
  const version = runCommand('sw_vers -productVersion', 3000).stdout.trim();
  const build = runCommand('sw_vers -buildVersion', 3000).stdout.trim();
  return [product || 'macOS', version, build ? `(${build})` : ''].filter(Boolean).join(' ');
}

function collectCPU(): string {
  return runCommand('sysctl -n machdep.cpu.brand_string', 3000).stdout.trim()
    || runCommand('uname -m', 3000).stdout.trim()
    || '未知';
}

function collectRAM(): number {
  const bytes = parseInt(runCommand('sysctl -n hw.memsize', 3000).stdout.trim(), 10);
  return Number.isNaN(bytes) ? 0 : Math.round(bytes / 1024 ** 3);
}

function collectGPU(): string {
  const output = runCommand("system_profiler SPDisplaysDataType 2>/dev/null | grep 'Chipset Model' | head -n 1", 8000).stdout;
  return output.replace(/.*Chipset Model:\s*/, '').trim() || '未检测到';
}

function collectDiskFree(): number {
  const output = runCommand('df -Pk / | tail -n 1', 5000).stdout.trim();
  const availableKb = parseInt(output.split(/\s+/)[3] || '0', 10);
  return Number.isNaN(availableKb) ? 0 : Math.round(availableKb / 1024 / 1024);
}
