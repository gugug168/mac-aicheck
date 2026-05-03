import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../src/scanners/index'; // register scanners
import '../src/fixers/index'; // trigger side-effect fixer registrations
import { registerFixer, getFixers, getFixerById, getFixerForScanResult, getFixerByScannerId, clearFixers } from '../src/fixers/registry';
import { determineVerificationStatus } from '../src/fixers/verify';
import type { Fixer, BackupData } from '../src/fixers/types';
import type { ScanResult } from '../src/scanners/types';
import { _test } from '../src/executor/index';

const originalGitName = process.env.MAC_AICHECK_GIT_NAME;
const originalGitEmail = process.env.MAC_AICHECK_GIT_EMAIL;

afterEach(() => {
  _test.mockExecSync = null;
  if (originalGitName === undefined) {
    delete process.env.MAC_AICHECK_GIT_NAME;
  } else {
    process.env.MAC_AICHECK_GIT_NAME = originalGitName;
  }
  if (originalGitEmail === undefined) {
    delete process.env.MAC_AICHECK_GIT_EMAIL;
  } else {
    process.env.MAC_AICHECK_GIT_EMAIL = originalGitEmail;
  }
});

// Tests that depend on pre-registered fixers: do NOT call clearFixers()
describe('fixer registry (pre-registered)', () => {
  it('has pre-registered fixers from import', () => {
    expect(getFixers().length).toBeGreaterThan(0);
  });

  it('getFixerById returns the correct fixer', () => {
    const fixer = getFixerById('homebrew-fixer');
    expect(fixer).toBeDefined();
    expect(fixer?.id).toBe('homebrew-fixer');
  });

  it('getFixerByScannerId returns fixer matching scannerIds', () => {
    // git-fixer handles git installation
    const fixer = getFixerByScannerId('git');
    expect(fixer?.id).toBe('git-fixer');
  });

  it('getFixerForScanResult returns first matching fixer with canFix=true', () => {
    const scanResult: ScanResult = { id: 'git', name: 'Git', category: 'toolchain', status: 'fail', message: '' };
    const fixer = getFixerForScanResult(scanResult);
    expect(fixer).toBeDefined();
    expect(fixer?.id).toBe('git-fixer');
  });

  it('git identity 的 warn 状态会匹配到专用 fixer', () => {
    process.env.MAC_AICHECK_GIT_NAME = 'Test User';
    process.env.MAC_AICHECK_GIT_EMAIL = 'test@example.com';
    _test.mockExecSync = (cmd: string) => {
      if (cmd.includes('which git') || cmd.includes('command -v git')) {
        return Buffer.from('/usr/bin/git\n');
      }
      throw new Error(`unexpected command: ${cmd}`);
    };

    const scanResult: ScanResult = { id: 'git-identity', name: 'Git 身份配置', category: 'toolchain', status: 'warn', message: '' };
    const fixer = getFixerForScanResult(scanResult);
    expect(fixer?.id).toBe('git-identity-fixer');
  });

  it('git identity 在缺少可用身份信息时回退到指导 fixer', () => {
    delete process.env.MAC_AICHECK_GIT_NAME;
    delete process.env.MAC_AICHECK_GIT_EMAIL;
    _test.mockExecSync = (cmd: string) => {
      if (cmd.includes('which git') || cmd.includes('command -v git')) {
        return Buffer.from('/usr/bin/git\n');
      }
      if (cmd.includes('git config --global user.name')) return Buffer.from('');
      if (cmd.includes('git config --global user.email')) return Buffer.from('');
      if (cmd.includes('id -F')) return Buffer.from('');
      if (cmd.includes('whoami')) return Buffer.from('');
      throw new Error(`unexpected command: ${cmd}`);
    };

    const scanResult: ScanResult = { id: 'git-identity', name: 'Git 身份配置', category: 'toolchain', status: 'warn', message: '' };
    const fixer = getFixerForScanResult(scanResult);
    expect(fixer?.id).toBe('git-identity-guidance-fixer');
  });

  it('Claude Code 的 warn 状态会匹配到安装 fixer', () => {
    const scanResult: ScanResult = { id: 'claude-code', name: 'Claude Code', category: 'ai-tools', status: 'warn', message: '' };
    const fixer = getFixerForScanResult(scanResult);
    expect(fixer?.id).toBe('claude-code-fixer');
  });

  it('Git 凭据链路的 warn 状态会匹配到指导 fixer', () => {
    const scanResult: ScanResult = { id: 'git-credential-health', name: 'Git 凭据链路检测', category: 'toolchain', status: 'warn', message: '' };
    const fixer = getFixerForScanResult(scanResult);
    expect(fixer?.id).toBe('git-credential-health-fixer');
  });

  it('验证状态 fail→fail 不再误判为 warn', () => {
    expect(determineVerificationStatus('fail', 'fail')).toBe('fail');
  });

  // Backup/rollback parity tests (TASK-190 Phase B)
  it('npm-mirror fixer has backup and rollback methods', () => {
    const fixer = getFixerById('npm-mirror-fixer');
    expect(fixer).toBeDefined();
    expect(fixer?.backup).toBeDefined();
    expect(typeof fixer?.backup).toBe('function');
    expect(fixer?.rollback).toBeDefined();
    expect(typeof fixer?.rollback).toBe('function');
  });

  it('npm-mirror backup returns BackupData with registry key', async () => {
    _test.mockExecSync = (cmd: string) => {
      if (cmd.includes('npm config get registry')) return Buffer.from('https://registry.npmjs.org/\n');
      return Buffer.from('');
    };
    const fixer = getFixerById('npm-mirror-fixer')!;
    const scanResult: ScanResult = { id: 'npm-mirror', name: 'npm 镜像', category: 'toolchain', status: 'warn', message: '' };
    const backup = await fixer.backup!(scanResult);
    expect(backup.scannerId).toBe('npm-mirror');
    expect(backup.timestamp).toBeGreaterThan(0);
    expect(backup.data.registry).toBeDefined();
    expect(typeof backup.data.registry).toBe('string');
  });

  it('npm-mirror rollback restores old registry', async () => {
    const commands: string[] = [];
    _test.mockExecSync = (cmd: string) => {
      commands.push(cmd);
      if (cmd.includes('npm config get registry')) return Buffer.from('https://registry.npmjs.org/\n');
      return Buffer.from('');
    };
    const fixer = getFixerById('npm-mirror-fixer')!;
    const backup: BackupData = {
      scannerId: 'npm-mirror',
      timestamp: Date.now(),
      data: { registry: 'https://old-registry.example.com/' },
    };
    await fixer.rollback!(backup);
    expect(commands.some(c => c.includes('npm config set registry') && c.includes('old-registry.example.com'))).toBe(true);
  });

  it('git-identity fixer has backup and rollback methods', () => {
    const fixer = getFixerById('git-identity-fixer');
    expect(fixer).toBeDefined();
    expect(fixer?.backup).toBeDefined();
    expect(fixer?.rollback).toBeDefined();
  });

  it('git-identity backup returns BackupData with user.name and user.email', async () => {
    _test.mockExecSync = (cmd: string) => {
      if (cmd.includes('git config --global user.name')) return Buffer.from('Old Name\n');
      if (cmd.includes('git config --global user.email')) return Buffer.from('old@example.com\n');
      return Buffer.from('');
    };
    const fixer = getFixerById('git-identity-fixer')!;
    const scanResult: ScanResult = { id: 'git-identity', name: 'Git 身份', category: 'toolchain', status: 'warn', message: '' };
    const backup = await fixer.backup!(scanResult);
    expect(backup.scannerId).toBe('git-identity');
    expect(backup.data['user.name']).toBeDefined();
    expect(backup.data['user.email']).toBeDefined();
  });

  it('git-identity rollback restores old git config values', async () => {
    const commands: string[] = [];
    _test.mockExecSync = (cmd: string) => {
      commands.push(cmd);
      return Buffer.from('');
    };
    const fixer = getFixerById('git-identity-fixer')!;
    const backup: BackupData = {
      scannerId: 'git-identity',
      timestamp: Date.now(),
      data: { 'user.name': 'Old Name', 'user.email': 'old@example.com' },
    };
    await fixer.rollback!(backup);
    expect(commands.some(c => c.includes('git config --global user.name') && c.includes('Old Name'))).toBe(true);
    expect(commands.some(c => c.includes('git config --global user.email') && c.includes('old@example.com'))).toBe(true);
  });
});

