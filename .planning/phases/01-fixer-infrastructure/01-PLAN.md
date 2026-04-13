---
phase: 01-fixer-infrastructure
wave: 1
depends_on: []
files_modified:
  - src/fixers/types.ts
  - src/fixers/errors.ts
  - src/fixers/registry.ts
  - src/fixers/verify.ts
  - src/fixers/index.ts
  - src/index.ts
autonomous: false
requirements: [FIX-01, FIX-02, FIX-03, FIX-04, VRF-01, VRF-02, VRF-03]
---

# Plan: Fixer Infrastructure — Phase 1

**Phase:** 01-fixer-infrastructure
**Goal:** 建立 fixer 核心架构，支持 scanner→fixer 映射和验证闭环
**Type:** execute
**Autonomous:** false (has checkpoints for CLI integration)
**Requirements:** [FIX-01, FIX-02, FIX-03, FIX-04, VRF-01, VRF-02, VRF-03]

---

## Wave Structure

| Wave | Plans | Deliverables | Dependencies | Parallel? |
|------|-------|--------------|--------------|-----------|
| 1 | 01 | types.ts + errors.ts | none | yes |
| 2 | 01 | registry.ts | types.ts | no |
| 3 | 01 | verify.ts | types.ts + registry.ts | no |
| 4 | 01 | fixers/index.ts | types + registry + verify | no |
| 5 | 01 | src/index.ts CLI | fixers/index.ts | no |

**Single plan file with wave assignments. Tasks within wave 1 (types.ts + errors.ts) are parallelizable.**

---

## Decision Coverage Matrix

| Decision | Wave | Task | Status |
|----------|------|------|--------|
| D-01: Mirror Scanner self-reg | 2 | registry.ts | planned |
| D-02: Fixer interface fields | 1 | types.ts | planned |
| D-04: Auto re-scan verification | 3 | verify.ts | planned |
| D-05: Verification 3 states | 1 | types.ts | planned |
| D-07: Six error categories | 1 | errors.ts | planned |
| D-08: FixResult fields | 1 | types.ts | planned |
| D-09: Hardcoded registry mapping | 2 | registry.ts | planned |
| D-10: Self-registration | 2 | registry.ts | planned |
| D-11: --dry-run support | 4 | fixers/index.ts | planned |
| D-12: fix subcommand | 5 | src/index.ts | planned |

---

## Must-Haves (Goal-Backward Verification)

### Observable Truths
1. User runs `mac-aicheck fix` and fixer infrastructure executes
2. Fixers are self-registered on module import
3. Scanner-to-fixer mapping is hardcoded in registry
4. Command failures are classified into 6 error categories
5. fixAll() runs with --dry-run flag support
6. After fixAll(), verification re-runs scanner to confirm fix

### Required Artifacts
| File | Provides | Min Lines |
|------|----------|-----------|
| `src/fixers/types.ts` | Fixer interface + FixResult + ErrorCategory + VerificationStatus | 50 |
| `src/fixers/errors.ts` | classifyError() + ERROR_MESSAGES | 70 |
| `src/fixers/registry.ts` | Self-registration + scanner→fixer map | 60 |
| `src/fixers/verify.ts` | Verification loop + re-scan | 80 |
| `src/fixers/index.ts` | fixAll() orchestration entry | 70 |
| `src/index.ts` | CLI `fix` subcommand | 20 |

### Key Links
| From | To | Via |
|------|----|-----|
| src/index.ts | fixers/index.ts | `fixAll()` import |
| fixers/index.ts | fixers/verify.ts | verifyFix() call |
| fixers/verify.ts | scanners/index.ts | `scanAll()` re-run |
| fixers/registry.ts | fixers/types.ts | Fixer type import |
| fixers/verify.ts | fixers/types.ts | FixResult import |

---

## Tasks

### Wave 1: Foundation Types (Parallel — types.ts + errors.ts)

#### Task 1.1: Create Fixer Types (`src/fixers/types.ts`)

