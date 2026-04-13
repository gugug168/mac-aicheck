# Phase 2: Diagnostic & Guidance Layers - Research

**Researched:** 2026-04-12
**Domain:** Fixer diagnostic infrastructure, preflight checks, post-fix guidance
**Confidence:** HIGH

## Summary

Phase 2 extends the Phase 1 fixer infrastructure with three focused additions: (1) PostFixGuidance interface that provides actionable restart/verification guidance after fixes, (2) PreflightCheck system that validates preconditions before attempting fixes, and (3) Enhanced diagnostics with error codes, recoverable flags, and context.

The phase builds on the established self-registration pattern and Phase 1's `classifyError()` + `ERROR_MESSAGES` foundation. All new interfaces are optional extensions to avoid breaking existing fixer implementations. The key architectural decision is that guidance flows through `FixResult.nextSteps` rather than a separate channel, keeping the data model consistent.

**Primary recommendation:** Implement `PostFixGuidance` as an optional interface that fixers return via `getGuidance()`, integrate preflight checks as an array on the Fixer interface, and extend `ClassifiedError` with `code`/`recoverable`/`context` fields while preserving backward compatibility.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-13:** `Fixer.getGuidance()` method — optional `getGuidance(): PostFixGuidance` on Fixer interface
- **D-14:** Guidance display timing — `fixAll()` returns guidance in `FixResult.nextSteps`, CLI handles display
- **D-15:** `Fixer.preflightChecks: PreflightCheck[]` — optional array on Fixer interface
- **D-16:** PreflightCheck structure — `{ id: string; check: async () => { pass: boolean; message?: string } }`
- **D-17:** Preflight executor — `src/fixers/preflight.ts` provides `runPreflights(fixer, scanResult)`
- **D-18:** Extend ClassifiedError — add `code`, `recoverable`, `context` fields
- **D-19:** diagnostics module — `src/fixers/diagnostics.ts` combines classifyError + ERROR_MESSAGES
- **D-20:** `Fixer.getVerificationCommand()` method — optional returning `string | string[]`
- **D-21:** Verification command display — CLI layer retrieves from Fixer.getVerificationCommand()
- **D-22:** CLI layer responsibility — `src/index.ts` fix command formats guidance display

### Claude's Discretion

- Exact Chinese wording for guidance messages
- How to structure the diagnostics.ts module internally
- Where exactly to hook preflight execution in fixAll()
- Error code taxonomy (specific code numbers)

### Deferred Ideas

None — discussion stayed within phase scope.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DIA-01 | Error category maps to Chinese message + recovery suggestion | Extends ERROR_MESSAGES in errors.ts, new diagnostics.ts module |
| DIA-02 | PreflightCheck — configurable preflight rules (brew available? network up? write permissions?) | PreflightCheck type + runPreflights() in new preflight.ts |
| DIA-03 | Diagnostic display — precise next steps when fix fails | Extends ClassifiedError with code/context, diagnostics.ts provides formatted output |
| PST-01 | PostFixGuidance interface — needsTerminalRestart, needsReboot, verifyCommands, notes | New PostFixGuidance interface in types.ts |
| PST-02 | Terminal restart — PATH changes, brew install | Guidance needsTerminalRestart field |
| PST-03 | System reboot — system-level changes | Guidance needsReboot field |
| PST-04 | Manual verification commands — commands for user to confirm fix | Fixer.getVerificationCommand() + CLI display |

---

## Standard Stack

### Core (no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | (project default) | Type safety | strict: true in tsconfig.json |
| Node.js async/await | — | Async preflight execution | Standard pattern, no external promises library |

### No New Dependencies
Phase 2 uses only existing project infrastructure:
- `src/executor/index.ts` for command existence checks in preflights
- Existing `classifyError()` pattern for error classification
- Phase 1 `verifyFix()` for verification loop

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

