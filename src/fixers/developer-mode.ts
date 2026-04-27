import type { Fixer, FixResult, PostFixGuidance } from './types';
import type { ScanResult } from '../scanners/types';
import { registerFixer } from './registry';
import { runCommand } from '../executor/index';

/**
 * Fixer for macOS Developer Mode (Ventura+).
 *
 * On macOS 13+, Developer Mode can be enabled via:
 * - System Settings → Privacy & Security → Developer Mode (GUI)
 * - `sudo /usr/sbin/DevToolsSecurity -enable` (partial)
 *
 * Full Developer Mode requires a system restart, so this fixer
 * provides yellow-risk guidance rather than auto-executing.
 */
const developerModeFixer: Fixer = {
  id: 'developer-mode-fixer',
  name: '开发者模式启用',
  risk: 'yellow',
  scannerIds: ['developer-mode'],

  canFix(scanResult: ScanResult): boolean {
    return scanResult.id === 'developer-mode' && scanResult.status === 'warn';
  },

  async execute(scanResult: ScanResult, dryRun?: boolean): Promise<FixResult> {
    if (dryRun) {
      return {
        success: true,
        message: '[dry-run] 将尝试启用 DevToolsSecurity',
        verified: false,
      };
    }

    // Try enabling DevToolsSecurity first (doesn't require full Developer Mode)
    const result = runCommand('/usr/sbin/DevToolsSecurity -status', 3000);
    const status = (result.stdout || '').toLowerCase();

    if (status.includes('security policy is not in effect')) {
      // Need to enable
      const enableResult = runCommand('sudo /usr/sbin/DevToolsSecurity -enable 2>&1 || echo "NEED_SUDO"', 5000);
      if ((enableResult.stdout || '').includes('NEED_SUDO')) {
        return {
          success: false,
          message: '需要 sudo 权限启用 DevToolsSecurity',
          verified: false,
          nextSteps: [
            '运行: sudo /usr/sbin/DevToolsSecurity -enable',
            '或在系统设置中启用开发者模式: 系统设置 → 隐私与安全性 → 开发者模式',
          ],
        };
      }
    }

    // Check if Developer Mode is available (macOS 13+)
    const devModeResult = runCommand(
      'systemsetup -getdevelopermode 2>&1 || echo "UNSUPPORTED"',
      3000,
    );
    const devModeOutput = (devModeResult.stdout || '').toLowerCase();

    if (devModeOutput.includes('unsupported') || devModeResult.exitCode !== 0) {
      // Older macOS or restricted environment
      return {
        success: true,
        message: 'DevToolsSecurity 已配置。完整开发者模式需要 macOS 13+ 且在恢复模式中启用',
        verified: false,
        nextSteps: [
          '如需完整开发者模式: 重启进入恢复模式 → 安全策略 → 降低安全性 → 允许用户管理内核扩展',
        ],
      };
    }

    if (devModeOutput.includes('developer mode: off')) {
      return {
        success: false,
        message: '开发者模式未启用，需要系统管理员权限且重启后生效',
        verified: false,
        nextSteps: [
          'GUI方式: 系统设置 → 隐私与安全性 → 开发者模式 → 开启',
          'CLI方式: sudo systemsetup -setdevelopermode on',
          '启用后需要重启电脑',
        ],
      };
    }

    return {
      success: true,
      message: '开发者模式已启用',
      verified: true,
    };
  },

  getGuidance(): PostFixGuidance {
    return {
      needsTerminalRestart: false,
      needsReboot: true,
      verifyCommands: ['/usr/sbin/DevToolsSecurity -status'],
      notes: [
        '完整开发者模式需要重启电脑才能生效',
        '如无法通过 CLI 启用，请在系统设置中操作',
      ],
    };
  },

  getVerificationCommand(): string {
    return '/usr/sbin/DevToolsSecurity -status';
  },
};

registerFixer(developerModeFixer);