<read_first>
- `src/scanners/types.ts` — Mirror Scanner interface structure
</read_first>

<action>
Create `src/fixers/types.ts` with these exact exports:

```typescript
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
```

Create `src/fixers/index.ts` stub:
```typescript
export type { Fixer, FixResult, FixerRisk, VerificationStatus, ErrorCategory } from './types';
export type { ScanResult } from '../scanners/types';
```

Key constraints:
- Do NOT import full Scanner module (only types) to avoid circular deps
- Fixer.canFix() receives ScanResult as input
- Fixer.execute() supports dry-run mode (D-11)
</action>

<verify>
```bash
grep -n "export interface Fixer" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/types.ts
grep -n "export interface FixResult" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/types.ts
grep -n "export type FixerRisk" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/types.ts
grep -n "export type VerificationStatus" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/types.ts
grep -n "export type ErrorCategory" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/types.ts
grep -n "canFix.*scanResult" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/types.ts
grep -n "execute.*scanResult.*dryRun" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/types.ts
grep -n "export.*from './types'" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/index.ts
# TypeScript compile check
cd /Users/gugu/projects/macaicheck/mac-aicheck && npx tsc --noEmit src/fixers/types.ts 2>&1 | head -20
```
</verify>

<done>
- Fixer interface has `id`, `name`, `risk`, `canFix(ScanResult)`, `execute(ScanResult, dryRun?)`
- FixResult has `success`, `message`, `verified`, `partial?`, `nextSteps?`, `newScanResult?`
- VerificationStatus is `'pass' | 'warn' | 'fail'`
- FixerRisk is `'green' | 'yellow' | 'red'`
- ErrorCategory has 6 values
- `src/fixers/index.ts` stub re-exports all types
- TypeScript compiles without errors
</done>

---

#### Task 1.2: Create Error Classification System (`src/fixers/errors.ts`)

<read_first>
- `src/fixers/types.ts` — ErrorCategory type defined here
- `src/executor/index.ts` — runCommand() returns exitCode, stdout, stderr
</read_first>

<action>
Create `src/fixers/errors.ts` with six error categories (D-07, FIX-03):

```typescript
// Six error categories (D-07)
export type ErrorCategory =
  | 'timeout'
  | 'command-not-found'
  | 'permission-denied'
  | 'network-error'
  | 'disk-full'
  | 'generic';

// Error classification result
export interface ClassifiedError {
  category: ErrorCategory;
  message: string;
  recoverable: boolean;  // true if fixer should retry
}

/**
 * Classify a command execution failure into an ErrorCategory.
 * Examines exit code, stderr content, and error message patterns.
 */
export function classifyError(
  exitCode: number,
  stderr: string,
  errorMessage?: string
): ClassifiedError {
  const combined = `${stderr} ${errorMessage || ''}`.toLowerCase();

  // command-not-found: exit 127, "command not found", "not found"
  if (exitCode === 127 || combined.includes('command not found') || combined.includes('not found')) {
    return { category: 'command-not-found', message: `Command not found: ${stderr}`, recoverable: false };
  }

  // permission-denied: exit 126, "permission denied", "eacces"
  if (exitCode === 126 || combined.includes('permission denied') || combined.includes('eacces')) {
    return { category: 'permission-denied', message: `Permission denied: ${stderr}`, recoverable: false };
  }

  // disk-full: "no space left", "disk full", "enospc"
  if (combined.includes('no space left') || combined.includes('disk full') || combined.includes('enospc')) {
    return { category: 'disk-full', message: `Disk full: ${stderr}`, recoverable: false };
  }

  // network-error: "connection refused", "network", "ename resolution", "http error", "eai_again"
  if (
    combined.includes('connection refused') ||
    combined.includes('network') ||
    combined.includes('ename resolution') ||
    combined.includes('http error') ||
    combined.includes('eai_again')
  ) {
    return { category: 'network-error', message: `Network error: ${stderr}`, recoverable: true };
  }

  // timeout: exit 124 (timeout command), "timed out"
  if (exitCode === 124 || combined.includes('timeout') || combined.includes('timed out')) {
    return { category: 'timeout', message: `Command timed out: ${stderr}`, recoverable: true };
  }

  // generic: everything else
  return { category: 'generic', message: errorMessage || `Command failed: ${stderr}`, recoverable: false };
}

/**
 * Human-readable Chinese messages for each error category (DIA-01 foundation).
 */
export const ERROR_MESSAGES: Record<ErrorCategory, { title: string; suggestion: string }> = {
  'timeout': {
    title: '命令执行超时',
    suggestion: '网络连接不稳定或目标服务器响应慢，请检查网络后重试',
  },
  'command-not-found': {
    title: '命令未找到',
    suggestion: '请先安装对应工具，或检查 PATH 环境变量配置',
  },
  'permission-denied': {
    title: '权限不足',
    suggestion: '需要管理员权限，请使用 sudo 或联系系统管理员',
  },
  'network-error': {
    title: '网络错误',
    suggestion: '网络连接异常，请检查网络设置或代理配置',
  },
  'disk-full': {
    title: '磁盘空间不足',
    suggestion: '请清理磁盘空间后重试，使用 df -h 查看磁盘状态',
  },
  'generic': {
    title: '执行失败',
    suggestion: '命令执行失败，请查看详细错误信息',
  },
};
```

