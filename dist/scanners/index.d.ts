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
export { getScanners, getScannerByCategory, SCANNER_CATEGORIES } from './registry';
export type { ScanResult, Scanner } from './types';
/** 并行扫描所有注册的 scanner */
export declare function scanAll(): Promise<ScanResult[]>;
/** 按分类扫描 */
export declare function scanCategory(category: string): Promise<ScanResult[]>;
/** 计算综合评分 0-100 */
export declare function calculateScore(results: ScanResult[]): number;