```
src/fixers/
├── types.ts          # Extended: PostFixGuidance, PreflightCheck, extended ClassifiedError
├── errors.ts         # Extended: code field on ClassifiedError
├── diagnostics.ts    # NEW: combines classifyError + ERROR_MESSAGES for CLI
├── preflight.ts      # NEW: runPreflights() executor
├── registry.ts       # Unchanged
├── verify.ts         # Extended: buildNextSteps integrates guidance
├── index.ts          # Extended: fixAll() calls preflights, includes guidance
└── *.ts              # Individual fixer implementations (Phase 3/4)
```

### Pattern 1: Optional Interface Extension

**What:** Fixer interface gets optional methods/properties that fixers may or may not implement.

**When to use:** When some fixers need special behavior (guidance, verification commands) but not all.

**Example:**
```typescript
// types.ts
export interface PostFixGuidance {
  needsTerminalRestart: boolean;
  needsReboot: boolean;
  verifyCommands?: string[];
  notes?: string[];
}

export interface PreflightCheck {
  id: string;
  check: () => Promise<{ pass: boolean; message?: string }>;
}

export interface Fixer {
  id: string;
  name: string;
  risk: FixerRisk;
  canFix(scanResult: ScanResult): boolean;
  execute(scanResult: ScanResult, dryRun?: boolean): Promise<FixResult>;
  scannerIds?: string[];
  // Optional extensions
  preflightChecks?: PreflightCheck[];
  getGuidance?: () => PostFixGuidance | undefined;
  getVerificationCommand?: () => string | string[] | undefined;
}
```

### Pattern 2: Guidance Flow Through nextSteps

**What:** PostFixGuidance is serialized into `FixResult.nextSteps` rather than a separate field.

**Why:** Keeps FixResult flat, CLI only needs to iterate `nextSteps[]` to display all guidance.

**Example:**
```typescript
// In fixAll(), after fixer.execute():
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
```

### Pattern 3: Preflight Execution Model

**What:** Preflights run sequentially, first failure stops execution.

**When to use:** When preconditions must be checked in order and any failure should abort.

**Example:**
```typescript
// preflight.ts
export async function runPreflights(
  fixer: Fixer,
  scanResult: ScanResult
): Promise<{ passed: boolean; failedCheck?: PreflightCheck; message?: string }> {
  const checks = fixer.preflightChecks || [];
  for (const check of checks) {
    const result = await check.check();
    if (!result.pass) {
      return { passed: false, failedCheck: check, message: result.message };
    }
  }
  return { passed: true };
}
```

### Pattern 4: Enhanced ClassifiedError with Code

**What:** Extend ClassifiedError to include machine-readable `code` for programmatic handling.

**Example:**
```typescript
// errors.ts
export interface ClassifiedError {
  category: ErrorCategory;
  code: string;           // e.g., "ERR_TIMEOUT_001"
  recoverable: boolean;
  message: string;
  context?: string;       // additional diagnostic context
}

// classifyError returns:
{
  category: 'timeout',
  code: 'ERR_TIMEOUT_001',
  recoverable: true,
  message: 'Command timed out',
  context: 'Command: brew install; Duration: 300s exceeded'
}
```

### Anti-Patterns to Avoid

- **Don't make guidance a required field** — Some fixers (future red-risk) may not provide guidance; use optional chaining (`?.`)
- **Don't run preflights in parallel** — Sequential allows early exit on first failure; parallel wastes computation
- **Don't create separate guidance display channel** — Keep it in `nextSteps[]` for consistent CLI handling
- **Don't extend Fixer.execute() signature** — Keep interface backward-compatible; guidance comes from separate `getGuidance()` call

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Error code taxonomy | Custom error code system | Structured `ErrorCategory` enum + code suffix | Avoids inconsistent codes across fixers |
| Preflight check framework | Custom check runner | `runPreflights()` in preflight.ts | Standardizes check interface |
| Guidance formatting | Each fixer formats own guidance | PostFixGuidance interface | Consistent structure for CLI |
| Chinese error messages | Inline strings in fixer code | ERROR_MESSAGES + diagnostics.ts | Centralized, maintainable |

---

## Runtime State Inventory

> Step 2.5: N/A — Phase 2 is pure interface/type extension, no rename/migration/refactor.

This phase only modifies TypeScript interfaces and adds new module files. No runtime state (databases, environment variables, OS registrations, build artifacts) is affected.

