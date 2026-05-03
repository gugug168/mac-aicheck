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

// Backup data for rollback support (TASK-190 Phase B)
export interface BackupData {
  scannerId: string;
  timestamp: number;
  data: Record<string, string>;
}

export interface FixBackupSummary {
  available: boolean;
  timestamp?: number;
  keys?: string[];
}

export interface FixRollbackSummary {
  available: boolean;
  attempted: boolean;
  result: 'not_needed' | 'success' | 'failed' | 'unavailable';
  message?: string;
}

export interface FixVerificationSummary {
  status: VerificationStatus | 'skipped';
  verified: boolean;
  deferred?: boolean;
  beforeStatus?: ScanResult['status'];
  afterStatus?: ScanResult['status'];
  message?: string;
}

// FixResult returned by fixer.execute() (D-08, VRF-03)
export interface FixResult {
  success: boolean;
  message: string;
  verified: boolean;           // whether verification ran
  partial?: boolean;          // true if partially fixed (warn state)
  nextSteps?: string[];       // recommended follow-up actions
  newScanResult?: ScanResult; // re-scan result after fix (VRF-01)
  rolledBack?: boolean;
  backupSummary?: FixBackupSummary;
  rollback?: FixRollbackSummary;
  verification?: FixVerificationSummary;
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
  // Optional: backup state before applying fix (TASK-190 Phase B)
  backup?(scanResult: ScanResult): Promise<BackupData>;
  // Optional: rollback on failure (TASK-190 Phase B)
  rollback?(backup: BackupData): Promise<void>;
  // Optional: which scanner IDs this fixer handles
  scannerIds?: string[];
  // Optional extensions (D-13, D-15, D-20)
  preflightChecks?: PreflightCheck[];                           // D-15
  getGuidance?: () => PostFixGuidance | undefined;              // D-13
  getVerificationCommand?: () => string | string[] | undefined; // D-20
}

// PostFixGuidance interface (D-13, PST-01)
export interface PostFixGuidance {
  needsTerminalRestart: boolean;
  needsReboot: boolean;
  verifyCommands?: string[];
  notes?: string[];
}

// PreflightCheck type (D-15, D-16, DIA-02)
export interface PreflightCheck {
  id: string;
  check: () => Promise<{ pass: boolean; message?: string }>;
}
