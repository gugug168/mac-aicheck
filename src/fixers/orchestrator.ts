/**
 * Fixer orchestration — scan → match → execute → verify
 * Separated from barrel exports to keep each module focused.
 */

import type { Fixer, FixResult } from './types';
import type { ScanResult } from '../scanners/types';
import { getFixers, getFixerForScanResult } from './registry';
import { verifyFix, buildNextSteps } from './verify';
import { runPreflights } from './preflight';
import { scanAll } from '../scanners/index';

/**
 * Options for fixAll()
 */
export interface FixAllOptions {
  dryRun?: boolean;      // just check canFix(), don't execute
  riskLevel?: 'green' | 'yellow' | 'red';  // filter by risk level
  scannerIds?: string[]; // only fix these scanner IDs
}

/**
 * Result of a single fixer execution
 */
export interface FixerExecutionResult {
  scannerId: string;
  fixerId?: string;
  originalStatus: ScanResult['status'];
  fixResult?: FixResult;
  error?: string;
}

/**
 * Result of fixAll() operation
 */
export interface FixAllResult {
  total: number;
  attempted: number;
  succeeded: number;
  failed: number;
  results: FixerExecutionResult[];
}

/**
 * Main orchestration: find failed scans, match to fixers, execute, verify.
 */
export async function fixAll(options: FixAllOptions = {}): Promise<FixAllResult> {
  const { dryRun = false, riskLevel, scannerIds } = options;

  // Step 1: Run scanners to get current state
  const scanResults = await scanAll();

  // Step 2: Filter to failed/warn items that have fixers
  const failedScans = scanResults.filter(s =>
    (s.status === 'fail' || s.status === 'warn') &&
    getFixerForScanResult(s) !== undefined
  );

  // Step 3: Filter by options if provided
  const toFix = failedScans.filter(s => {
    if (scannerIds && !scannerIds.includes(s.id)) return false;
    const fixer = getFixerForScanResult(s);
    if (!fixer) return false;
    if (riskLevel && fixer.risk !== riskLevel) return false;
    return true;
  });

  const results: FixerExecutionResult[] = [];
  let attempted = 0;

  for (const scanResult of toFix) {
    const fixer = getFixerForScanResult(scanResult)!;

    // Preflight check
    const preflightResult = await runPreflights(fixer, scanResult);
    if (!preflightResult.passed) {
      results.push({
        scannerId: scanResult.id,
        fixerId: fixer.id,
        originalStatus: scanResult.status,
        error: preflightResult.message,
      });
      continue;
    }

    // Dry-run: report what would be done
    if (dryRun) {
      results.push({
        scannerId: scanResult.id,
        fixerId: fixer.id,
        originalStatus: scanResult.status,
        fixResult: {
          success: true,
          message: `[dry-run] Would execute fixer: ${fixer.name}`,
          verified: false,
          nextSteps: [`Would run: ${fixer.execute.toString().slice(0, 50)}...`],
        },
      });
      continue;
    }

    // Actual execution
    attempted++;
    try {
      const fixResult = await fixer.execute(scanResult, dryRun);

      // Verify the fix for green-risk fixers
      if (fixResult.success && fixer.risk === 'green') {
        const { newScanResult, status } = await verifyFix(scanResult, fixer.id);
        fixResult.verified = true;
        fixResult.newScanResult = newScanResult;
        fixResult.nextSteps = buildNextSteps(status, fixer.risk, fixResult.message);
      } else {
        fixResult.verified = false;
        fixResult.nextSteps = buildNextSteps(
          fixResult.success ? 'warn' : 'fail',
          fixer.risk,
          fixResult.message
        );
      }

      // Add guidance from fixer
      const guidance = fixer.getGuidance?.();
      if (guidance) {
        if (guidance.needsTerminalRestart) {
          fixResult.nextSteps!.push('请关闭当前终端并重新打开以使 PATH 生效');
        }
        if (guidance.needsReboot) {
          fixResult.nextSteps!.push('系统配置已更新，请重启电脑使更改生效');
        }
        if (guidance.verifyCommands?.length) {
          fixResult.nextSteps!.push('请运行以下命令确认修复成功:');
          guidance.verifyCommands.forEach(cmd => {
            fixResult.nextSteps!.push(`  ${cmd}`);
          });
        }
        if (guidance.notes?.length) {
          fixResult.nextSteps!.push(...guidance.notes);
        }
      }

      results.push({
        scannerId: scanResult.id,
        fixerId: fixer.id,
        originalStatus: scanResult.status,
        fixResult,
      });
    } catch (err: any) {
      results.push({
        scannerId: scanResult.id,
        fixerId: fixer.id,
        originalStatus: scanResult.status,
        error: err.message,
      });
    }
  }

  const succeeded = results.filter(r => r.fixResult?.success).length;
  const failed = results.filter(r => r.error || !r.fixResult?.success).length;

  return {
    total: toFix.length,
    attempted,
    succeeded,
    failed,
    results,
  };
}
