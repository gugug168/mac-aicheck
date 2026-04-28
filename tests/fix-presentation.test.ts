import { describe, expect, it } from 'vitest';
import type { ScanResult } from '../src/scanners/types';
import type { Fixer } from '../src/fixers/types';
import { getFixRiskPresentation, sortIssuesByPriority } from '../src/fixers/presentation';

describe('fix presentation helpers', () => {
  it('maps risk levels to UI labels', () => {
    expect(getFixRiskPresentation({ risk: 'green' } as Fixer).buttonLabel).toBe('立即修复');
    expect(getFixRiskPresentation({ risk: 'yellow' } as Fixer).buttonLabel).toBe('查看并执行');
    expect(getFixRiskPresentation({ risk: 'red' } as Fixer).buttonLabel).toBe('查看指引');
  });

  it('sorts fail items ahead of warn items and actionable fixers ahead of guidance-only ones', () => {
    const results: ScanResult[] = [
      { id: 'warn-red', name: 'Warn Red', category: 'network', status: 'warn', message: '' },
      { id: 'fail-yellow', name: 'Fail Yellow', category: 'toolchain', status: 'fail', message: '' },
      { id: 'fail-green', name: 'Fail Green', category: 'toolchain', status: 'fail', message: '' },
      { id: 'warn-none', name: 'Warn None', category: 'network', status: 'warn', message: '' },
    ];

    const fixers = new Map<string, Fixer>([
      ['warn-red', { id: '1', name: 'red', risk: 'red', canFix: async () => true as any, execute: async () => ({ success: true, message: '', verified: false }) } as unknown as Fixer],
      ['fail-yellow', { id: '2', name: 'yellow', risk: 'yellow', canFix: async () => true as any, execute: async () => ({ success: true, message: '', verified: false }) } as unknown as Fixer],
      ['fail-green', { id: '3', name: 'green', risk: 'green', canFix: async () => true as any, execute: async () => ({ success: true, message: '', verified: false }) } as unknown as Fixer],
    ]);

    const sorted = sortIssuesByPriority(results, item => fixers.get(item.id));
    expect(sorted.map(item => item.id)).toEqual(['fail-green', 'fail-yellow', 'warn-red', 'warn-none']);
  });
});
