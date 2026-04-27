import type { Fixer, FixResult, PostFixGuidance } from './types';
import type { ScanResult } from '../scanners/types';
import { registerFixer } from './registry';
import { classifyError, ERROR_MESSAGES } from './errors';
import { runCommand, commandExists } from '../executor/index';

const gitFixer: Fixer = {
  id: 'git-fixer',
  name: 'Git 安装',
  risk: 'green',
  scannerIds: ['git'],

  canFix(scanResult: ScanResult): boolean {
    // Only handle git installation — git-identity requires interactive user input
    // and cannot be auto-fixed without a name/email; the scanner surfaces that
    // separately so the UI can prompt the user directly.
    return scanResult.id === 'git' && scanResult.status === 'fail';
  },

  async execute(scanResult: ScanResult, dryRun?: boolean): Promise<FixResult> {
    if (dryRun) {
      const isGitInstall = scanResult.id === 'git';
      return {
        success: true,
        message: isGitInstall
          ? '[dry-run] 将执行 Git 安装'
          : '[dry-run] 将执行 Git 身份配置',
        verified: false,
      };
    }

    // Handle git installation
    if (scanResult.id === 'git') {
      // Check if brew is available
      if (commandExists('brew')) {
        const result = runCommand('brew install git', 120_000);
        if (result.exitCode !== 0) {
          const classified = classifyError(result.exitCode, result.stderr, result.stdout || 'Git 安装失败');
          const errMsg = ERROR_MESSAGES[classified.category];
          return {
            success: false,
            message: `Git 安装失败: ${errMsg.title}，${errMsg.suggestion}`,
            verified: false,
          };
        }
      } else {
        // Brew not available, try direct installation hint
        return {
          success: false,
          message: 'Git 未安装且 Homebrew 不可用，请先安装 Homebrew 或使用官方安装包',
          verified: false,
        };
      }
    }

    return {
      success: true,
      message: 'Git 安装完成',
      verified: false,
    };
  },

  getGuidance(): PostFixGuidance {
    return {
      needsTerminalRestart: false,
      needsReboot: false,
      verifyCommands: ['git --version'],
    };
  },

  getVerificationCommand(): string | string[] {
    return 'git --version';
  },
};

registerFixer(gitFixer);