**Verification:** All changes are compile-time only (`src/fixers/types.ts`, `src/fixers/errors.ts`, new `src/fixers/diagnostics.ts`, new `src/fixers/preflight.ts`).

---

## Common Pitfalls

### Pitfall 1: Circular Dependencies via index.ts Re-exports
**What goes wrong:** Adding `diagnostics.ts` and `preflight.ts` to `fixers/index.ts` barrel file causes circular imports if they import from `errors.ts` or `types.ts`.

**Why it happens:** index.ts re-exports everything; preflight.ts needs `ScanResult` type; errors.ts and types.ts have cross-imports.

**How to avoid:** Keep `diagnostics.ts` and `preflight.ts` as standalone modules that are NOT re-exported from index.ts. Fixers import them directly when needed.

### Pitfall 2: Breaking Existing Fixer Implementations
**What goes wrong:** Adding required fields to `Fixer` interface breaks existing fixer implementations (homebrew, git, etc. in Phase 3/4).

**Why it happens:** TypeScript interfaces with required fields cause compile errors for implementers.

**How to avoid:** All Phase 2 additions to Fixer interface are **optional** (`?:`). Existing fixers compile without changes.

### Pitfall 3: Preflight Execution Blocking Real Fixes
**What goes wrong:** Preflights that make network calls or run commands slow down the fix process significantly.

**Why it happens:** Each preflight check runs sequentially before any fix executes.

**How to avoid:** Keep preflight checks fast (sub-second). If a preflight needs network, cache the result or make it optional.

### Pitfall 4: Guidance Displayed Before Verification
**What goes wrong:** CLI shows "needs terminal restart" guidance even when the fix failed.

**Why it happens:** fixAll() adds guidance to nextSteps before verification completes.

**How to avoid:** Only add guidance from `getGuidance()` after verification status is determined, or flag guidance as conditional in nextSteps.

---

## Code Examples

### PostFixGuidance Implementation (homebrew fixer example)

```typescript
// In src/fixers/homebrew.ts (Phase 3 implementation)
const homebrewFixer: Fixer = {
  id: 'homebrew-fixer',
  name: 'Homebrew Installer',
  risk: 'green',
  scannerIds: ['homebrew'],

  canFix(scanResult: ScanResult): boolean {
    return scanResult.id === 'homebrew' && scanResult.status === 'fail';
  },

  async execute(scanResult: ScanResult, dryRun?: boolean): Promise<FixResult> {
    if (dryRun) {
      return { success: true, message: '[dry-run] Would install Homebrew', verified: false };
    }
    // ... install logic
    return { success: true, message: 'Homebrew installed', verified: false };
  },

  getGuidance(): PostFixGuidance {
    return {
      needsTerminalRestart: true,  // PATH needs new terminal
      needsReboot: false,
      verifyCommands: ['brew doctor', 'brew --version'],
      notes: ['Homebrew已安装到 /opt/homebrew (Apple Silicon) 或 /usr/local (Intel)'],
    };
  },
};
```

### PreflightCheck for Network Dependency

```typescript
// Example preflight for network-dependent fixer
const networkPreflight: PreflightCheck = {
  id: 'network-available',
  check: async () => {
    try {
      const result = await runCommand('curl -s --max-time 5 https://brew.sh');
      return { pass: result.exitCode === 0 };
    } catch {
      return { pass: false, message: '网络不可用，请检查网络连接' };
    }
  },
};
```

### Diagnostics Module Usage

```typescript
// src/fixers/diagnostics.ts
import { classifyError, ERROR_MESSAGES } from './errors';

export interface DiagnosticResult {
  code: string;
  title: string;
  suggestion: string;
  recoverable: boolean;
  context?: string;
}

export function diagnose(
  exitCode: number,
  stderr: string,
  errorMessage?: string,
  context?: string
): DiagnosticResult {
  const classified = classifyError(exitCode, stderr, errorMessage);
  const msg = ERROR_MESSAGES[classified.category];
  const code = `ERR_${classified.category.toUpperCase().replace(/-/g, '_')}_001`;

  return {
    code,
    title: msg.title,
    suggestion: msg.suggestion,
    recoverable: classified.recoverable,
    context,
  };
}
```