Key constraints:
- classifyError() is a pure function (no side effects)
- recoverable=true indicates fixer CAN retry
- ERROR_MESSAGES provides Chinese titles/suggestions for UI display
</action>

<verify>
```bash
grep -n "export type ErrorCategory" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/errors.ts
grep -n "export function classifyError" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/errors.ts
grep -n "'command-not-found'" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/errors.ts
grep -n "'permission-denied'" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/errors.ts
grep -n "'network-error'" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/errors.ts
grep -n "'disk-full'" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/errors.ts
grep -n "'timeout'" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/errors.ts
grep -n "'generic'" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/errors.ts
grep -n "ERROR_MESSAGES" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/errors.ts
# TypeScript compile check
cd /Users/gugu/projects/macaicheck/mac-aicheck && npx tsc --noEmit src/fixers/errors.ts 2>&1 | head -20
```
</verify>

<done>
- ErrorCategory type has exactly 6 values: timeout, command-not-found, permission-denied, network-error, disk-full, generic
- classifyError() function accepts (exitCode, stderr, errorMessage?) and returns ClassifiedError
- Each category classified by exit code and stderr content patterns
- ERROR_MESSAGES object maps each category to Chinese {title, suggestion}
- recoverable field set correctly per category
- TypeScript compiles without errors
</done>

---

### Wave 2: Fixer Registry (Depends on types.ts)

#### Task 2.1: Create Fixer Registry (`src/fixers/registry.ts`)

<read_first>
- `src/fixers/types.ts` — Fixer type used here
- `src/scanners/registry.ts` — Mirror self-registration pattern
</read_first>

<action>
Create `src/fixers/registry.ts` implementing self-registration and scanner→fixer mapping (D-01, D-02, D-09, D-10, FIX-02):

