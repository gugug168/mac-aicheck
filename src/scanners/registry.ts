import type { Scanner } from './types';

const _scanners: Scanner[] = [];

export const SCANNER_CATEGORIES = ['brew', 'apple', 'toolchain', 'ai-tools', 'network'];

export function registerScanner(scanner: Scanner): void {
  _scanners.push(scanner);
}

export function getScanners(): Scanner[] {
  return [..._scanners];
}

export function getScannerByCategory(category: string): Scanner[] {
  return _scanners.filter(s => s.category === category);
}

export function clearScanners(): void {
  _scanners.length = 0;
}
