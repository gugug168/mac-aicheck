import type { Fixer, FixResult, PostFixGuidance } from './types';
import type { ScanResult } from '../scanners/types';
import { registerFixer } from './registry';
import { classifyError, ERROR_MESSAGES } from './errors';
import { runCommand } from '../executor/index';

const xcodeFixer: Fixer = {
  id: 'xcode-fixer',
  name: 'Xcode Command Line Tools 安装',
  risk: 'green',
  scannerIds: ['xcode'],

  canFix(scanResult: ScanResult): boolean {
    return scanResult.id === 'xcode' && scanResult.status === 'fail';
  },

  async execute(scanResult: ScanResult, dryRun?: boolean): Promise<FixResult> {
    if (dryRun) {
      return {
        success: true,
        message: '[dry-run] 将执行 xcode-select --install',
        verified: false,
      };
    }

    // Trigger the install dialog (non-blocking, user confirms in GUI)
    const result = runCommand('xcode-select --install 2>&1 || true', 10_000);
    const output = (result.stdout || '').toLowerCase();

    // xcode-select --install returns immediately with a dialog
    // "already installed" means it's actually fine
    if (output.includes('already installed') || output.includes('command line tools are already')) {
      return {
        success: true,
        message: 'Xcode Command Line Tools 已安装',
        verified: true,
      };
    }

    // Verify installation after dialog
    const verify = runCommand('xcode-select -p', 3000);
    if (verify.exitCode === 0) {
      return {
        success: true,
        message: `Xcode Command Line Tools 安装成功: ${verify.stdout.trim()}`,
        verified: true,
      };
    }

    // If GUI install didn't complete (user may have cancelled), try xcode-select --switch
    const switchResult = runCommand('xcode-select --switch /Library/Developer/CommandLineTools 2>&1 || true', 5000);
    const verifyAgain = runCommand('xcode-select -p', 3000);
    if (verifyAgain.exitCode === 0) {
      return {
        success: true,
        message: `Xcode CLT 路径已修正: ${verifyAgain.stdout.trim()}`,
        verified: true,
      };
    }

    return {
      success: false,
      message: 'Xcode Command Line Tools 安装未完成。请在弹出的对话框中点击"安装"，或手动运行: xcode-select --install',
      verified: false,
      nextSteps: [
        '手动运行: xcode-select --install',
        '在弹出的对话框中点击"安装"',
        '安装完成后重新运行扫描验证',
      ],
    };
  },

  getGuidance(): PostFixGuidance {
    return {
      needsTerminalRestart: false,
      needsReboot: false,
      verifyCommands: ['xcode-select -p'],
      notes: ['如果安装对话框未弹出，请尝试: sudo rm -rf /Library/Developer/CommandLineTools && xcode-select --install'],
    };
  },

  getVerificationCommand(): string {
    return 'xcode-select -p';
  },
};

registerFixer(xcodeFixer);
