import type { Scanner } from './types';

const _scanners: Scanner[] = [];

function isDefaultEnabled(scanner: Scanner): boolean {
  return scanner.defaultEnabled !== false;
}

export const SCANNER_CATEGORIES = ['brew', 'apple', 'toolchain', 'ai-tools', 'network', 'permission', 'system'];

export function registerScanner(scanner: Scanner): void {
  _scanners.push(scanner);
}

export function getScanners(options?: { includeDefaultDisabled?: boolean }): Scanner[] {
  if (options?.includeDefaultDisabled) return [..._scanners];
  return _scanners.filter(isDefaultEnabled);
}

export function getScannerByCategory(category: string): Scanner[] {
  return getScanners().filter(s => s.category === category);
}

export function getScannerById(id: string): Scanner | undefined {
  return _scanners.find(s => s.id === id);
}

export function clearScanners(): void {
  _scanners.length = 0;
}
