import { getScanners, getScannerByCategory, SCANNER_CATEGORIES } from './registry';
import type { ScanResult } from './types';

// 动态导入所有 scanner 文件，触发 registerScanner
// 不要删除任何 import 行，删了 scanner 就不会被注册
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

export { getScanners, getScannerByCategory, SCANNER_CATEGORIES } from './registry';
export type { ScanResult, Scanner } from './types';

/** 并行扫描所有注册的 scanner */
export async function scanAll(): Promise<ScanResult[]> {
  const scanners = getScanners();
  const results = await Promise.all(scanners.map(s => s.scan()));
  return results;
}

/** 按分类扫描 */
export async function scanCategory(category: string): Promise<ScanResult[]> {
  const scanners = getScannerByCategory(category);
  return Promise.all(scanners.map(s => s.scan()));
}

/** 计算综合评分 0-100 */
export function calculateScore(results: ScanResult[]): number {
  if (results.length === 0) return 0;
  let total = 0;
  for (const r of results) {
    if (r.status === 'pass') total += 100;
    else if (r.status === 'warn') total += 60;
    // fail = 0
  }
  return Math.round(total / results.length);
}
