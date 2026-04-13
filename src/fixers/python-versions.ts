import type { Fixer, FixResult, PostFixGuidance } from './types';
import type { ScanResult } from '../scanners/types';
import { registerFixer } from './registry';
import { classifyError, ERROR_MESSAGES } from './errors';
import { runCommand } from '../executor/index';

const pythonVersionsFixer: Fixer = {
  id: 'python-versions-fixer',
  name: 'Python 3.12 安装',
  risk: 'yellow',

  canFix(scanResult: ScanResult): boolean {
    return scanResult.id === 'python-versions' && (scanResult.status === 'fail' || scanResult.status === 'warn');
  },

  async execute(scanResult: ScanResult, dryRun?: boolean): Promise<FixResult> {
    if (dryRun) {
      return { success: true, message: '[dry-run] 将执行 Python 3.12 安装', verified: false };
    }

    try {
      // Download official Python 3.12 .pkg installer
      const download = runCommand('curl -fsSL https://www.python.org/ftp/python/3.12.0/python-3.12.0-macos11.pkg -o /tmp/python-installer.pkg', 120_000);
      if (download.exitCode !== 0) {
        const classified = classifyError(download.exitCode, download.stderr, 'Python 下载失败');
        const errMsg = ERROR_MESSAGES[classified.category];
        return { success: false, partial: true, message: `Python 安装失败: ${errMsg.title}，${errMsg.suggestion}`, verified: false };
      }

      // Install via official installer
      const install = runCommand('sudo installer -pkg /tmp/python-installer.pkg -target /', 300_000);
      if (install.exitCode !== 0) {
        const classified = classifyError(install.exitCode, install.stderr, 'Python 安装失败');
        const errMsg = ERROR_MESSAGES[classified.category];
        return { success: false, partial: true, message: `Python 安装失败: ${errMsg.title}，${errMsg.suggestion}`, verified: false };
      }

      // Clean up
      runCommand('rm -f /tmp/python-installer.pkg', 5000);

      return { success: true, message: 'Python 3.12 安装成功', verified: false };
    } catch (err: any) {
      const classified = classifyError(1, String(err), 'Python 安装异常');
      const errMsg = ERROR_MESSAGES[classified.category];
      return { success: false, partial: true, message: `Python 安装失败: ${errMsg.title}，${errMsg.suggestion}`, verified: false };
    }
  },

  getGuidance(): PostFixGuidance {
    return {
      needsTerminalRestart: true,
      needsReboot: false,
      verifyCommands: ['python3 --version'],
      notes: ['请关闭当前终端并重新打开以使 Python 生效'],
    };
  },

  getVerificationCommand(): string | string[] {
    return 'python3 --version';
  },
};

registerFixer(pythonVersionsFixer);