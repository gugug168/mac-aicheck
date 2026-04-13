import type { Fixer } from './types';
import type { ScanResult } from '../scanners/types';
import type { PreflightCheck } from './types';

/**
 * Result of running preflight checks
 */
export interface PreflightResult {
  passed: boolean;
  failedCheck?: PreflightCheck;
  message?: string;
}

/**
 * Execute all preflight checks for a fixer (D-17, DIA-02).
 * Runs sequentially, aborts on first failure.
 * Returns { passed: true } if all checks pass.
 * @param fixer - The fixer whose preflightChecks will be executed
 * @param scanResult - Reserved for future use (pass context to checks)
 */
export async function runPreflights(
  fixer: Fixer,
  scanResult: ScanResult // Reserved for future use
): Promise<PreflightResult> {
  const checks = fixer.preflightChecks || [];

  for (const check of checks) {
    const result = await check.check();
    if (!result.pass) {
      return {
        passed: false,
        failedCheck: check,
        message: result.message || `Preflight check "${check.id}" failed`,
      };
    }
  }

  return { passed: true };
}
