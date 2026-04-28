import { runCommand } from '../executor/index';

const COMMAND_TIMEOUT_MS = 3000;

export function getApplePlatform(): { isAppleSilicon: boolean; chip: string } {
  const arch = runCommand('uname -m', COMMAND_TIMEOUT_MS).stdout.trim();
  const chip = runCommand('sysctl -n machdep.cpu.brand_string 2>/dev/null', COMMAND_TIMEOUT_MS).stdout.trim();

  return {
    isAppleSilicon: arch === 'arm64' || chip.includes('Apple'),
    chip: chip || arch || 'unknown',
  };
}

export function hasRosettaInstalled(): boolean {
  return runCommand(
    'pkgutil --pkg-info=com.apple.pkg.RosettaUpdateLegacy 2>/dev/null',
    COMMAND_TIMEOUT_MS,
  ).exitCode === 0;
}
