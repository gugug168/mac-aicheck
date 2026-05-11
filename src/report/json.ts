/**
 * JSON 报告生成器
 * 对标 WinAICheck src/report/json.ts
 */

import type { ScanResult } from '../scanners/types';
import type { ScoreResult } from '../scoring/calculator';
import type { FixerExecutionResult } from '../fixers/orchestrator';
import { sanitize } from '../api/aicoevo-client';

export interface JsonReport {
  version: string;
  timestamp: string;
  score: ScoreResult;
  results: ScanResult[];
  fixerResults?: FixerExecutionResult[];
  executionMode?: 'sequential' | 'parallel';
  metadata: ReportMetadata;
}

export interface SanitizedScanResult extends Omit<ScanResult, 'message' | 'detail'> {
  message: string;
  detail?: string;
}

/** 从 package.json 读取版本 */
function getPackageVersion(): string {
  try {
    const { existsSync, readFileSync } = require('fs');
    const { join } = require('path');
    const pkgPath = join(__dirname, '../../package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
      return pkg.version || '0.0.0';
    }
    return '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export interface ReportMetadata {
  totalScanners: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  unknownCount: number;
  generatedAt: string;
  generator: string;
}

export interface GenerateJsonOptions {
  sanitize?: boolean;
  fixerResults?: FixerExecutionResult[];
  executionMode?: 'sequential' | 'parallel';
}

/**
 * 生成 JSON 报告
 * @param results 扫描结果
 * @param score 评分结果
 * @param options 选项
 */
export function generateJsonReport(
  results: ScanResult[],
  score: ScoreResult,
  options: GenerateJsonOptions = {},
): string {
  const { sanitize: shouldSanitize = true, fixerResults, executionMode } = options;
  const version = getPackageVersion();

  const sanitizedResults: SanitizedScanResult[] = results.map(r => {
    const message = shouldSanitize ? sanitize(r.message) : r.message;
    const detail = r.detail ? (shouldSanitize ? sanitize(r.detail) : r.detail) : undefined;
    return {
      ...r,
      message,
      detail,
    };
  });

  const passCount = results.filter(r => r.status === 'pass').length;
  const warnCount = results.filter(r => r.status === 'warn').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  const unknownCount = results.filter(r => r.status === 'unknown').length;

  const report: JsonReport = {
    version,
    timestamp: new Date().toISOString(),
    score,
    results: sanitizedResults,
    metadata: {
      totalScanners: results.length,
      passCount,
      warnCount,
      failCount,
      unknownCount,
      generatedAt: new Date().toISOString(),
      generator: 'mac-aicheck',
    },
  };

  if (fixerResults !== undefined) {
    (report as any).fixerResults = fixerResults;
  }
  if (executionMode !== undefined) {
    (report as any).executionMode = executionMode;
  }

  return JSON.stringify(report, null, 2);
}

/**
 * 解析 JSON 报告文件
 * @param content JSON 报告内容
 */
export function parseJsonReport(content: string): JsonReport {
  const parsed = JSON.parse(content) as JsonReport;
  return parsed;
}
