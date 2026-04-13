# Fixer System Architecture

**Domain:** macOS repair/fix automation
**Project:** mac-aicheck fixer integration
**Researched:** 2026/04/12
**Confidence:** MEDIUM (synthesized from known patterns; no external search available)

## Problem Statement

Extend the existing scanner pattern (16 self-registering scanners) to support automated repair actions. The fixer system should:

1. Map scan results to repair actions
2. Execute fixes with safety rails (preflight, backup, verify)
3. Integrate with the existing `scanAll()` paradigm

---

## Recommended Architecture

### Component Overview

```
src/
├── fixers/
│   ├── registry.ts      # Fixer registration (mirrors scanner registry)
│   ├── types.ts         # FixerResult, FixerPhase, FixerConfig types
│   ├── index.ts         # fixAll(), runFixer() orchestration
│   ├── phases/          # Phase handlers
│   │   ├── preflight.ts # Prerequisite checks
│   │   ├── backup.ts    # State capture for rollback
│   │   ├── execute.ts   # Run repair commands
│   │   └── verify.ts    # Confirm fix succeeded
│   └── fixers/          # Individual fixer modules (one per scanner)
│       ├── homebrew.ts
│       ├── xcode.ts
│       └── ...
```

### Scanner-to-Fixer Mapping

**Recommendation: 1:1 with Optional Fan-out**

| Scanner | Can Fix? | Fixer ID | Notes |
|---------|----------|----------|-------|
| homebrew | Yes | homebrew | Reinstall/doctor |
| xcode | Yes | xcode | xcode-select --install |
| node-version | Yes | node-version | nvm install, etc. |
| npm-mirror | Yes | npm-mirror | npm config set registry |
| git | Yes | git | Homebrew upgrade git |
| rosetta | Yes | rosetta | softwareupdate --install-rosetta |
| developer-mode | No | - | Requires recovery mode |
| screen-permission | No | - | Requires user GUI action |
| ... | ... | ... | ... |

**Rationale:**
- 1:1 keeps the mental model simple: each scanner has an optional fixer
- Some fixers will legitimately have no action (e.g., permission-based issues)
- 1:many only makes sense if you have compound fixes (e.g., "fix-all-dev-tools")

---

## Core Types

```typescript
// src/fixers/types.ts

export type FixerPhase = 'preflight' | 'backup' | 'execute' | 'verify';

export type FixerStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface FixerResult {
  fixerId: string;
  scannerId: string;           // Links to the originating scanner
  status: FixerStatus;
  phase: FixerPhase;           // Last completed phase
  message: string;
  details?: string;
  backupPath?: string;          // Where state was backed up
  commands?: string[];          // Commands that were executed
}

export interface FixerConfig {
  timeout: number;             // Max ms for entire fixer
  backupEnabled: boolean;      // Whether to capture state
  rollbackOnFailure: boolean;  // Restore backup if verify fails
}

export interface Fixer {
  id: string;
  scannerId: string;           // Which scanner this fixes
  config: FixerConfig;

  // Phase handlers (all optional)
  preflight?(scanResult: ScanResult): Promise<{ canProceed: boolean; message?: string }>;
  backup?(scanResult: ScanResult): Promise<{ backupPath?: string; message?: string }>;
  execute(scanResult: ScanResult): Promise<{ commands: string[]; message?: string }>;
  verify(scanResult: ScanResult): Promise<{ fixed: boolean; message?: string }>;
}
```

---

## Phase Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         runFixer(scannerId)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐        │
│  │   PREFLIGHT  │ -> │    BACKUP    │ -> │   EXECUTE    │        │
│  └──────────────┘    └──────────────┘    └──────────────┘        │
│        │                  │                   │                  │
│        v                  v                   v                  │
│  Check prerequisites  Capture state    Run repair cmds         │
│  - Admin perms        - Config files   - idempotent ops         │
│  - Tool availability  - Registry vals   - capture stdout        │
│  - Space available    - Symlinks                                     │
│                                                                 │
│                         ┌──────────────┐                         │
│                         │    VERIFY    │                         │
│                         └──────────────┘                         │
│                               │                                  │
│                               v                                  │
│                    Confirm scan status changed                  │
│                    to 'pass' (or accept 'warn')                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Phase Details

