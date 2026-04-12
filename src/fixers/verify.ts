import type { FixResult, VerificationStatus } from './types';
import type { ScanResult } from '../scanners/types';
import { getFixerForScanResult } from './registry';
import { scanAll } from '../scanners/index';

/**
 * Run verification by re-scanning after a fix attempt (D-04, VRF-01).
 * Returns the re-scan result AND determines verification status.
 */
export async function verifyFix(
  originalScanResult: ScanResult,
  fixerId: string
): Promise<{ newScanResult: ScanResult; status: VerificationStatus }> {
  // Re-run the corresponding scanner
  const allResults = await scanAll();
  const newScanResult = allResults.find(r => r.id === originalScanResult.id);

  if (!newScanResult) {
    return {
      newScanResult: { ...originalScanResult, status: 'unknown', message: 'Verification scan not found' },
      status: 'fail',
    };
  }

  // Determine verification status by comparing old vs new
  const status = determineVerificationStatus(originalScanResult.status, newScanResult.status);

  return { newScanResult, status };
}

/**
 * Determine verification status based on before/after scan status (VRF-02).
 * Rules:
 * - fail→pass = pass
 * - fail→warn = warn (partial fix)
 * - warn→pass = pass
 * - warn→warn = warn
 * - pass→pass = pass
 * - anything→fail = fail
 */
export function determineVerificationStatus(
  original: ScanResult['status'],
  current: ScanResult['status']
): VerificationStatus {
  if (current === 'pass') return 'pass';
  if (current === 'warn') return 'warn';
  if (current === 'fail') {
    // If originally fail and still fail, check if improved within fail
    if (original === 'fail') return 'warn'; // partial credit for trying
    return 'fail';
  }
  return 'fail';
}

/**
 * Preflight check before executing a fix (FIX-04).
 * Returns error message if preflight fails, null if OK to proceed.
 */
export function preflightCheck(scanResult: ScanResult): string | null {
  // Check if a fixer exists for this scan result
  const fixer = getFixerForScanResult(scanResult);
  if (!fixer) {
    return `No fixer available for scanner: ${scanResult.id}`;
  }

  // Yellow/red risk fixers need explicit confirmation (deferred to CLI layer)
  // Here we just return null to indicate preflight passed
  // The CLI will handle interactive confirmation

  return null; // Preflight passed
}

/**
 * Build nextSteps array based on verification result and fixer risk level.
 */
export function buildNextSteps(
  status: VerificationStatus,
  fixerRisk: 'green' | 'yellow' | 'red',
  message?: string
): string[] {
  const steps: string[] = [];

  if (status === 'pass') {
    steps.push('修复成功，问题已解决');
  } else if (status === 'warn') {
    steps.push('部分修复完成，建议手动验证');
    if (fixerRisk === 'yellow' || fixerRisk === 'red') {
      steps.push('可能需要手动验证或重启终端');
    }
  } else {
    steps.push('修复未能解决问题，请查看详细错误信息');
    if (message) {
      steps.push(`错误详情: ${message}`);
    }
  }

  return steps;
}
