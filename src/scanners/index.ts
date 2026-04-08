import { getScanners, getScannerByCategory, SCANNER_CATEGORIES } from './registry';
import type { ScanResult } from './types';

import './git';
import './node-version';
import './node-manager';
import './python-versions';
import './npm-mirror';
import './proxy-config';
import './apple-silicon';
import './homebrew';
import './developer-mode';
import './screen-permission';
import './claude-code';
import './gemini-cli';
import './openclaw';
import './xcode';
import './rosetta';
import './ssl-certs';
import './dns-resolution';
import './git-identity-config';
import './admin-perms';
import './gpu-monitor';

export { getScanners, getScannerByCategory, SCANNER_CATEGORIES } from './registry';
export { checkGpu } from './gpu-monitor';
export type { ScanResult, Scanner, ScannerResult } from './types';

export async function scanAll(): Promise<ScanResult[]> {
  const scanners = getScanners();
  const results = await Promise.all(scanners.map(s => s.scan()));
  return results;
}

export async function scanCategory(category: string): Promise<ScanResult[]> {
  const scanners = getScannerByCategory(category);
  return Promise.all(scanners.map(s => s.scan()));
}

export function calculateScore(results: ScanResult[]): number {
  if (results.length === 0) return 0;
  let total = 0;
  for (const r of results) {
    if (r.status === 'pass') total += 100;
    else if (r.status === 'warn') total += 60;
  }
  return Math.round(total / results.length);
}
