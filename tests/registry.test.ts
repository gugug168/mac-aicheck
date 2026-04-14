import { describe, it, expect } from 'vitest';
import '../src/scanners/index'; // trigger side-effect scanner registrations
import { getScanners, getScannerByCategory, clearScanners, registerScanner } from '../src/scanners/registry';
import type { Scanner } from '../src/scanners/types';

describe('scanner registry', () => {
  it('starts with registered scanners from import', () => {
    const scanners = getScanners();
    expect(scanners.length).toBeGreaterThan(0);
  });

  it('registerScanner adds a scanner', () => {
    const before = getScanners().length;
    const scanner: Scanner = {
      id: 'test-scanner',
      name: 'Test Scanner',
      category: 'toolchain',
      async scan() {
        return { id: 'test-scanner', name: 'Test', category: 'toolchain', status: 'pass', message: 'ok' };
      },
    };
    registerScanner(scanner);
    expect(getScanners()).toHaveLength(before + 1);
    expect(getScanners().find(s => s.id === 'test-scanner')).toBeDefined();
  });

  it('getScannerByCategory returns scanners in category', () => {
    const toolchainScanners = getScannerByCategory('toolchain');
    expect(toolchainScanners.length).toBeGreaterThan(0);
    expect(toolchainScanners.every(s => s.category === 'toolchain')).toBe(true);
  });

  it('getScannerByCategory returns empty for unknown category', () => {
    const result = getScannerByCategory('nonexistent-category');
    expect(result).toHaveLength(0);
  });
});