### CLI Guidance Display (src/index.ts)

```typescript
// Current fix command handler (existing), guidance display is additive
if (r.fixResult?.nextSteps?.length) {
  for (const step of r.fixResult.nextSteps) {
    console.log(`    -> ${step}`);
  }
}

// Enhanced: Display verification commands separately if present
const verificationCmd = fixer?.getVerificationCommand?.();
if (verificationCmd) {
  const cmds = Array.isArray(verificationCmd) ? verificationCmd : [verificationCmd];
  console.log('    验证命令:');
  cmds.forEach(cmd => console.log(`      ${cmd}`));
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Generic error messages | ERROR_MESSAGES with Chinese titles/suggestions | Phase 1 | Users get actionable feedback |
| No preflight checks | Optional PreflightCheck array on Fixer | Phase 2 | Avoids failing fixes on known bad states |
| Hardcoded nextSteps | PostFixGuidance interface with typed fields | Phase 2 | Consistent guidance structure |
| No verification commands | getVerificationCommand() optional method | Phase 2 | Users can confirm fix success |

**Deprecated/outdated:**
- None in Phase 2 scope.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | PreflightCheck.check() is sync or fast async (<1s) | Common Pitfalls | Slow preflights block entire fixAll() |
| A2 | Fixers don't need guidance at canFix() time | Architecture | If yes, need preflight guidance display |
| A3 | All guidance fits in nextSteps[] array | Pattern 2 | If not, need separate guidance field in FixResult |

---

## Open Questions

1. **Error code taxonomy granularity**
   - What we know: 6 error categories exist, need machine-readable codes
   - What's unclear: Should codes be `ERR_TIMEOUT_001` format? Do we need sub-codes per fixer?
   - Recommendation: Use `ERR_${CATEGORY}_NNN` format, NNN is generic counter (001, 002, etc.)

2. **Preflight failure behavior**
   - What we know: First failed preflight should stop fixer execution
   - What's unclear: Should failed preflight add its message to FixResult.error or nextSteps?
   - Recommendation: Add to `error` field so CLI treats it as a failure state

3. **Guidance for yellow/red risk fixers**
   - What we know: Phase 4 yellow fixers need guidance but may not auto-fix
   - What's unclear: Should guidance appear before user confirms the fix action?
   - Recommendation: Yes — show guidance as part of the confirmation prompt

---

## Environment Availability

**Step 2.6: SKIPPED** — Phase 2 is pure TypeScript interface/type changes with no external dependencies. No tools, services, runtimes, or CLI utilities are required beyond the existing Node.js/TypeScript build environment.

---

## Validation Architecture

> nyquist_validation is explicitly `false` in config.json — section skipped.

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | PreflightCheck results validated before use |
| V4 Access Control | no | fixAll() operates on local state only |

### Applicable Threats

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious preflight check | Tampering | Preflights are fixer-provided but run in user context only |
| Guidance injection | Information | Guidance comes from fixer code, not user input |
| Error message disclosure | Information | ERROR_MESSAGES are hardcoded, no user data in error responses |

---

## Sources

### Primary (HIGH confidence)
- `src/fixers/types.ts` — Fixer interface, FixResult, VerificationStatus types [VERIFIED: source code]
- `src/fixers/errors.ts` — classifyError(), ERROR_MESSAGES [VERIFIED: source code]
- `src/fixers/verify.ts` — preflightCheck(), buildNextSteps() [VERIFIED: source code]
- `src/fixers/index.ts` — fixAll() orchestration [VERIFIED: source code]
- 02-CONTEXT.md — Phase 2 decisions D-13 through D-22 [VERIFIED: planning doc]

### Secondary (MEDIUM confidence)
- `.planning/research/SUMMARY.md` — WinAICheck four-stage model context

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pure TypeScript, no new dependencies
- Architecture: HIGH — follows established Phase 1 patterns
- Pitfalls: MEDIUM — edge cases around guidance timing unverified

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (30 days — Phase 2 interfaces are stable TypeScript)
