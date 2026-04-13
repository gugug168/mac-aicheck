---
phase: "02"
plan: "02"
name: "02-diagnostic-guidance-layers-wave2"
tags: ["preflight", "guidance", "cli", "fixer-orchestration"]
dependency_graph:
  requires:
    - "02-01 (types, diagnostics module)"
  provides:
    - "runPreflights() function"
    - "PreflightResult interface"
    - "Preflight integration in fixAll"
    - "Guidance integration in fixAll"
    - "CLI verification command display"
  affects:
    - "src/fixers/preflight.ts"
    - "src/fixers/index.ts"
    - "src/index.ts"
tech_stack:
  added:
    - "runPreflights() async executor for sequential preflight checks"
    - "PreflightResult interface"
    - "getGuidance() integration in fixAll"
    - "getVerificationCommand() CLI display"
  patterns:
    - "Sequential preflight execution with early abort"
    - "Post-fix guidance pipeline (PST-01, PST-02, PST-03, PST-04)"
    - "Verification command display in CLI"
key_files:
  created:
    - "src/fixers/preflight.ts"
  modified:
    - "src/fixers/index.ts"
    - "src/index.ts"
decisions:
  - "runPreflights kept as standalone module per architecture (D-19 pattern)"
  - "Preflight checks abort on first failure (sequential, not parallel)"
  - "getGuidance() called after buildNextSteps to allow layering"
metrics:
  duration: "~2 minutes"
  completed_date: "2026-04-12T15:35:00Z"
---

# Phase 02 Plan 02 Summary: Preflight Executor and Integration

**One-liner:** Preflight executor with sequential checks, guidance integration in fixAll, and CLI verification command display

## Completed Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 4 | Create preflight.ts executor module | 82f531f | src/fixers/preflight.ts |
| 5 | Integrate preflight and guidance into fixers/index.ts | ca6429e | src/fixers/index.ts |
| 6 | Enhance CLI guidance display in src/index.ts | 6b822d8 | src/index.ts |

## What Was Built

### Task 4: preflight.ts Executor
- **runPreflights()**: Async function that executes preflightChecks sequentially
- **PreflightResult interface**: `{ passed, failedCheck?, message? }`
- Aborts on first failure, returns which check failed with message
- Standalone module (not in index.ts barrel) per architecture decision

### Task 5: fixers/index.ts Integration
- Added `import { runPreflights } from './preflight'`
- Replaced `preflightCheck()` with `await runPreflights(fixer, scanResult)` before fixer.execute()
- Added guidance integration after buildNextSteps:
  - `needsTerminalRestart` -> adds "请关闭当前终端并重新打开以使 PATH 生效"
  - `needsReboot` -> adds "系统配置已更新，请重启电脑使更改生效"
  - `verifyCommands` -> adds "请运行以下命令确认修复成功:" + commands
  - `notes` -> appends notes to nextSteps

### Task 6: CLI Enhancement
- Added `getFixerById` import from fixers/index
- In results loop: get fixer by `r.fixerId`, call `fixer.getVerificationCommand()`
- Display verification commands with "验证命令:" prefix before nextSteps
- Handles both single string and array return types from getVerificationCommand

## Verification

All verification commands from plan passed:
```
grep -n "runPreflights" src/fixers/preflight.ts  # Found
grep -n "PreflightResult" src/fixers/preflight.ts  # Found
grep -n "runPreflights" src/fixers/index.ts  # Found
grep -n "getGuidance" src/fixers/index.ts  # Found
grep -n "getVerificationCommand" src/index.ts  # Found
grep -n "验证命令" src/index.ts  # Found
npx tsc --noEmit  # No errors
```

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- **82f531f** feat(02-02): create preflight executor with runPreflights
- **ca6429e** feat(02-02): integrate preflight and guidance into fixAll
- **6b822d8** feat(02-02): enhance CLI with verification command display

## Self-Check

- [x] src/fixers/preflight.ts exists with runPreflights function
- [x] runPreflights is async, runs checks sequentially, aborts on first failure
- [x] fixers/index.ts imports and calls runPreflights before fixer.execute()
- [x] fixers/index.ts calls fixer.getGuidance() and integrates guidance into nextSteps
- [x] src/index.ts displays verification commands from getVerificationCommand()
- [x] TypeScript compiles without errors
- [x] All 3 commits exist

## Self-Check: PASSED