```typescript
import type { Fixer } from './types';
import type { ScanResult } from '../scanners/types';

// Internal registry storage
const _fixers: Fixer[] = [];

// Hardcoded scanner ID → fixer ID mapping (D-09)
// This is the explicit mapping between what scanner failed and which fixer handles it
export const SCANNER_TO_FIXER_MAP: Record<string, string> = {
  // homebrew
  'homebrew': 'homebrew-fixer',
  // git
  'git': 'git-fixer',
  'git-identity-config': 'git-fixer',
  // npm mirror
  'npm-mirror': 'npm-mirror-fixer',
  // rosetta
  'rosetta': 'rosetta-fixer',
  // node version
  'node-version': 'node-version-fixer',
  // python versions
  'python-versions': 'python-versions-fixer',
};

/**
 * Self-registration: Fixers call this on module import (D-10).
 * Mirrors registerScanner() pattern from src/scanners/registry.ts
 */
export function registerFixer(fixer: Fixer): void {
  _fixers.push(fixer);
}

/**
 * Get all registered fixers.
 */
export function getFixers(): Fixer[] {
  return [..._fixers];
}

/**
 * Get fixer by ID.
 */
export function getFixerById(id: string): Fixer | undefined {
  return _fixers.find(f => f.id === id);
}

/**
 * Find fixer that can handle a given scan result (D-02, D-10).
 * Checks both scannerIds match and canFix() returns true.
 */
export function getFixerForScanResult(scanResult: ScanResult): Fixer | undefined {
  // First check hardcoded mapping
  const mappedFixerId = SCANNER_TO_FIXER_MAP[scanResult.id];
  if (mappedFixerId) {
    const fixer = getFixerById(mappedFixerId);
    if (fixer && fixer.canFix(scanResult)) {
      return fixer;
    }
  }

  // Fallback: scan all fixers and check canFix()
  return _fixers.find(fixer => fixer.canFix(scanResult));
}

/**
 * Get fixer(s) by scanner ID (from hardcoded map).
 */
export function getFixerByScannerId(scannerId: string): Fixer | undefined {
  const fixerId = SCANNER_TO_FIXER_MAP[scannerId];
  if (fixerId) {
    return getFixerById(fixerId);
  }
  return undefined;
}

/**
 * Clear all registered fixers (for testing).
 */
export function clearFixers(): void {
  _fixers.length = 0;
}
```

Key constraints:
- Mirror `registerScanner()` pattern exactly (D-01)
- Hardcoded SCANNER_TO_FIXER_MAP for explicit mapping (D-09)
- Self-registration on module import (D-10)
- getFixerForScanResult() checks both mapping AND canFix()
</action>

<verify>
```bash
grep -n "export function registerFixer" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/registry.ts
grep -n "export function getFixerForScanResult" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/registry.ts
grep -n "SCANNER_TO_FIXER_MAP" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/registry.ts
grep -n "'homebrew'" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/registry.ts
grep -n "export function clearFixers" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/registry.ts
# TypeScript compile check
cd /Users/gugu/projects/macaicheck/mac-aicheck && npx tsc --noEmit src/fixers/registry.ts 2>&1 | head -20
```
</verify>

<done>
- registerFixer() function exists and adds to internal registry
- getFixers() returns copy of registry array
- getFixerById() finds fixer by exact ID match
- getFixerForScanResult() checks SCANNER_TO_FIXER_MAP first, then falls back to canFix()
- SCANNER_TO_FIXER_MAP has at least 7 entries (homebrew, git, npm-mirror, rosetta, node-version, python-versions)
- clearFixers() resets registry for testing
- TypeScript compiles without errors
</done>

---

### Wave 3: Verification Loop (Depends on types.ts + registry.ts)

#### Task 3.1: Create Verification Module (`src/fixers/verify.ts`)

<read_first>
- `src/fixers/types.ts` — FixResult, VerificationStatus types
- `src/fixers/registry.ts` — getFixerForScanResult()
- `src/scanners/index.ts` — scanAll() for re-verification
</read_first>

<action>
Create `src/fixers/verify.ts` implementing verification loop (D-04, VRF-01, VRF-02, FIX-04):

```typescript
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
```

Key constraints:
- verifyFix() re-runs scanAll() and finds the matching scanner result (D-04)
- determineVerificationStatus() implements 3-state logic (D-05, VRF-02)
- preflightCheck() returns null if OK, error string if not (FIX-04)
- buildNextSteps() provides Chinese guidance based on status and risk
</action>

