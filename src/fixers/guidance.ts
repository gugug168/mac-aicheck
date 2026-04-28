import type { Fixer, FixResult, PostFixGuidance } from './types';
import type { ScanResult } from '../scanners/types';
import { registerFixer } from './registry';

interface GuidanceFixerConfig {
  id: string;
  scannerId: string;
  name: string;
  risk?: 'yellow' | 'red';
  message: string;
  nextSteps: string[];
  verifyCommands?: string[];
  notes?: string[];
}

function createGuidanceFixer(config: GuidanceFixerConfig): Fixer {
  return {
    id: config.id,
    name: config.name,
    risk: config.risk || 'red',
    scannerIds: [config.scannerId],

    canFix(scanResult: ScanResult): boolean {
      return scanResult.id === config.scannerId && (scanResult.status === 'warn' || scanResult.status === 'fail');
    },

    async execute(_scanResult: ScanResult, dryRun?: boolean): Promise<FixResult> {
      return {
        success: true,
        message: dryRun ? `[dry-run] ${config.message}` : config.message,
        verified: false,
        nextSteps: [...config.nextSteps],
      };
    },

    getGuidance(): PostFixGuidance {
      return {
        needsTerminalRestart: false,
        needsReboot: false,
        verifyCommands: config.verifyCommands,
        notes: config.notes,
      };
    },

    getVerificationCommand(): string | string[] | undefined {
      if (!config.verifyCommands?.length) return undefined;
      return config.verifyCommands.length === 1 ? config.verifyCommands[0] : config.verifyCommands;
    },
  };
}

[
  createGuidanceFixer({
    id: 'git-identity-guidance-fixer',
    scannerId: 'git-identity',
    name: 'Git 身份配置指引',
    risk: 'yellow',
    message: '缺少可复用的 Git 身份信息，请先提供 name/email 后再配置',
    nextSteps: [
      '设置环境变量 MAC_AICHECK_GIT_NAME 和 MAC_AICHECK_GIT_EMAIL 后重新执行修复',
      '或手动运行: git config --global user.name "Your Name"',
      '或手动运行: git config --global user.email "you@example.com"',
    ],
    verifyCommands: [
      'git config --global user.name',
      'git config --global user.email',
    ],
    notes: [
      '自动修复只会在能够安全推断出 name/email 时执行，避免写入错误身份',
    ],
  }),
  createGuidanceFixer({
    id: 'git-credential-health-fixer',
    scannerId: 'git-credential-health',
    name: 'Git 凭据链路指引',
    risk: 'red',
    message: '请按推荐方式补齐 Git 凭据链路',
    nextSteps: [
      'HTTPS 推荐: git config --global credential.helper osxkeychain',
      'SSH 推荐: ssh-keygen -t ed25519 -C "you@example.com"',
      '将公钥添加到 GitHub/GitLab 后重试 clone / push',
    ],
    verifyCommands: [
      'git config --global credential.helper',
      'ls ~/.ssh',
    ],
  }),
  createGuidanceFixer({
    id: 'admin-perms-fixer',
    scannerId: 'admin-perms',
    name: '管理员权限指引',
    risk: 'red',
    message: '当前用户权限受限，需要管理员协助完成部分系统配置',
    nextSteps: [
      '切换到管理员账号重新执行需要系统权限的修复',
      '或让管理员为当前账号授予 sudo 权限',
      '仅需单次管理员操作时，可由管理员在场执行对应命令',
    ],
    verifyCommands: [
      'groups',
      'sudo -n true && echo sudo_ok || echo sudo_limited',
    ],
  }),
  createGuidanceFixer({
    id: 'proxy-config-fixer',
    scannerId: 'proxy-config',
    name: '代理配置检查指引',
    risk: 'yellow',
    message: '请核对代理环境变量是否指向有效代理地址',
    nextSteps: [
      '查看当前代理: env | grep -i proxy',
      '如需移除当前 shell 代理: unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy',
      '如代理长期失效，请检查 ~/.zshrc ~/.bashrc 或终端配置中的代理导出语句',
    ],
    verifyCommands: [
      'env | grep -i proxy',
    ],
  }),
  createGuidanceFixer({
    id: 'dns-resolution-fixer',
    scannerId: 'dns-resolution',
    name: 'DNS 诊断指引',
    risk: 'red',
    message: 'DNS 解析异常，建议先排查本机 DNS 与网络出口设置',
    nextSteps: [
      '运行: scutil --dns | head -40',
      '尝试切换到稳定 DNS，如 1.1.1.1 或 223.5.5.5',
      '如处于公司网络或代理环境，检查 VPN / 代理是否篡改 DNS',
    ],
    verifyCommands: [
      'nslookup github.com',
      'nslookup registry.npmjs.org',
    ],
  }),
  createGuidanceFixer({
    id: 'ssl-certs-fixer',
    scannerId: 'ssl-certs',
    name: 'SSL 证书诊断指引',
    risk: 'red',
    message: 'HTTPS 握手异常，建议排查系统证书、代理拦截或企业中间人证书',
    nextSteps: [
      '运行: curl -Iv https://github.com',
      '如使用代理或公司网络，确认是否存在 HTTPS 中间人证书拦截',
      '必要时检查系统钥匙串中的自定义根证书或安全软件注入',
    ],
    verifyCommands: [
      'curl -Iv https://github.com',
      'curl -Iv https://registry.npmjs.org',
    ],
  }),
].forEach(registerFixer);
