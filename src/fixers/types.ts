import type { ScanResult } from '../scanners/types';

// Risk level for fixers (mirrors project risk classification)
export type FixerRisk = 'green' | 'yellow' | 'red';

// Verification result states (D-05, VRF-02)
export type VerificationStatus = 'pass' | 'warn' | 'fail';

// Error category (D-07, FIX-03)
export type ErrorCategory =
  | 'timeout'
  | 'command-not-found'
  | 'permission-denied'
  | 'network-error'
  | 'disk-full'
  | 'generic';

// FixResult returned by fixer.execute() (D-08, VRF-03)
export interface FixResult {
  success: boolean;
  message: string;
  verified: boolean;           // whether verification ran
  partial?: boolean;          // true if partially fixed (warn state)
  nextSteps?: string[];       // recommended follow-up actions
  newScanResult?: ScanResult; // re-scan result after fix (VRF-01)
}

// Fixer interface (D-02, FIX-01) — mirrors Scanner pattern
export interface Fixer {
  id: string;
  name: string;
  risk: FixerRisk;
  // Check if this fixer can handle the given scan failure
  canFix(scanResult: ScanResult): boolean;
  // Execute the fix; returns FixResult
  execute(scanResult: ScanResult, dryRun?: boolean): Promise<FixResult>;
  // Optional: which scanner IDs this fixer handles
  scannerIds?: string[];
}