| Phase | Purpose | Fail Behavior |
|-------|---------|---------------|
| **preflight** | Verify fixer can run | Skip fixer (don't attempt) |
| **backup** | Capture state for rollback | Abort if capture fails |
| **execute** | Run repair commands | Proceed to verify |
| **verify** | Confirm fix worked | Rollback if configured |

---

## Registry Pattern (Mirrors Scanners)

```typescript
// src/fixers/registry.ts

import type { Fixer } from './types';

const _fixers: Fixer[] = [];

export function registerFixer(fixer: Fixer): void {
  _fixers.push(fixer);
}

export function getFixerByScannerId(scannerId: string): Fixer | undefined {
  return _fixers.find(f => f.scannerId === scannerId);
}

export function getFixers(): Fixer[] {
  return [..._fixers];
}

export function clearFixers(): void {
  _fixers.length = 0;
}
```

### Individual Fixer Example

```typescript
// src/fixers/fixers/homebrew.ts

import { registerFixer } from '../registry';
import type { Fixer, ScanResult } from '../types';
import { runCommand } from '../../executor';

const fixer: Fixer = {
  id: 'fix-homebrew',
  scannerId: 'homebrew',
  config: {
    timeout: 120_000,
    backupEnabled: true,
    rollbackOnFailure: true,
  },

  async preflight(scanResult: ScanResult): Promise<{ canProceed: boolean }> {
    // Must have admin privileges
    const isAdmin = runCommand('id -u', 3000).stdout.trim() === '0';
    return { canProceed: isAdmin };
  },

  async backup(): Promise<{ backupPath: string }> {
    const backupDir = `/tmp/mac-aicheck/backup/homebrew-${Date.now()}`;
    runCommand(`mkdir -p ${backupDir} && cp -r $(brew --prefix)/Library .`, 10000);
    return { backupPath: backupDir };
  },

  async execute(): Promise<{ commands: string[] }> {
    const commands = ['brew update', 'brew upgrade'];
    for (const cmd of commands) {
      runCommand(cmd, 60_000);
    }
    return { commands };
  },

  async verify(): Promise<{ fixed: boolean }> {
    const { exitCode } = runCommand('brew --version', 5000);
    return { fixed: exitCode === 0 };
  },
};

registerFixer(fixer);
```

---

## Integration with scanAll()

```typescript
// src/fixers/index.ts

import { getFixers, getFixerByScannerId } from './registry';
import { getScanners } from '../scanners';
import type { FixerResult, ScanResult } from './types';
import { runCommand, isAdmin } from '../executor';

export async function scanAll(): Promise<ScanResult[]> {
  // Existing scanner logic
  const scanners = getScanners();
  return Promise.all(scanners.map(s => s.scan()));
}

/**
 * Run fixers for all failed/warn scanners
 */
export async function fixAll(
  scanResults: ScanResult[],
  options: { autoBackup?: boolean; dryRun?: boolean } = {}
): Promise<FixerResult[]> {
  const results: FixerResult[] = [];

  for (const scanResult of scanResults) {
    if (scanResult.status === 'pass') continue;

    const fixer = getFixerByScannerId(scanResult.id);
    if (!fixer) {
      results.push({
        fixerId: 'none',
        scannerId: scanResult.id,
        status: 'skipped',
        phase: 'preflight',
        message: `No fixer registered for scanner: ${scanResult.id}`,
      });
      continue;
    }

    const result = await runFixer(fixer, scanResult, options);
    results.push(result);
  }

  return results;
}

export async function runFixer(
  fixer: Fixer,
  scanResult: ScanResult,
  options: { dryRun?: boolean } = {}
): Promise<FixerResult> {
  const result: FixerResult = {
    fixerId: fixer.id,
    scannerId: fixer.scannerId,
    status: 'running',
    phase: 'preflight',
    message: 'Starting fixer',
    commands: [],
  };

  // 1. Preflight
  if (fixer.preflight) {
    const pre = await fixer.preflight(scanResult);
    if (!pre.canProceed) {
      result.status = 'skipped';
      result.message = pre.message || 'Preflight check failed';
      return result;
    }
  }

  // 2. Backup
  if (fixer.backup && fixer.config.backupEnabled) {
    result.phase = 'backup';
    const backup = await fixer.backup(scanResult);
    result.backupPath = backup.backupPath;
    result.message = backup.message || 'Backup complete';
  }

  // 3. Execute
  if (options.dryRun) {
    result.status = 'skipped';
    result.message = 'Dry run - no changes made';
    return result;
  }

  result.phase = 'execute';
  try {
    const exec = await fixer.execute(scanResult);
    result.commands = exec.commands;
    result.message = exec.message || 'Execution complete';
  } catch (err: any) {
    result.status = 'failed';
    result.message = `Execute failed: ${err.message}`;
    return result;
  }

  // 4. Verify
  result.phase = 'verify';
  try {
    const verify = await fixer.verify(scanResult);
    result.status = verify.fixed ? 'success' : 'failed';
    result.message = verify.message || (verify.fixed ? 'Fix verified' : 'Verification failed');
  } catch (err: any) {
    result.status = 'failed';
    result.message = `Verify failed: ${err.message}`;
  }

  return result;
}
```

---

## Component Boundaries

| Component | Responsibility | Knows About |
|-----------|---------------|------------|
| `scanners/` | Detection only | Nothing about fixers |
| `fixers/` | Repair only | Scanners (via scannerId), executor |
| `executor/` | Command execution | Nothing about scanners/fixers |
| `report/` | Output generation | Both ScanResult and FixerResult |

**Key Principle:** Scanners do NOT know about fixers. This preserves single responsibility and allows scanners to be used without fixer overhead.

---

## Anti-Patterns to Avoid

### 1. Scanner-Fixer Coupling
**Bad:** Scanner imports and calls fixer directly
```typescript
// DON'T DO THIS
if (status === 'fail') {
  const fixer = await import(`../fixers/${id}`);
  await fixer.run();
}
```
**Why:** Violates SRP, creates circular deps, makes testing hard

### 2. Automatic Fix Without Verification
**Bad:** Execute fixer and assume it worked
```typescript
await fixer.execute(scanResult);
return { status: 'success' }; // NO!
```
**Why:** Silent failures leave system in broken state

### 3. No Backup for Destructive Fixes
**Bad:** Overwrite configs without saving state
**Why:** If fix breaks something worse, no rollback path

### 4. Blocking All Fixers on One Failure
**Bad:** Run fixers sequentially, abort on any failure
**Why:** User loses time on fixes that would have worked

---

## Scalability Considerations

| Scale | Approach |
|-------|----------|
| 16 fixers, local | Run sequentially or parallel with concurrency limit |
| 100+ fixers, CI/CD | Queue-based, run in batches |
| Distributed | Not applicable (local macOS tool) |

**For mac-aicheck:** Sequential with clear progress reporting is sufficient.

---

## Sources

- **Confidence: MEDIUM** - Patterns synthesized from:
  - Chef/Puppet resource definition patterns
  - Docker health-check + self-healing patterns
  - Kubernetes controller reconciliation loops
  - Ansible idempotent task design
  - No external web search available at time of research
