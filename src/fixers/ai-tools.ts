import type { Fixer, FixResult, PostFixGuidance } from './types';
import type { ScanResult } from '../scanners/types';
import { registerFixer } from './registry';
import { getInstallerById } from '../installers/index';

interface InstallerBackedFixerConfig {
  fixerId: string;
  scannerId: string;
  name: string;
  verifyCommand: string;
  notes?: string[];
}

function createInstallerBackedFixer(config: InstallerBackedFixerConfig): Fixer {
  return {
    id: config.fixerId,
    name: config.name,
    risk: 'green',
    scannerIds: [config.scannerId],

    canFix(scanResult: ScanResult): boolean {
      return scanResult.id === config.scannerId && (scanResult.status === 'warn' || scanResult.status === 'fail');
    },

    async execute(_scanResult: ScanResult, dryRun?: boolean): Promise<FixResult> {
      if (dryRun) {
        return {
          success: true,
          message: `[dry-run] 将执行 ${config.name} 安装`,
          verified: false,
        };
      }

      const installer = getInstallerById(config.scannerId);
      if (!installer) {
        return {
          success: false,
          message: `未找到 ${config.name} 安装器`,
          verified: false,
        };
      }

      const result = await installer.run(() => {});
      return {
        success: result.success,
        message: result.message,
        verified: false,
      };
    },

    getGuidance(): PostFixGuidance {
      return {
        needsTerminalRestart: true,
        needsReboot: false,
        verifyCommands: [config.verifyCommand],
        notes: config.notes,
      };
    },

    getVerificationCommand(): string | string[] {
      return config.verifyCommand;
    },
  };
}

[
  createInstallerBackedFixer({
    fixerId: 'claude-code-fixer',
    scannerId: 'claude-code',
    name: 'Claude Code 安装',
    verifyCommand: 'claude --version',
    notes: ['首次运行 claude 需要登录 Anthropic 账号或配置 API Key'],
  }),
  createInstallerBackedFixer({
    fixerId: 'openclaw-fixer',
    scannerId: 'openclaw',
    name: 'OpenClaw 安装',
    verifyCommand: 'openclaw --version',
  }),
  createInstallerBackedFixer({
    fixerId: 'gemini-cli-fixer',
    scannerId: 'gemini-cli',
    name: 'Gemini CLI 安装',
    verifyCommand: 'gemini --version',
  }),
  createInstallerBackedFixer({
    fixerId: 'ccswitch-fixer',
    scannerId: 'ccswitch',
    name: 'CCSwitch 安装',
    verifyCommand: 'ccswitch --version',
    notes: ['如果 npm 安装失败，安装器会尝试使用 GitHub 下载备用方案'],
  }),
].forEach(registerFixer);
