import type { Fixer, FixResult, PostFixGuidance } from './types';
import type { ScanResult } from '../scanners/types';
import { registerFixer } from './registry';
import { classifyError, ERROR_MESSAGES } from './errors';
import { runCommand } from '../executor/index';

const rosettaFixer: Fixer = {
  id: 'rosetta-fixer',
  name: 'Rosetta 2 安装',
  risk: 'green',

  canFix(scanResult: ScanResult): boolean {
    return scanResult.id === 'rosetta' && (scanResult.status === 'warn' || scanResult.status === 'fail');
  },

  async execute(scanResult: ScanResult, dryRun?: boolean): Promise<FixResult> {
    if (dryRun) {
      return {
        success: true,
        message: '[dry-run] 将执行 Rosetta 2 安装',
        verified: false,
      };
    }

    // Check if running on Apple Silicon first
    const cpuResult = runCommand('sysctl -n machdep.cpu.brand_string', 3000);
    const isAppleSilicon = cpuResult.stdout.includes('Apple');

    if (!isAppleSilicon) {
      // Not Apple Silicon, Rosetta not needed
      return {
        success: true,
        message: '非 Apple Silicon 设备，Rosetta 2 不需要安装',
        verified: false,
      };
    }

    // Run Rosetta installation with automatic license acceptance (D-25)
    const result = runCommand('softwareupdate --install-rosetta --agree-to-license', 300_000);

    if (result.exitCode !== 0) {
      const classified = classifyError(result.exitCode, result.stderr, result.stdout || 'Rosetta 2 安装失败');
      const errMsg = ERROR_MESSAGES[classified.category];
      return {
        success: false,
        message: `Rosetta 2 安装失败: ${errMsg.title}，${errMsg.suggestion}`,
        verified: false,
      };
    }

    return {
      success: true,
      message: 'Rosetta 2 安装成功，系统可能需要重启',
      verified: false,
    };
  },

  getGuidance(): PostFixGuidance {
    // needsReboot: true because Rosetta is a system-level install (D-33)
    return {
      needsTerminalRestart: false,
      needsReboot: true,
      verifyCommands: ['pkgutil --pkg-info=com.apple.pkg.RosettaUpdateLegacy'],
    };
  },

  getVerificationCommand(): string | string[] {
    return 'pkgutil --pkg-info=com.apple.pkg.RosettaUpdateLegacy';
  },
};

registerFixer(rosettaFixer);
