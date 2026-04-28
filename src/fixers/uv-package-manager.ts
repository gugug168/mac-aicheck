import type { Fixer, FixResult, PostFixGuidance } from './types';
import type { ScanResult } from '../scanners/types';
import { registerFixer } from './registry';
import { classifyError, ERROR_MESSAGES } from './errors';
import { commandExists, runCommand } from '../executor/index';

const INSTALL_TIMEOUT = 180_000;

const uvFixer: Fixer = {
  id: 'uv-package-manager-fixer',
  name: 'uv 安装',
  risk: 'green',
  scannerIds: ['uv-package-manager'],

  canFix(scanResult: ScanResult): boolean {
    return scanResult.id === 'uv-package-manager' && (scanResult.status === 'warn' || scanResult.status === 'fail');
  },

  async execute(_scanResult: ScanResult, dryRun?: boolean): Promise<FixResult> {
    if (dryRun) {
      return {
        success: true,
        message: '[dry-run] 将尝试通过 Homebrew 或 pip 安装 uv',
        verified: false,
      };
    }

    const attempts: string[] = [];

    if (commandExists('brew')) {
      const brewResult = runCommand('brew list uv >/dev/null 2>&1 && brew upgrade uv || brew install uv', INSTALL_TIMEOUT);
      if (brewResult.exitCode === 0) {
        return {
          success: true,
          message: 'uv 已通过 Homebrew 安装/升级',
          verified: false,
        };
      }
      attempts.push(`Homebrew: ${brewResult.stderr || brewResult.stdout || 'failed'}`);
    }

    if (commandExists('python3')) {
      const pipResult = runCommand('python3 -m pip install --user -U uv', INSTALL_TIMEOUT);
      if (pipResult.exitCode === 0) {
        return {
          success: true,
          message: 'uv 已通过 pip 安装/升级',
          verified: false,
        };
      }
      attempts.push(`pip: ${pipResult.stderr || pipResult.stdout || 'failed'}`);
    }

    const combined = attempts.join('\n') || '未找到可用安装方式';
    const classified = classifyError(1, combined, combined);
    const errMsg = ERROR_MESSAGES[classified.category];
    return {
      success: false,
      message: `uv 安装失败: ${errMsg.title}，${errMsg.suggestion}`,
      verified: false,
      nextSteps: [
        ...attempts,
        '如需手动安装，可运行: brew install uv',
        '或运行: python3 -m pip install --user -U uv',
      ],
    };
  },

  getGuidance(): PostFixGuidance {
    return {
      needsTerminalRestart: true,
      needsReboot: false,
      verifyCommands: ['uv --version'],
      notes: [
        '如果当前终端仍找不到 uv，请重新打开终端让 PATH 生效',
      ],
    };
  },

  getVerificationCommand(): string | string[] {
    return 'uv --version';
  },
};

registerFixer(uvFixer);