// Tests that modify registry state: use clearFixers()
describe('fixer registry (isolation)', () => {
  beforeEach(() => { clearFixers(); });

  it('registerFixer adds to the registry', () => {
    const before = getFixers().length;
    const fixer: Fixer = {
      id: 'test-fixer',
      name: 'Test Fixer',
      risk: 'green',
      scannerIds: ['test-scanner'],
      canFix: () => false,
      execute: async () => ({ success: false, message: 'not implemented' }),
    };
    registerFixer(fixer);
    expect(getFixers()).toHaveLength(before + 1);
  });

  it('getFixerById returns undefined for unknown id', () => {
    expect(getFixerById('nonexistent')).toBeUndefined();
  });

  it('getFixerForScanResult returns undefined when no fixer canFix', () => {
    const fixer: Fixer = {
      id: 'test-fixer',
      name: 'Test Fixer',
      risk: 'green',
      scannerIds: ['test-scanner'],
      canFix: () => false,
      execute: async () => ({ success: true, message: 'ok' }),
    };
    registerFixer(fixer);
    const result = getFixerForScanResult({ id: 'other-scanner', name: '', category: 'toolchain', status: 'fail', message: '' });
    expect(result).toBeUndefined();
  });

  it('getFixerByScannerId returns undefined when no match', () => {
    const fixer: Fixer = {
      id: 'test-fixer',
      name: 'Test Fixer',
      risk: 'green',
      scannerIds: ['git', 'git-identity-config'],
      canFix: () => false,
      execute: async () => ({ success: true, message: 'ok' }),
    };
    registerFixer(fixer);
    expect(getFixerByScannerId('unknown-scanner')).toBeUndefined();
  });

  it('clearFixers empties the registry and allows re-registration', () => {
    const fixer: Fixer = {
      id: 'test-fixer',
      name: 'Test Fixer',
      risk: 'green',
      scannerIds: ['test-scanner'],
      canFix: () => false,
      execute: async () => ({ success: true, message: 'ok' }),
    };
    registerFixer(fixer);
    expect(getFixers()).toHaveLength(1);
    clearFixers();
    expect(getFixers()).toHaveLength(0);
    // After clear, re-registration should work
    registerFixer(fixer);
    expect(getFixers()).toHaveLength(1);
    expect(getFixers()[0].id).toBe('test-fixer');
  });
});