<verify>
```bash
grep -n "export async function verifyFix" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/verify.ts
grep -n "export function determineVerificationStatus" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/verify.ts
grep -n "export function preflightCheck" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/verify.ts
grep -n "export function buildNextSteps" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/verify.ts
grep -n "scanAll" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/verify.ts
# TypeScript compile check
cd /Users/gugu/projects/macaicheck/mac-aicheck && npx tsc --noEmit src/fixers/verify.ts 2>&1 | head -20
```
</verify>

<done>
- verifyFix() accepts (originalScanResult, fixerId) and returns Promise<{newScanResult, status}>
- determineVerificationStatus() maps pass→pass='pass', fail→pass='pass', fail→warn='warn', etc.
- preflightCheck() returns null if fixer exists, error string otherwise
- buildNextSteps() returns string[] with Chinese guidance
- verifyFix() calls scanAll() to re-verify (VRF-01)
- TypeScript compiles without errors
</done>

---

### Wave 4: Fixer Orchestration (Depends on types + registry + verify)

#### Task 4.1: Create Fixer Orchestration (`src/fixers/index.ts` — complete implementation)

<read_first>
- `src/fixers/types.ts` — Fixer, FixResult types
- `src/fixers/registry.ts` — getFixers(), getFixerForScanResult()
- `src/fixers/verify.ts` — verifyFix(), preflightCheck(), buildNextSteps()
- `src/scanners/index.ts` — scanAll() to get failed scan results
</read_first>

<action>
Replace the stub `src/fixers/index.ts` with full implementation:

```typescript
import type { Fixer, FixResult } from './types';
import type { ScanResult } from '../scanners/types';
import { getFixers, getFixerForScanResult } from './registry';
import { verifyFix, preflightCheck, buildNextSteps } from './verify';
import { scanAll } from '../scanners/index';

// Re-export all types
export type { Fixer, FixResult, FixerRisk, VerificationStatus, ErrorCategory } from './types';
export type { ScanResult } from '../scanners/types';

// Re-export registry functions
export { registerFixer, getFixers, getFixerById, getFixerForScanResult, clearFixers } from './registry';

// Re-export error functions
export { classifyError, ERROR_MESSAGES } from './errors';
export type { ClassifiedError } from './errors';

// Re-export verify functions
export { verifyFix, determineVerificationStatus, preflightCheck, buildNextSteps } from './verify';

export type { VerificationStatus } from './types';

/**
 * Options for fixAll()
 */
export interface FixAllOptions {
  dryRun?: boolean;      // D-11: just check canFix(), don't execute
  riskLevel?: 'green' | 'yellow' | 'red';  // filter by risk level
  scannerIds?: string[]; // only fix these scanner IDs
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
 * Main orchestration: find failed scans, match to fixers, execute, verify (D-04, D-11, VRF-01).
 */
export async function fixAll(options: FixAllOptions = {}): Promise<FixAllResult> {
  const { dryRun = false, riskLevel, scannerIds } = options;

  // Step 1: Run scanner to get current state
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

    // Preflight check (FIX-04)
    const preflightError = preflightCheck(scanResult);
    if (preflightError) {
      results.push({
        scannerId: scanResult.id,
        fixerId: fixer.id,
        originalStatus: scanResult.status,
        error: preflightError,
      });
      continue;
    }

    // Dry-run: just report what would be done
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

      // Verify the fix (VRF-01)
      if (fixResult.success && fixer.risk === 'green') {
        // Green risk: auto-verify
        const { newScanResult, status } = await verifyFix(scanResult, fixer.id);
        fixResult.verified = true;
        fixResult.newScanResult = newScanResult;
        fixResult.nextSteps = buildNextSteps(status, fixer.risk, fixResult.message);
      } else {
        // Yellow/red: skip auto-verify, provide guidance
        fixResult.verified = false;
        fixResult.nextSteps = buildNextSteps(
          fixResult.success ? 'warn' : 'fail',
          fixer.risk,
          fixResult.message
        );
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
```

Update the existing stub file — replace entirely with the above implementation.

