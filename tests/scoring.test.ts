import { describe, it, expect } from 'vitest';
import { calculateScore } from '../src/scanners/index';
import { calculateScore as calculateWeightedScore } from '../src/scoring/calculator';
import type { ScanResult } from '../src/scanners/types';
import '../src/scanners/index';

describe('calculateScore', () => {
  it('returns 0 for empty results', () => {
    expect(calculateScore([])).toBe(0);
  });

  it('returns 100 for all-pass results', () => {
    const results: ScanResult[] = [
      { id: 'a', name: 'A', category: 'toolchain', status: 'pass', message: '' },
      { id: 'b', name: 'B', category: 'toolchain', status: 'pass', message: '' },
    ];
    expect(calculateScore(results)).toBe(100);
  });

  it('returns 60 for warn status', () => {
    const results: ScanResult[] = [
      { id: 'a', name: 'A', category: 'toolchain', status: 'warn', message: '' },
    ];
    expect(calculateScore(results)).toBe(60);
  });

  it('fail contributes 0 and is counted in denominator', () => {
    const results: ScanResult[] = [
      { id: 'a', name: 'A', category: 'toolchain', status: 'pass', message: '' },
      { id: 'b', name: 'B', category: 'toolchain', status: 'fail', message: '' },
    ];
    // pass=100 + fail=0 → 100/2 = 50
    expect(calculateScore(results)).toBe(50);
  });

  it('mixes pass and warn correctly', () => {
    const results: ScanResult[] = [
      { id: 'a', name: 'A', category: 'toolchain', status: 'pass', message: '' },
      { id: 'b', name: 'B', category: 'toolchain', status: 'warn', message: '' },
    ];
    // (100 + 60) / 2 = 80
    expect(calculateScore(results)).toBe(80);
  });

  it('weighted score ignores optional non-scoring scanners', () => {
    const results: ScanResult[] = [
      { id: 'git', name: 'Git', category: 'toolchain', status: 'pass', message: '' },
      { id: 'claude-code', name: 'Claude Code', category: 'ai-tools', status: 'warn', message: 'optional' },
    ];

    expect(calculateWeightedScore(results).score).toBe(100);
  });
});
