import { existsSync } from 'fs';
import { join } from 'path';
import type { ScanResult, Scanner } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';
import { getHomeDir } from './config-utils';

const scanner: Scanner = {
  id: 'git-credential-health',
  name: 'Git 凭据链路检测',
  category: 'toolchain',

  async scan(): Promise<ScanResult> {
    const helper = runCommand('git config --global credential.helper', 5000).stdout.trim();
    const sshDir = join(getHomeDir(), '.ssh');
    const keys = ['id_ed25519', 'id_rsa', 'id_ecdsa'].map(name => join(sshDir, name)).filter(existsSync);
    const hasKeychain = /osxkeychain/i.test(helper);

    if (!helper && keys.length === 0) {
      return {
        id: this.id, name: this.name, category: this.category,
        status: 'warn',
        error_type: 'misconfigured',
        details: 'macOS 推荐使用 credential.helper=osxkeychain，或在 ~/.ssh 中配置 SSH Key。',
        suggestions: ['git config --global credential.helper osxkeychain', 'ssh-keygen -t ed25519 -C "you@example.com"'],
      };
    }

    return {
      id: this.id, name: this.name, category: this.category,
      status: hasKeychain || keys.length > 0 ? 'pass' : 'warn',
      message: hasKeychain || keys.length > 0 ? 'Git 凭据链路存在' : 'Git credential helper 已配置，但不是 macOS Keychain',
      details: `credential.helper: ${helper || '(未配置)'}\nSSH Keys: ${keys.length ? keys.join(', ') : '(未检测到)'}`,
    };
  },
};

registerScanner(scanner);