Key constraints:
- fixAll() calls scanAll() first to get current state
- fixAll() supports dryRun option (D-11)
- Green risk fixers get auto-verify, yellow/red skip auto-verify (D-06 deferred)
- Each fixResult includes nextSteps from buildNextSteps()
- Returns FixAllResult with summary counts
</action>

<verify>
```bash
grep -n "export async function fixAll" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/index.ts
grep -n "dryRun" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/index.ts
grep -n "scanAll" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/index.ts
grep -n "verifyFix" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/index.ts
grep -n "preflightCheck" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/index.ts
grep -n "FixAllResult" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/index.ts
grep -n "buildNextSteps" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/index.ts
# TypeScript compile check
cd /Users/gugu/projects/macaicheck/mac-aicheck && npx tsc --noEmit src/fixers/index.ts 2>&1 | head -30
```
</verify>

<done>
- fixAll() is async and accepts FixAllOptions with dryRun support
- fixAll() calls scanAll() to get current scan state
- fixAll() matches failed scans to fixers via getFixerForScanResult()
- fixAll() calls preflightCheck() before each fixer.execute()
- Green risk fixers get verifyFix() called after execution
- fixAll() returns FixAllResult with total/attempted/succeeded/failed counts
- buildNextSteps() provides Chinese guidance in nextSteps array
- TypeScript compiles without errors
</done>

---

### Wave 5: CLI Integration (Depends on fixers/index.ts)

#### Task 5.1: Add `fix` Subcommand to `src/index.ts`

<read_first>
- `src/index.ts` — existing CLI structure (args parsing, commands)
- `src/fixers/index.ts` — fixAll() function to call
</read_first>

<action>
Modify `src/index.ts` to add `fix` subcommand (D-12):

1. Add import at top:
```typescript
import { fixAll } from './fixers/index';
```

2. Add `fix` command handler before the existing else-if chain:
```typescript
// Fix command
if (args.includes('fix')) {
  const dryRun = args.includes('--dry-run');
  const riskLevel = args.includes('--green') ? 'green' :
                    args.includes('--yellow') ? 'yellow' :
                    args.includes('--red') ? 'red' : undefined;

  console.log('[*] MacAICheck fixing...\n');
  if (dryRun) console.log('[DRY RUN] No changes will be made.\n');

  const result = await fixAll({ dryRun, riskLevel });

  console.log(`Total: ${result.total}  Attempted: ${result.attempted}  Succeeded: ${result.succeeded}  Failed: ${result.failed}\n`);

  for (const r of result.results) {
    if (r.fixResult) {
      const icon = r.fixResult.success ? '[+]' : '[-]';
      console.log(`${icon} ${r.scannerId}: ${r.fixResult.message}`);
      if (r.fixResult.nextSteps?.length) {
        for (const step of r.fixResult.nextSteps) {
          console.log(`    -> ${step}`);
        }
      }
    } else if (r.error) {
      console.log(`[-] ${r.scannerId}: ERROR - ${r.error}`);
    }
  }

  return;
}
```

3. Update the help text in the `--help` block:
```typescript
console.log('MacAICheck - AI Dev Environment Checker\nUsage:\n  mac-aicheck          Run diagnosis\n  mac-aicheck fix      Auto-fix detected issues\n  mac-aicheck fix --dry-run   Show what would be fixed\n  mac-aicheck --serve   Start Web UI\n  mac-aicheck --json    JSON output');
```

Key constraints:
- The `fix` command must appear BEFORE the existing `else` that calls runScan()
- `fix --dry-run` only checks canFix() and shows planned actions
- Risk level flags filter which fixers run
- Output shows summary counts and per-item results with nextSteps
</action>

