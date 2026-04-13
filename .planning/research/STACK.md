# Fixer System Technology Stack

**Project:** mac-aicheck fixer/repair system
**Researched:** 2026/04/12
**Confidence:** MEDIUM (based on codebase patterns + established CLI conventions; web search unavailable for verification)

## Overview

This document recommends the technology stack for adding automatic fixers to mac-aicheck. The fixer system will repair issues detected by existing scanners (homebrew not installed, node version old, etc.).

## Recommended Stack

### Core Architecture

**Pattern:** Four-Stage Fixer Pipeline (per WinAICheck reference)

```
preflight → backup → execute → verify
```

This four-stage flow is already validated in WinAICheck (`src/fixers/index.ts`, ~500 lines). Each fixer follows this sequence to ensure safe, verifiable repairs.

### Core Types

```typescript
// src/fixers/types.ts

/**
 * Fixer lifecycle stages
 */
export type FixerStage = 'preflight' | 'backup' | 'execute' | 'verify';

/**
 * Risk levels for fixers (determines user confirmation requirements)
 */
export type FixerRisk = 'green' | 'yellow' | 'red';

/**
 * Fixer result status
 */
export type FixerStatus = 'success' | 'failed' | 'skipped' | 'partial';

/**
 * Event emitted during fixer execution (for progress reporting)
 */
export interface FixerEvent {
  stage: FixerStage;
  type: 'progress' | 'log' | 'done' | 'error' | 'warning';
  step?: string;       // e.g., "Backing up config..."
  pct?: number;        // 0-100 progress percentage
  line?: string;       // log output line
  success?: boolean;
  message?: string;
}

/**
 * Result of a single fixer execution
 */
export interface FixerResult {
  id: string;
  scannerId: string;   // Which scanner this fixer addresses
  status: FixerStatus;
  message: string;
  verificationResult?: {
    reScanned: boolean;
    scannerResult?: ScannerResult;  // Result after fix
    confirmed: boolean;             // Did the fix actually work?
  };
  error?: {
    stage: FixerStage;
    code: string;                  // Classified error code
    message: string;
    recoverable: boolean;           // Can retry help?
  };
}

/**
 * Main fixer interface
 */
export interface Fixer {
  id: string;
  name: string;
  description: string;
  risk: FixerRisk;                          // Green/Yellow/Red
  scannerId: string;                         // Which scanner this fixes
  needsAdmin: boolean;
  supported: () => Promise<boolean>;        // Can this run on this system?
  preflight: (onEvent: (e: FixerEvent) => void) => Promise<PreflightResult>;
  backup?: (onEvent: (e: FixerEvent) => void) => Promise<BackupResult>;
  execute: (onEvent: (e: FixerEvent) => void) => Promise<ExecuteResult>;
  verify: (onEvent: (e: FixerEvent) => void) => Promise<FixerResult>;
}

export interface PreflightResult {
  canProceed: boolean;
  reason?: string;
  checks: {
    name: string;
    passed: boolean;
    details?: string;
  }[];
}

export interface BackupResult {
  success: boolean;
  backupPath?: string;
  message: string;
}

export interface ExecuteResult {
  success: boolean;
  exitCode?: number;
  message: string;
  stdout?: string;
  stderr?: string;
}
```

### Registry Pattern

```typescript
// src/fixers/index.ts

const _fixers: Fixer[] = [];

export function registerFixer(fixer: Fixer): void {
  _fixers.push(fixer);
}

export function getFixers(): Fixer[] {
  return [..._fixers];
}

export function getFixerById(id: string): Fixer | undefined {
  return _fixers.find(f => f.id === id);
}

export function getFixerForScanner(scannerId: string): Fixer | undefined {
  return _fixers.find(f => f.scannerId === scannerId);
}

export function getFixersByRisk(risk: FixerRisk): Fixer[] {
  return _fixers.filter(f => f.risk === risk);
}
```

### Error Classification

**Purpose:** Classify command execution failures into actionable categories.

