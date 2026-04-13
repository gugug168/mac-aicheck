import type { Fixer, FixResult, PostFixGuidance } from './types';
import type { ScanResult } from '../scanners/types';
import { registerFixer } from './registry';
import { classifyError, ERROR_MESSAGES } from './errors';
import { runCommand } from '../executor/index';

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
      // Download official Node.js LTS .pkg installer
      const download = runCommand('curl -fsSL https://nodejs.org/dist/v20.10.0/node-v20.10.0.pkg -o /tmp/node-installer.pkg', 60_000);
      if (download.exitCode !== 0) {
        const classified = classifyError(download.exitCode, download.stderr, 'Node.js 下载失败');
        const errMsg = ERROR_MESSAGES[classified.category];
        return { success: false, partial: true, message: `Node.js 安装失败: ${errMsg.title}，${errMsg.suggestion}`, verified: false };
      }

      // Install via official installer
      const install = runCommand('sudo installer -pkg /tmp/node-installer.pkg -target /', 300_000);
      if (install.exitCode !== 0) {
        const classified = classifyError(install.exitCode, install.stderr, 'Node.js 安装失败');
        const errMsg = ERROR_MESSAGES[classified.category];
        return { success: false, partial: true, message: `Node.js 安装失败: ${errMsg.title}，${errMsg.suggestion}`, verified: false };
      }

      // Clean up
      runCommand('rm -f /tmp/node-installer.pkg', 5000);

      return { success: true, message: 'Node.js LTS 安装成功', verified: false };
    } catch (err: any) {
      const classified = classifyError(1, String(err), 'Node.js 安装异常');
      const errMsg = ERROR_MESSAGES[classified.category];
      return { success: false, partial: true, message: `Node.js 安装失败: ${errMsg.title}，${errMsg.suggestion}`, verified: false };
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