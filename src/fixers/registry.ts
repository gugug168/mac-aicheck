import type { Fixer } from './types';
import type { ScanResult } from '../scanners/types';

// Internal registry storage
const _fixers: Fixer[] = [];

// Hardcoded scanner ID → fixer ID mapping (D-09)
// This is the explicit mapping between what scanner failed and which fixer handles it
export const SCANNER_TO_FIXER_MAP: Record<string, string> = {
  // homebrew
  'homebrew': 'homebrew-fixer',
  // git
  'git': 'git-fixer',
  'git-identity-config': 'git-fixer',
  // npm mirror
  'npm-mirror': 'npm-mirror-fixer',
  // rosetta
  'rosetta': 'rosetta-fixer',
  // node version
  'node-version': 'node-version-fixer',
  // python versions
  'python-versions': 'python-versions-fixer',
};

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
  // First check hardcoded mapping
  const mappedFixerId = SCANNER_TO_FIXER_MAP[scanResult.id];
  if (mappedFixerId) {
    const fixer = getFixerById(mappedFixerId);
    if (fixer && fixer.canFix(scanResult)) {
      return fixer;
    }
  }

  // Fallback: scan all fixers and check canFix()
  return _fixers.find(fixer => fixer.canFix(scanResult));
}

/**
 * Get fixer(s) by scanner ID (from hardcoded map).
 */
export function getFixerByScannerId(scannerId: string): Fixer | undefined {
  const fixerId = SCANNER_TO_FIXER_MAP[scannerId];
  if (fixerId) {
    return getFixerById(fixerId);
  }
  return undefined;
}

/**
 * Clear all registered fixers (for testing).
 */
export function clearFixers(): void {
  _fixers.length = 0;
}
