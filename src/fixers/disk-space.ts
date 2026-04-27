import type { Fixer, FixResult, PostFixGuidance } from './types';
import type { ScanResult } from '../scanners/types';
import { registerFixer } from './registry';
import { runCommand } from '../executor/index';

/**
 * Fixer for low disk space on temp/system volume.
 *
 * Provides guidance for cleaning common macOS caches:
 * - Homebrew cache
 * - npm/pip cache
 * - Xcode DerivedData
 * - System logs
 *
 * This is a yellow-risk fixer: it suggests cleanup commands but
 * lets the user decide what to delete.
 */
const diskSpaceFixer: Fixer = {
  id: 'disk-space-fixer',
  name: '磁盘空间清理',
  risk: 'yellow',
  scannerIds: ['temp-space'],

  canFix(scanResult: ScanResult): boolean {
    return scanResult.id === 'temp-space' && scanResult.status === 'fail';
  },

  async execute(scanResult: ScanResult, dryRun?: boolean): Promise<FixResult> {
    // Analyze what's using space
    const tempDir = process.env.TMPDIR || '/tmp';
    const dfResult = runCommand(`df -Pk "${tempDir}" | tail -n 1`, 5000);
    const parts = (dfResult.stdout || '').trim().split(/\s+/);
    const availableKb = parseInt(parts[3] || '0', 10);
    const freeGb = Math.round(availableKb / 1024 / 1024);

    // Check common cache sizes
    const cacheInfo: string[] = [];
    const cleanCommands: string[] = [];

    // Homebrew cache
    const brewCache = runCommand('du -sh "$(brew --cache 2>/dev/null || echo /dev/null)" 2>/dev/null || true', 5000);
    if (brewCache.stdout && brewCache.stdout.trim() && !brewCache.stdout.includes('/dev/null')) {
      const size = brewCache.stdout.split('\t')[0];
      if (size) {
        cacheInfo.push(`Homebrew 缓存: ${size}`);
        cleanCommands.push('brew cleanup --prune=all');
      }
    }

    // npm cache
    const npmCache = runCommand('du -sh "$(npm config get cache 2>/dev/null || echo /dev/null)" 2>/dev/null || true', 5000);
    if (npmCache.stdout && npmCache.stdout.trim() && !npmCache.stdout.includes('/dev/null')) {
      const size = npmCache.stdout.split('\t')[0];
      if (size) {
        cacheInfo.push(`npm 缓存: ${size}`);
        cleanCommands.push('npm cache clean --force');
      }
    }

    // Xcode DerivedData
    const derivedData = runCommand('du -sh ~/Library/Developer/Xcode/DerivedData 2>/dev/null || true', 5000);
    if (derivedData.stdout && derivedData.stdout.trim()) {
      const size = derivedData.stdout.split('\t')[0];
      if (size) {
        cacheInfo.push(`Xcode DerivedData: ${size}`);
        cleanCommands.push('rm -rf ~/Library/Developer/Xcode/DerivedData/*');
      }
    }

    // System logs (last 7 days)
    const logs = runCommand('du -sh /var/log 2>/dev/null || true', 5000);
    if (logs.stdout && logs.stdout.trim()) {
      const size = logs.stdout.split('\t')[0];
      if (size) {
        cacheInfo.push(`系统日志: ${size}`);
      }
    }

    if (dryRun) {
      return {
        success: true,
        message: `[dry-run] 磁盘剩余 ${freeGb} GB，可清理项:\n${cacheInfo.join('\n')}`,
        verified: false,
        nextSteps: cleanCommands,
      };
    }

    // For safety, just report findings — user decides what to clean
    return {
      success: cacheInfo.length > 0,
      message: cacheInfo.length > 0
        ? `磁盘剩余 ${freeGb} GB，发现以下可清理缓存:\n${cacheInfo.join('\n')}`
        : `磁盘剩余 ${freeGb} GB，未发现明显的可自动清理缓存。请手动检查大文件`,
      verified: false,
      nextSteps: [
        ...cleanCommands.map(cmd => `清理命令: ${cmd}`),
        '查看大文件: sudo du -sh /* | sort -rh | head -20',
        '清理下载文件夹: rm -rf ~/Downloads/*.dmg ~/Downloads/*.pkg',
      ],
    };
  },

  getGuidance(): PostFixGuidance {
    return {
      needsTerminalRestart: false,
      needsReboot: false,
      verifyCommands: ['df -h /'],
      notes: [
        '建议定期清理缓存，保持至少 10 GB 可用空间',
        '可使用 OmniDiskSweeper 或 ncdu 工具可视化磁盘使用',
      ],
    };
  },

  getVerificationCommand(): string {
    return 'df -h /';
  },
};

registerFixer(diskSpaceFixer);