```typescript
// src/fixers/errors.ts

/**
 * Error codes for command execution failures
 * Used to determine retry strategy and user messaging
 */
export const ErrorCodes = {
  // Permission errors
  EACCES: 'permission_denied',
  EPERM: 'operation_not_permitted',
  EROOT: 'needs_root_admin',

  // Network errors
  ENETUNREACH: 'network_unreachable',
  ETIMEDOUT: 'network_timeout',
  ECONNREFUSED: 'connection_refused',
  ENOTFOUND: 'dns_lookup_failed',

  // Command errors
  ENOENT: 'command_not_found',
  EINVAL: 'invalid_arguments',
  ENOTDIR: 'not_a_directory',

  // Execution errors
  EAGAIN: 'resource_busy_retry',
  EMFILE: 'too_many_open_files',
  ENOSPC: 'disk_full',

  // Unknown
  UNKNOWN: 'unknown_error',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Classify a command execution error
 */
export function classifyError(error: any, stderr: string, exitCode: number): {
  code: ErrorCode;
  recoverable: boolean;
  suggestion: string;
} {
  // Check stderr for patterns first
  if (stderr.includes('Permission denied')) return { code: ErrorCodes.EACCES, recoverable: false, suggestion: '需要管理员权限' };
  if (stderr.includes('Operation not permitted')) return { code: ErrorCodes.EPERM, recoverable: false, suggestion: '系统阻止了该操作' };
  if (stderr.includes('command not found')) return { code: ErrorCodes.ENOENT, recoverable: false, suggestion: '命令不存在' };
  if (stderr.includes('No such file or directory')) return { code: ErrorCodes.ENOENT, recoverable: false, suggestion: '文件或目录不存在' };
  if (stderr.includes('Connection refused')) return { code: ErrorCodes.ECONNREFUSED, recoverable: true, suggestion: '连接被拒绝' };
  if (stderr.includes('ETIMEDOUT') || stderr.includes('timeout')) return { code: ErrorCodes.ETIMEDOUT, recoverable: true, suggestion: '连接超时' };

  // Check exit code
  if (exitCode === 127) return { code: ErrorCodes.ENOENT, recoverable: false, suggestion: '命令未找到' };
  if (exitCode === 1 && !stderr) return { code: ErrorCodes.UNKNOWN, recoverable: true, suggestion: '未知错误' };

  return { code: ErrorCodes.UNKNOWN, recoverable: true, suggestion: '请查看详细错误信息' };
}
```

### Verification Loop

**Purpose:** Re-run scanner after fix to confirm the problem is resolved.

```typescript
// src/fixers/verify.ts

import { scanAll } from '../scanners/index';
import type { Fixer, FixerResult, FixerEvent } from './types';
import type { ScannerResult } from '../scanners/types';

/**
 * Execute fixer with verification loop
 * Returns result after re-running scanner to confirm fix
 */
export async function runFixerWithVerification(
  fixer: Fixer,
  onEvent: (e: FixerEvent) => void
): Promise<FixerResult> {
  // Stage 1: Preflight checks
  onEvent({ stage: 'preflight', type: 'progress', step: '运行预检...', pct: 10 });
  const preflight = await fixer.preflight(onEvent);
  if (!preflight.canProceed) {
    return {
      id: fixer.id,
      scannerId: fixer.scannerId,
      status: 'skipped',
      message: `预检失败: ${preflight.reason}`,
      error: { stage: 'preflight', code: 'preflight_failed', message: preflight.reason || '', recoverable: false },
    };
  }

  // Stage 2: Backup (optional)
  let backupPath: string | undefined;
  if (fixer.backup) {
    onEvent({ stage: 'backup', type: 'progress', step: '正在备份...', pct: 30 });
    const backup = await fixer.backup(onEvent);
    if (!backup.success) {
      return {
        id: fixer.id,
        scannerId: fixer.scannerId,
        status: 'failed',
        message: `备份失败: ${backup.message}`,
        error: { stage: 'backup', code: 'backup_failed', message: backup.message, recoverable: false },
      };
    }
    backupPath = backup.backupPath;
  }

  // Stage 3: Execute
  onEvent({ stage: 'execute', type: 'progress', step: '正在修复...', pct: 60 });
  const execute = await fixer.execute(onEvent);
  if (!execute.success) {
    return {
      id: fixer.id,
      scannerId: fixer.scannerId,
      status: 'failed',
      message: `修复失败: ${execute.message}`,
      error: {
        stage: 'execute',
        code: 'execution_failed',
        message: execute.stderr || execute.message,
        recoverable: true,  // May be retryable
      },
    };
  }

  // Stage 4: Verify (re-run scanner)
  onEvent({ stage: 'verify', type: 'progress', step: '验证修复结果...', pct: 85 });
  const allScanners = await scanAll();
  const scannerResult = allScanners.find(s => s.id === fixer.scannerId);

  if (!scannerResult) {
    return {
      id: fixer.id,
      scannerId: fixer.scannerId,
      status: 'partial',
      message: '无法找到对应的扫描器进行验证',
      verificationResult: { reScanned: false, confirmed: false },
    };
  }

  const confirmed = scannerResult.status === 'pass';
  return {
    id: fixer.id,
    scannerId: fixer.scannerId,
    status: confirmed ? 'success' : 'partial',
    message: confirmed ? '修复成功' : `修复完成但验证未通过: ${scannerResult.message}`,
    verificationResult: {
      reScanned: true,
      scannerResult,
      confirmed,
    },
  };
}
```