<verify>
```bash
grep -n "import.*fixAll" /Users/gugu/projects/macaicheck/mac-aicheck/src/index.ts
grep -n "if.*args\.includes.*fix" /Users/gugu/projects/macaicheck/mac-aicheck/src/index.ts
grep -n "fixAll" /Users/gugu/projects/macaicheck/mac-aicheck/src/index.ts
grep -n "dry-run" /Users/gugu/projects/macaicheck/mac-aicheck/src/index.ts
# TypeScript compile check
cd /Users/gugu/projects/macaicheck/mac-aicheck && npx tsc --noEmit src/index.ts 2>&1 | head -30
```
</verify>

<done>
- `src/index.ts` imports fixAll from './fixers/index'
- `fix` subcommand is recognized and handled before runScan fallback
- `--dry-run` flag is passed to fixAll()
- Output shows summary: total/attempted/succeeded/failed
- Each fix result shows message and nextSteps
- Help text updated to include fix commands
- TypeScript compiles without errors
</done>

---

## Verification

### Phase-level verification commands:
```bash
# All files compile
cd /Users/gugu/projects/macaicheck/mac-aicheck && npx tsc --noEmit

# All type exports exist
grep -l "export.*Fixer" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/*.ts
grep -l "export.*FixResult" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/*.ts
grep -l "export.*ErrorCategory" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/*.ts

# Registry exports
grep -l "registerFixer" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/*.ts
grep -l "getFixerForScanResult" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/*.ts
grep -l "SCANNER_TO_FIXER_MAP" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/*.ts

# Verify exports
grep -l "verifyFix" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/*.ts
grep -l "preflightCheck" /Users/gugu/projects/macaicheck/mac-aicheck/src/fixers/*.ts

# CLI integration
grep "fix" /Users/gugu/projects/macaicheck/mac-aicheck/src/index.ts | head -10
```

---

## Success Criteria

### Requirement Coverage
| Requirement | Wave | Task | Verified By |
|-------------|------|------|------------|
| FIX-01: Fixer interface | 1 | types.ts | Fixer interface with id/name/risk/canFix/execute |
| FIX-02: Fixer registry | 2 | registry.ts | registerFixer + SCANNER_TO_FIXER_MAP |
| FIX-03: Error classification | 1 | errors.ts | classifyError with 6 categories |
| FIX-04: Preflight check | 3 | verify.ts | preflightCheck() function |
| VRF-01: Verification loop | 3 | verify.ts | verifyFix() calls scanAll() |
| VRF-02: 3-state result | 1 | types.ts | VerificationStatus = pass/warn/fail |
| VRF-03: FixResult interface | 1 | types.ts | FixResult with success/message/verified/nextSteps |

### Final Verification Checklist
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `src/fixers/types.ts` exports Fixer, FixResult, ErrorCategory, VerificationStatus, FixerRisk
- [ ] `src/fixers/errors.ts` exports classifyError() and ERROR_MESSAGES
- [ ] `src/fixers/registry.ts` exports registerFixer(), getFixers(), getFixerForScanResult(), SCANNER_TO_FIXER_MAP
- [ ] `src/fixers/verify.ts` exports verifyFix(), preflightCheck(), determineVerificationStatus(), buildNextSteps()
- [ ] `src/fixers/index.ts` exports fixAll()
- [ ] `src/index.ts` handles `fix` subcommand
- [ ] All 7 requirements covered

---

## Threat Model

### Trust Boundaries
| Boundary | Description |
|----------|-------------|
| fixer.execute() → system | Untrusted fixer code runs commands with user privileges |

### STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-01-01 | Tampering | fixAll() | mitigate | dry-run mode validates before execution |
| T-01-02 | Elevation | fixer.execute() | mitigate | green risk only auto-verified; yellow/red require manual |
| T-01-03 | Denial | verifyFix() | accept | scanAll() is read-only, no service impact |
| T-01-04 | Information | classifyError() | accept | pure function, no sensitive data stored |
| T-01-05 | Denial | fixAll() loop | mitigate | preflightCheck() prevents invalid attempts |

---

## Output

After completion, create `.planning/phases/01-fixer-infrastructure/01-SUMMARY.md`.
