/**
 * Fixer orchestration — scan → match → execute → verify
 * Separated from barrel exports to keep each module focused.
 *
 * Enhancement (2026-05-11): Parallel execution for independent green-risk fixers.
 * Yellow/red risk fixers always run sequentially to prevent side-effects.
 */

import type { Fixer, FixResult, BackupData, FixBackupSummary, FixRollbackSummary } from './types';
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
  /** Maximum concurrent fixer executions for independent green-risk fixers (default: 4) */
  concurrent?: number;
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
  backupSummary?: FixBackupSummary;
  rollbackSummary?: FixRollbackSummary;
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
  /** How many fixers were run in parallel (vs sequential) */
  executionMode: 'sequential' | 'parallel';
}

/** Run a single fixer through its full lifecycle: preflight → backup → execute → verify → rollback */
async function runSingleFixer(
  scanResult: ScanResult,
  fixer: Fixer,
  dryRun: boolean,
): Promise<FixerExecutionResult> {
  // Preflight check
  const preflightResult = await runPreflights(fixer, scanResult);
  if (!preflightResult.passed) {
    return {
      scannerId: scanResult.id,
      fixerId: fixer.id,
      originalStatus: scanResult.status,
      error: preflightResult.message,
    };
  }

  // Dry-run: report what would be done
  if (dryRun) {
    return {
      scannerId: scanResult.id,
      fixerId: fixer.id,
      originalStatus: scanResult.status,
      fixResult: {
        success: true,
        message: `[dry-run] Would execute fixer: ${fixer.name}`,
        verified: false,
        nextSteps: [`Would run: ${fixer.execute.toString().slice(0, 50)}...`],
      },
    };
  }

  // Backup before execution
  let backupData: BackupData | undefined;
  if (fixer.backup) {
    try {
      backupData = await fixer.backup(scanResult);
    } catch (backupErr) {
      return {
        scannerId: scanResult.id,
        fixerId: fixer.id,
        originalStatus: scanResult.status,
        error: `备份失败: ${backupErr instanceof Error ? backupErr.message : String(backupErr)}`,
        backupSummary: { available: false },
      };
    }
  }

  try {
    const fixResult = await fixer.execute(scanResult, dryRun);

    // Verify the fix for green-risk fixers
    if (fixResult.success && fixer.risk === 'green') {
      const { newScanResult, status } = await verifyFix(scanResult, fixer.id);
      fixResult.verified = true;
      fixResult.newScanResult = newScanResult;
      fixResult.partial = status === 'warn';
      if (status === 'fail') {
        fixResult.success = false;
      }
      fixResult.nextSteps = buildNextSteps(status, fixer.risk, fixResult.message);
    } else {
      fixResult.verified = false;
      fixResult.nextSteps = buildNextSteps(
        fixResult.success ? 'warn' : 'fail',
        fixer.risk,
        fixResult.message
      );
    }

    // Rollback on failure for any risk level
    if (!fixResult.success && backupData && fixer.rollback) {
      try {
        await fixer.rollback(backupData);
        fixResult.rolledBack = true;
        fixResult.rollback = { available: true, attempted: true, result: 'success' };
      } catch (rollbackErr) {
        fixResult.rolledBack = false;
        fixResult.rollback = {
          available: true, attempted: true, result: 'failed',
          message: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
        };
      }
    }

    // Fill structured summaries
    fixResult.backupSummary = backupData
      ? { available: true, timestamp: backupData.timestamp, keys: Object.keys(backupData.data) }
      : { available: false };
    if (!fixResult.rollback) {
      fixResult.rollback = { available: !!backupData, attempted: false, result: 'not_needed' };
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

    return {
      scannerId: scanResult.id,
      fixerId: fixer.id,
      originalStatus: scanResult.status,
      fixResult,
      backupSummary: fixResult.backupSummary,
      rollbackSummary: fixResult.rollback,
    };
  } catch (err: any) {
    const entry: FixerExecutionResult = {
      scannerId: scanResult.id,
      fixerId: fixer.id,
      originalStatus: scanResult.status,
      error: err.message,
    };
    if (backupData && fixer.rollback) {
      try {
        await fixer.rollback(backupData);
        entry.rollbackSummary = { available: true, attempted: true, result: 'success' };
      } catch (rbErr) {
        entry.rollbackSummary = {
          available: true, attempted: true, result: 'failed',
          message: rbErr instanceof Error ? rbErr.message : String(rbErr),
        };
      }
    }
    return entry;
  }
}

/**
 * Execute multiple fixers in parallel batches.
 * Uses a semaphore pattern (concurrency counter) to limit parallelism.
 */
async function runFixersParallel(
  items: Array<{ scanResult: ScanResult; fixer: Fixer }>,
  dryRun: boolean,
  maxConcurrent: number,
): Promise<FixerExecutionResult[]> {
  const results: FixerExecutionResult[] = [];
  let active = 0;
  let index = 0;

  async function startNext(): Promise<void> {
    while (index < items.length) {
      while (active >= maxConcurrent) {
        await new Promise(resolve => setImmediate(resolve));
      }
      const current = index++;
      const { scanResult, fixer } = items[current];
      active++;
      runSingleFixer(scanResult, fixer, dryRun).then(r => {
        results[current] = r;
      }).catch((err: any) => {
        results[current] = {
          scannerId: scanResult.id,
          fixerId: fixer.id,
          originalStatus: scanResult.status,
          error: err.message,
        };
      }).finally(() => {
        active--;
      });
    }
  }

  // Fill results array in correct order
  const promises = items.map(async (_, i) => {
    while (results[i] === undefined) {
      await new Promise(resolve => setImmediate(resolve));
    }
    return results[i];
  });

  // Start initial batch
  const initialBatch = Math.min(maxConcurrent, items.length);
  for (let i = 0; i < initialBatch; i++) {
    const { scanResult, fixer } = items[i];
    index++;
    active++;
    runSingleFixer(scanResult, fixer, dryRun).then(r => { results[i] = r; })
      .catch((err: any) => {
        results[i] = { scannerId: scanResult.id, fixerId: fixer.id, originalStatus: scanResult.status, error: err.message };
      }).finally(() => { active--; });
  }

  // Wait for all
  await Promise.all(items.map((_, i) => new Promise<void>(resolve => {
    const check = () => {
      if (results[i] !== undefined) resolve();
      else setImmediate(check);
    };
    check();
  })));

  return results;
}

/**
 * Main orchestration: find failed scans, match to fixers, execute, verify.
 *
 * Execution strategy:
 * - Green-risk + independent: parallel (up to `concurrent` at a time)
 * - Yellow/red-risk: always sequential (safety first)
 * - Dry-run: always sequential (read-only)
 */
export async function fixAll(options: FixAllOptions = {}): Promise<FixAllResult> {
  const { dryRun = false, riskLevel, scannerIds, concurrent = 4 } = options;

  // Step 1: Run scanners to get current state
  const scanResults = await scanAll();

  // Step 2: Filter to failed/warn items that have fixers
  const failedScans = scanResults.filter(s =>
    (s.status === 'fail' || s.status === 'warn') &&
    getFixerForScanResult(s) !== undefined
  );

  // Step 3: Filter by options
  const toFix = failedScans
    .map(s => ({ scanResult: s, fixer: getFixerForScanResult(s)! }))
    .filter(({ fixer }) => {
      if (scannerIds && !scannerIds.includes(fixer.scannerIds?.[0] ?? '')) return false;
      if (riskLevel && fixer.risk !== riskLevel) return false;
      return true;
    });

  // Separate by risk: green goes parallel, yellow/red goes sequential
  const greenItems = toFix.filter(({ fixer }) => fixer.risk === 'green');
  const highRiskItems = toFix.filter(({ fixer }) => fixer.risk !== 'green');

  let results: FixerExecutionResult[] = [];
  let attempted = 0;
  let executionMode: FixAllResult['executionMode'] = 'sequential';

  // Yellow/red: always sequential (safety)
  const highRiskResults: FixerExecutionResult[] = [];
  for (const { scanResult, fixer } of highRiskItems) {
    if (!dryRun) attempted++;
    const r = await runSingleFixer(scanResult, fixer, dryRun);
    highRiskResults.push(r);
  }

  // Green: parallel if not dry-run and we have multiple
  let greenResults: FixerExecutionResult[] = [];
  if (greenItems.length > 0) {
    if (dryRun || greenItems.length === 1) {
      // Sequential for dry-run or single item
      greenResults = [];
      for (const { scanResult, fixer } of greenItems) {
        if (!dryRun) attempted++;
        const r = await runSingleFixer(scanResult, fixer, dryRun);
        greenResults.push(r);
      }
    } else {
      // True parallel execution for independent green-risk fixers
      executionMode = 'parallel';
      greenResults = await runFixersParallel(greenItems, dryRun, concurrent);
      if (!dryRun) attempted += greenItems.length;
    }
  }

  results = [...highRiskResults, ...greenResults];

  // Preserve original toFix ordering
  const orderedResults = toFix.map(({ scanResult, fixer }) => {
    return results.find(r => r.scannerId === scanResult.id && r.fixerId === fixer.id) ?? {
      scannerId: scanResult.id,
      fixerId: fixer.id,
      originalStatus: scanResult.status,
      error: 'unknown',
    };
  });

  const succeeded = orderedResults.filter(r => r.fixResult?.success).length;
  const failed = orderedResults.filter(r => r.error || !r.fixResult?.success).length;

  return {
    total: toFix.length,
    attempted,
    succeeded,
    failed,
    results: orderedResults,
    executionMode,
  };
}
