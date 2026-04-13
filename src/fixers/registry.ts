import type { Fixer } from './types';
import type { ScanResult } from '../scanners/types';

// Internal registry storage
const _fixers: Fixer[] = [];

/**
 * Self-registration: Fixers call this on module import (D-10).
 * Mirrors registerScanner() pattern from src/scanners/registry.ts
 */
export function registerFixer(fixer: Fixer): void {
  _fixers.push(fixer);
}

/**
 * Get all registered fixers.
 */
export function getFixers(): Fixer[] {
  return [..._fixers];
}

/**
 * Get fixer by ID.
 */
export function getFixerById(id: string): Fixer | undefined {
  return _fixers.find(f => f.id === id);
}

/**
 * Find fixer that can handle a given scan result (D-02, D-10).
 * Checks both scannerIds match and canFix() returns true.
 */
export function getFixerForScanResult(scanResult: ScanResult): Fixer | undefined {
  return _fixers.find(fixer => fixer.canFix(scanResult));
}

/**
 * Get fixer(s) by scanner ID (derived from fixer.scannerIds).
 */
export function getFixerByScannerId(scannerId: string): Fixer | undefined {
  return _fixers.find(fixer => fixer.scannerIds?.includes(scannerId));
}

/**
 * Clear all registered fixers (for testing).
 */
export function clearFixers(): void {
  _fixers.length = 0;
}
