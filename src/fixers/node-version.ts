import type { Fixer, FixResult, PostFixGuidance } from './types';
import type { ScanResult } from '../scanners/types';
import { registerFixer } from './registry';
import { classifyError, ERROR_MESSAGES } from './errors';
import { commandExists, runCommand } from '../executor/index';

const NODE_VERSION = '20.10.0';
const NODE_PKG_URL = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}.pkg`;
const DOWNLOAD_TIMEOUT = 60_000;
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

const nodeVersionFixer: Fixer = {
  id: 'node-version-fixer',
  name: 'Node.js LTS 安装',
  risk: 'yellow',

  canFix(scanResult: ScanResult): boolean {
    return scanResult.id === 'node-version' && (scanResult.status === 'fail' || scanResult.status === 'warn');
  },

  async execute(scanResult: ScanResult, dryRun?: boolean): Promise<FixResult> {
    if (dryRun) {
      return { success: true, message: '[dry-run] 将执行 Node.js LTS 安装', verified: false };
    }

    try {
      let brewFailure: string | null = null;
      if (commandExists('brew')) {
        const brewInstall = runCommand('brew list node >/dev/null 2>&1 && brew upgrade node || brew install node', INSTALL_TIMEOUT);
        if (brewInstall.exitCode === 0) {
          return { success: true, message: 'Node.js 已通过 Homebrew 安装/升级', verified: false };
        }
        brewFailure = brewInstall.stderr || brewInstall.stdout || 'Homebrew 安装失败';
      }

      // Download official Node.js LTS .pkg installer (with retry)
      const download = downloadWithRetry(NODE_PKG_URL, '/tmp/node-installer.pkg', DOWNLOAD_TIMEOUT);
      if (download.exitCode !== 0) {
        const classified = classifyError(download.exitCode, download.stderr, 'Node.js 下载失败');
        const errMsg = ERROR_MESSAGES[classified.category];
        const prefix = brewFailure ? `Homebrew 安装失败: ${brewFailure}\n` : '';
        return { success: false, partial: true, message: `${prefix}Node.js 安装失败: ${errMsg.title}，${errMsg.suggestion}`, verified: false };
      }

      // Install via official installer
      const install = runCommand('sudo installer -pkg /tmp/node-installer.pkg -target /', INSTALL_TIMEOUT);
      if (install.exitCode !== 0) {
        const classified = classifyError(install.exitCode, install.stderr, 'Node.js 安装失败');
        const errMsg = ERROR_MESSAGES[classified.category];
        const prefix = brewFailure ? `Homebrew 安装失败: ${brewFailure}\n` : '';
        return { success: false, partial: true, message: `${prefix}Node.js 安装失败: ${errMsg.title}，${errMsg.suggestion}`, verified: false };
      }

      // Clean up
      runCommand('rm -f /tmp/node-installer.pkg', 5000);

      return { success: true, message: 'Node.js LTS 安装成功', verified: false };
    } catch (err: unknown) {
      // Extract meaningful error context from unknown error type
      const errMsg = err instanceof Error ? err.message : String(err);
      const classified = classifyError(1, errMsg, 'Node.js 安装异常');
      const msg = ERROR_MESSAGES[classified.category];
      return { success: false, partial: true, message: `Node.js 安装失败: ${msg.title}，${msg.suggestion}`, verified: false };
    }
  },

  getGuidance(): PostFixGuidance {
    return {
      needsTerminalRestart: true,
      needsReboot: false,
      verifyCommands: ['node --version'],
      notes: ['请关闭当前终端并重新打开以使 Node.js 生效'],
    };
  },

  getVerificationCommand(): string | string[] {
    return 'node --version';
  },
};

registerFixer(nodeVersionFixer);