### Risk-Based Confirmation

**Purpose:** Require user confirmation for yellow/red risk fixers.

```typescript
// src/fixers/risk.ts

import type { FixerRisk } from './types';

export interface RiskConfig {
  requiresConfirmation: boolean;
  canAutoFix: boolean;
  timeout: number;  // ms
  maxRetries: number;
}

export const RiskConfigs: Record<FixerRisk, RiskConfig> = {
  green: {
    requiresConfirmation: false,  // Auto-fix
    canAutoFix: true,
    timeout: 60_000,               // 1 minute
    maxRetries: 0,                 // No retry for green
  },
  yellow: {
    requiresConfirmation: true,    // Ask user
    canAutoFix: false,
    timeout: 120_000,              // 2 minutes
    maxRetries: 1,
  },
  red: {
    requiresConfirmation: true,    // Explicit user consent
    canAutoFix: false,
    timeout: 300_000,              // 5 minutes
    maxRetries: 2,
  },
};
```

### Supported Technologies

| Purpose | Technology | Why |
|---------|------------|-----|
| TypeScript | Same as project | Consistent codebase |
| child_process | Node.js built-in | Command execution (already used in executor) |
| Registry pattern | Custom | Follows existing Scanner/Installer patterns |

## Example Fixer Implementation

```typescript
// src/fixers/brewcask.ts

import { runCommand, commandExists } from '../executor';
import { registerFixer } from './index';
import type { Fixer, FixerEvent, FixerResult } from './types';
import { runFixerWithVerification } from './verify';
import { classifyError } from './errors';

const brewCaskFixer: Fixer = {
  id: 'fix-brew-cask',
  name: 'Install Homebrew Cask',
  description: 'Install missing Homebrew Cask support',
  risk: 'green',
  scannerId: 'brew-cask',  // Links to scanner that detected issue
  needsAdmin: false,

  supported: async () => {
    return commandExists('brew');
  },

  preflight: async (onEvent) => {
    const checks = [
      { name: 'brew_exists', passed: commandExists('brew'), details: 'Homebrew is installed' },
      { name: 'can_write_brew_prefix', passed: true, details: 'Can write to /usr/local' },
    ];
    const canProceed = checks.every(c => c.passed);
    return { canProceed, checks, reason: canProceed ? undefined : 'Prerequisites not met' };
  },

  execute: async (onEvent) => {
    try {
      const { stdout, stderr, exitCode } = await runCommand('brew install brew-cask');
      onEvent({ stage: 'execute', type: 'log', line: stdout });

      if (exitCode !== 0) {
        const error = classifyError({}, stderr, exitCode);
        onEvent({ stage: 'execute', type: 'error', message: error.suggestion });
        return { success: false, exitCode, message: stderr || 'Installation failed', stderr };
      }

      return { success: true, exitCode: 0, message: 'brew-cask installed successfully' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  },

  verify: async (onEvent) => {
    return runFixerWithVerification(brewCaskFixer, onEvent);
  },
};

registerFixer(brewCaskFixer);
```

## Comparison with Installer Pattern

The Fixer interface closely follows the existing Installer interface but with key differences:

| Aspect | Installer | Fixer |
|--------|-----------|-------|
| Trigger | Manual (user clicks) | Can be automatic or manual |
| Verification | None (assume success) | Re-runs scanner to confirm |
| Risk levels | needsAdmin only | green/yellow/red classification |
| Error handling | Basic success/fail | Classified errors with suggestions |
| Stages | Single `run()` | preflight/backup/execute/verify |
| Idempotency | Check if installed first | Preflight checks + verification |

## Sources

- **Project context:** WinAICheck reference implementation (`src/fixers/index.ts` ~500 lines, four-stage flow: preflight/backup/execute/verify)
- **Pattern origin:** Established CLI fixer conventions (npm doctor, yarn repair, pnpm doctor)
- **Codebase patterns:** Existing `Installer` interface in `src/installers/index.ts`, `Scanner` registry in `src/scanners/registry.ts`

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Interface design | MEDIUM | Follows existing Installer pattern; WinAICheck reference validates approach |
| Error classification | MEDIUM | Based on standard Unix error codes + CLI conventions |
| Verification loop | MEDIUM | Logical extension of existing patterns; WinAICheck validates |
| Risk levels | MEDIUM | Project-specific design choice |

## Gaps Needing Research

- How WinAICheck specifically implements the four-stage flow (would need access to WinAICheck repo)
- npm/pnpm/yarn self-repair CLI documentation (web search unavailable for verification)
- Specific error message patterns for macOS commands (would need testing)
