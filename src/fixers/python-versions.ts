import type { Fixer, FixResult, PostFixGuidance } from './types';
import type { ScanResult } from '../scanners/types';
import { registerFixer } from './registry';
import { classifyError, ERROR_MESSAGES } from './errors';
import { commandExists, runCommand } from '../executor/index';

const PYTHON_VERSION = '3.12.0';
const PYTHON_PKG_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-macos11.pkg`;
const DOWNLOAD_TIMEOUT = 120_000;
const INSTALL_TIMEOUT = 300_000;
const MAX_RETRIES = 3;

/**
 * Download with retry — attempts up to MAX_RETRIES times on failure.
 */
function downloadWithRetry(url: string, dest: string, timeout: number): { stdout: string; stderr: string; exitCode: number; success: boolean } {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = runCommand(`curl -fsSL "${url}" -o "${dest}"`, timeout);
    if (result.exitCode === 0) {
      return { ...result, success: true };
    }
    if (attempt < MAX_RETRIES) {
      // Wait 2 seconds before retry
      runCommand('sleep 2', 3000);
    }
  }
  // Return the last failure result
  const lastResult = runCommand(`curl -fsSL "${url}" -o "${dest}"`, timeout);
  return { ...lastResult, success: false };
}

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
      let brewFailure: string | null = null;
      if (commandExists('brew')) {
        const brewInstall = runCommand('brew list python@3.12 >/dev/null 2>&1 && brew upgrade python@3.12 || brew install python@3.12', INSTALL_TIMEOUT);
        if (brewInstall.exitCode === 0) {
          return { success: true, message: 'Python 已通过 Homebrew 安装/升级', verified: false };
        }
        brewFailure = brewInstall.stderr || brewInstall.stdout || 'Homebrew 安装失败';
      }

      // Download official Python 3.12 .pkg installer (with retry)
      const download = downloadWithRetry(PYTHON_PKG_URL, '/tmp/python-installer.pkg', DOWNLOAD_TIMEOUT);
      if (download.exitCode !== 0) {
        const classified = classifyError(download.exitCode, download.stderr, 'Python 下载失败');
        const errMsg = ERROR_MESSAGES[classified.category];
        const prefix = brewFailure ? `Homebrew 安装失败: ${brewFailure}\n` : '';
        return { success: false, partial: true, message: `${prefix}Python 安装失败: ${errMsg.title}，${errMsg.suggestion}`, verified: false };
      }

      // Install via official installer
      const install = runCommand('sudo installer -pkg /tmp/python-installer.pkg -target /', INSTALL_TIMEOUT);
      if (install.exitCode !== 0) {
        const classified = classifyError(install.exitCode, install.stderr, 'Python 安装失败');
        const errMsg = ERROR_MESSAGES[classified.category];
        const prefix = brewFailure ? `Homebrew 安装失败: ${brewFailure}\n` : '';
        return { success: false, partial: true, message: `${prefix}Python 安装失败: ${errMsg.title}，${errMsg.suggestion}`, verified: false };
      }

      // Clean up
      runCommand('rm -f /tmp/python-installer.pkg', 5000);

      return { success: true, message: 'Python 3.12 安装成功', verified: false };
    } catch (err: unknown) {
      // Extract meaningful error context from unknown error type
      const errMsg = err instanceof Error ? err.message : String(err);
      const classified = classifyError(1, errMsg, 'Python 安装异常');
      const msg = ERROR_MESSAGES[classified.category];
      return { success: false, partial: true, message: `Python 安装失败: ${msg.title}，${msg.suggestion}`, verified: false };
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
