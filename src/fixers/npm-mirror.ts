import type { Fixer, FixResult, PostFixGuidance, BackupData } from './types';
import type { ScanResult } from '../scanners/types';
import { registerFixer } from './registry';
import { classifyError, ERROR_MESSAGES } from './errors';
import { runCommand, commandExists } from '../executor/index';

const npmMirrorFixer: Fixer = {
  id: 'npm-mirror-fixer',
  name: 'npm 镜像配置',
  risk: 'green',

  canFix(scanResult: ScanResult): boolean {
    return scanResult.id === 'npm-mirror' && (scanResult.status === 'warn' || scanResult.status === 'fail');
  },

  async backup(_scanResult: ScanResult): Promise<BackupData> {
    const result = runCommand('npm config get registry 2>/dev/null || echo ""', 5000);
    return {
      scannerId: 'npm-mirror',
      timestamp: Date.now(),
      data: { registry: (result.stdout || '').trim() },
    };
  },

  async rollback(backup: BackupData): Promise<void> {
    const oldRegistry = backup.data.registry;
    if (oldRegistry) {
      runCommand(`npm config set registry ${oldRegistry}`, 5000);
    }
  },

  async execute(scanResult: ScanResult, dryRun?: boolean): Promise<FixResult> {
    if (dryRun) {
      return {
        success: true,
        message: '[dry-run] 将配置 npm 镜像为 npmmirror.com',
        verified: false,
      };
    }

    // Check if npm is installed first
    if (!commandExists('npm')) {
      return {
        success: false,
        message: 'npm 未安装，请先安装 Node.js',
        verified: false,
      };
    }

    // Configure Aliyun mirror (D-29)
    const result = runCommand('npm config set registry https://registry.npmmirror.com', 30_000);

    if (result.exitCode !== 0) {
      // Try fallback to official registry
      const fallback = runCommand('npm config set registry https://registry.npmjs.org', 30_000);
      if (fallback.exitCode !== 0) {
        const classified = classifyError(result.exitCode, result.stderr, result.stdout || 'npm 镜像配置失败');
        const errMsg = ERROR_MESSAGES[classified.category];
        return {
          success: false,
          message: `npm 镜像配置失败: ${errMsg.title}，${errMsg.suggestion}`,
          verified: false,
        };
      }
      return {
        success: false,
        message: 'npmmirror.com 设置失败，已回退到官方源',
        verified: false,
      };
    }

    return {
      success: true,
      message: 'npm 镜像已配置为 npmmirror.com',
      verified: false,
    };
  },

  getGuidance(): PostFixGuidance {
    // needsTerminalRestart: true because PATH changes need new terminal session (D-32)
    return {
      needsTerminalRestart: true,
      needsReboot: false,
      verifyCommands: ['npm --version'],
    };
  },

  getVerificationCommand(): string | string[] {
    return 'npm --version';
  },
};

registerFixer(npmMirrorFixer);
