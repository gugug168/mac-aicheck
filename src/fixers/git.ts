import type { Fixer, FixResult, PostFixGuidance } from './types';
import type { ScanResult } from '../scanners/types';
import { registerFixer } from './registry';
import { classifyError, ERROR_MESSAGES } from './errors';
import { runCommand, commandExists } from '../executor/index';

const gitFixer: Fixer = {
  id: 'git-fixer',
  name: 'Git 安装',
  risk: 'green',
  scannerIds: ['git', 'git-identity'],

  canFix(scanResult: ScanResult): boolean {
    return (scanResult.id === 'git' || scanResult.id === 'git-identity')
      && (scanResult.status === 'fail' || scanResult.status === 'warn');
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

    // Handle git identity configuration
    if (scanResult.id === 'git' || scanResult.id === 'git-identity') {
      // Extract name/email from scanResult.message if available
      // Message format: "Git 全局身份未配置（git config --global user.name/email）"
      // Or try to get from environment / ask user

      // For now, attempt to set identity from environment or provide guidance
      // If the fixer is called for git-identity-config, we need user input
      const nameResult = runCommand('git config --global user.name 2>/dev/null || echo ""', 3000);
      const emailResult = runCommand('git config --global user.email 2>/dev/null || echo ""', 3000);
      const currentName = nameResult.stdout.trim();
      const currentEmail = emailResult.stdout.trim();

      if (!currentName || !currentEmail) {
        return {
          success: false,
          message: 'Git 全局身份未配置，请先设置: git config --global user.name "你的名字" 和 git config --global user.email "你的邮箱"',
          verified: false,
        };
      }
    }

    return {
      success: true,
      message: 'Git 安装/配置完成',
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
