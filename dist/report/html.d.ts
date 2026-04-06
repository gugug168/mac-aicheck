/**
 * HTML 报告生成器
 * 对标 WinAICheck src/report/html.ts
 */
import type { ScanResult } from '../scanners/types';
import type { ScoreResult } from '../scoring/calculator';
export declare function generateHtmlReport(results: ScanResult[], score: ScoreResult): string;
