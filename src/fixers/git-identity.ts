import type { Fixer, FixResult, PostFixGuidance } from './types';
import type { ScanResult } from '../scanners/types';
import { registerFixer } from './registry';
import { commandExists, runCommand } from '../executor/index';

function escapeShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function firstNonEmpty(values: Array<string | undefined | null>): string | null {
  for (const value of values) {
    const trimmed = String(value || '').trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function readGitConfig(key: 'user.name' | 'user.email'): string | null {
  return firstNonEmpty([
    runCommand(`git config --global ${key} 2>/dev/null || echo ""`, 3000).stdout,
  ]);
}

function resolveGitIdentity(): { name: string | null; email: string | null } {
  const name = firstNonEmpty([
    process.env.MAC_AICHECK_GIT_NAME,
    process.env.GIT_AUTHOR_NAME,
    process.env.GIT_COMMITTER_NAME,
    readGitConfig('user.name'),
    runCommand('id -F 2>/dev/null || echo ""', 3000).stdout,
    runCommand('whoami 2>/dev/null || echo ""', 3000).stdout,
  ]);

  const email = firstNonEmpty([
    process.env.MAC_AICHECK_GIT_EMAIL,
    process.env.GIT_AUTHOR_EMAIL,
    process.env.GIT_COMMITTER_EMAIL,
    process.env.EMAIL,
    readGitConfig('user.email'),
  ]);

  return { name, email };
}

function canAutoConfigureGitIdentity(): boolean {
  const { name, email } = resolveGitIdentity();
  return commandExists('git') && Boolean(name && email);
}

const gitIdentityFixer: Fixer = {
  id: 'git-identity-fixer',
  name: 'Git 身份配置',
  risk: 'yellow',
  scannerIds: ['git-identity'],

  canFix(scanResult: ScanResult): boolean {
    return scanResult.id === 'git-identity'
      && scanResult.status === 'warn'
      && canAutoConfigureGitIdentity();
  },

  async execute(_scanResult: ScanResult, dryRun?: boolean): Promise<FixResult> {
    const { name, email } = resolveGitIdentity();

    if (dryRun) {
      return {
        success: Boolean(name && email),
        message: name && email
          ? `[dry-run] 将配置 Git 身份: ${name} <${email}>`
          : '[dry-run] 需要提供 Git name/email 后才能自动配置',
        verified: false,
        nextSteps: name && email ? undefined : [
          '设置环境变量 MAC_AICHECK_GIT_NAME 和 MAC_AICHECK_GIT_EMAIL 后重试',
          '或手动运行: git config --global user.name "Your Name"',
          '或手动运行: git config --global user.email "you@example.com"',
        ],
      };
    }

    if (!commandExists('git')) {
      return {
        success: false,
        message: 'Git 未安装，请先安装 Git',
        verified: false,
      };
    }

    if (!name || !email) {
      return {
        success: false,
        message: '缺少可用的 Git 用户名或邮箱，无法安全自动配置',
        verified: false,
        nextSteps: [
          '先设置环境变量 MAC_AICHECK_GIT_NAME 和 MAC_AICHECK_GIT_EMAIL 后重试',
          '或手动运行: git config --global user.name "Your Name"',
          '手动运行: git config --global user.email "you@example.com"',
        ],
      };
    }

    const setName = runCommand(`git config --global user.name ${escapeShellArg(name)}`, 5000);
    if (setName.exitCode !== 0) {
      return {
        success: false,
        message: `Git user.name 配置失败: ${setName.stderr || setName.stdout || 'unknown error'}`,
        verified: false,
      };
    }

    const setEmail = runCommand(`git config --global user.email ${escapeShellArg(email)}`, 5000);
    if (setEmail.exitCode !== 0) {
      return {
        success: false,
        message: `Git user.email 配置失败: ${setEmail.stderr || setEmail.stdout || 'unknown error'}`,
        verified: false,
      };
    }

    return {
      success: true,
      message: `Git 身份已配置为 ${name} <${email}>`,
      verified: false,
    };
  },

  getGuidance(): PostFixGuidance {
    return {
      needsTerminalRestart: false,
      needsReboot: false,
      verifyCommands: [
        'git config --global user.name',
        'git config --global user.email',
      ],
      notes: [
        '如果希望使用不同提交身份，可重新运行 git config --global 手动覆盖',
      ],
    };
  },

  getVerificationCommand(): string | string[] {
    return ['git config --global user.name', 'git config --global user.email'];
  },
};

registerFixer(gitIdentityFixer);
