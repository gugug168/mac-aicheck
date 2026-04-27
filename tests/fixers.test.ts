import { describe, it, expect, beforeEach } from 'vitest';
import '../src/scanners/index'; // register scanners
import '../src/fixers/index'; // trigger side-effect fixer registrations
import { registerFixer, getFixers, getFixerById, getFixerForScanResult, getFixerByScannerId, clearFixers } from '../src/fixers/registry';
import { determineVerificationStatus } from '../src/fixers/verify';
import type { Fixer } from '../src/fixers/types';
import type { ScanResult } from '../src/scanners/types';

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
    // git-fixer handles 'git' and 'git-identity-config'
    const fixer = getFixerByScannerId('git');
    expect(fixer?.id).toBe('git-fixer');
  });

  it('getFixerForScanResult returns first matching fixer with canFix=true', () => {
    const scanResult: ScanResult = { id: 'git', name: 'Git', category: 'toolchain', status: 'fail', message: '' };
    const fixer = getFixerForScanResult(scanResult);
    expect(fixer).toBeDefined();
    expect(fixer?.id).toBe('git-fixer');
  });

  it('git identity 的 warn 状态不会再误匹配到 fixer', () => {
    const scanResult: ScanResult = { id: 'git-identity', name: 'Git 身份配置', category: 'toolchain', status: 'warn', message: '' };
    const fixer = getFixerForScanResult(scanResult);
    expect(fixer).toBeUndefined();
  });

  it('验证状态 fail→fail 不再误判为 warn', () => {
    expect(determineVerificationStatus('fail', 'fail')).toBe('fail');
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
