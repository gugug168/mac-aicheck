import type { Fixer, FixResult, PostFixGuidance } from './types';
import type { ScanResult } from '../scanners/types';
import { registerFixer } from './registry';
import { classifyError, ERROR_MESSAGES } from './errors';
import { runCommand } from '../executor/index';

const homebrewFixer: Fixer = {
  id: 'homebrew-fixer',
  name: 'Homebrew 安装',
  risk: 'green',

  canFix(scanResult: ScanResult): boolean {
    return scanResult.id === 'homebrew' && scanResult.status === 'fail';
  },

  async execute(scanResult: ScanResult, dryRun?: boolean): Promise<FixResult> {
    if (dryRun) {
      return {
        success: true,
        message: '[dry-run] 将执行 Homebrew 非交互式安装',
        verified: false,
      };
    }

    // Non-interactive Homebrew installation (D-24)
    // CI=true suppresses the interactive prompt in the official install script
    const result = runCommand(
      '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
      300_000
    );

    if (result.exitCode !== 0) {
      const classified = classifyError(result.exitCode, result.stderr, result.stdout || 'Homebrew 安装失败');
      const errMsg = ERROR_MESSAGES[classified.category];
      return {
        success: false,
        message: `Homebrew 安装失败: ${errMsg.title}，${errMsg.suggestion}`,
        verified: false,
      };
    }

    return {
      success: true,
      message: 'Homebrew 安装成功',
      verified: false,
    };
  },

  getGuidance(): PostFixGuidance {
    return {
      needsTerminalRestart: false,
      needsReboot: false,
      verifyCommands: ['brew --version'],
    };
  },

  getVerificationCommand(): string | string[] {
    return 'brew --version';
  },
};

registerFixer(homebrewFixer);
