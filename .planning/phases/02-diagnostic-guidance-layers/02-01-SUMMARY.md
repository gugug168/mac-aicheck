---
phase: "02"
plan: "01"
name: "02-diagnostic-guidance-layers-wave1"
tags: ["diagnostics", "type-system", "error-classification"]
dependency_graph:
  requires: []
  provides:
    - "DiagnosticResult interface"
    - "diagnose() function"
    - "PostFixGuidance interface"
    - "PreflightCheck interface"
    - "Extended Fixer interface"
    - "Extended ClassifiedError"
  affects:
    - "src/fixers/types.ts"
    - "src/fixers/errors.ts"
    - "src/fixers/diagnostics.ts"
tech_stack:
  added:
    - "DiagnosticResult interface"
    - "diagnose() function combining classifyError + ERROR_MESSAGES"
    - "formatDiagnostic() for CLI output"
    - "PostFixGuidance interface"
    - "PreflightCheck interface"
  patterns:
    - "Error code generation (ERR_*_###)"
    - "Diagnostic pipeline (classify + translate + format)"
key_files:
  created:
    - "src/fixers/diagnostics.ts"
  modified:
    - "src/fixers/types.ts"
    - "src/fixers/errors.ts"
decisions:
  - "Error codes use format ERR_{CATEGORY}_{3-digit-code} for programmatic handling"
  - "diagnostics.ts kept as standalone module per D-19 architecture"
  - "PreflightCheck.check returns pass boolean + optional message"
metrics:
  duration: "~3 minutes"
  completed_date: "2026-04-12T15:33:19Z"
---

# Phase 02 Plan 01 Summary: Type System Extensions and Diagnostics Module

**One-liner:** Type foundations for diagnostic system — PostFixGuidance, PreflightCheck, error codes, and diagnose() function

## Completed Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Extend types.ts with PostFixGuidance, PreflightCheck, extended Fixer | 9a84e24 | src/fixers/types.ts |
| 2 | Extend errors.ts with code, recoverable, context on ClassifiedError | cc9e571 | src/fixers/errors.ts |
| 3 | Create diagnostics.ts module combining classifyError + ERROR_MESSAGES | 8d7575f | src/fixers/diagnostics.ts |

## What Was Built

### Task 1: types.ts Extensions
- **PostFixGuidance interface**: `needsTerminalRestart`, `needsReboot`, `verifyCommands?`, `notes?`
- **PreflightCheck interface**: `id` + `check()` async function returning `{ pass, message? }`
- **Extended Fixer interface**: Added optional `preflightChecks`, `getGuidance()`, `getVerificationCommand()`

### Task 2: errors.ts Extensions
- **Extended ClassifiedError**: Added `code` (e.g., `ERR_TIMEOUT_001`) and `context` fields
- **Updated classifyError()**: All 6 return statements now include code and context
- Error codes follow format `ERR_{CATEGORY}_{3-digit-code}`

### Task 3: diagnostics.ts Module
- **DiagnosticResult interface**: `code`, `title`, `suggestion`, `recoverable`, `context?`
- **diagnose() function**: Combines `classifyError()` + `ERROR_MESSAGES` into complete diagnostic
- **formatDiagnostic() function**: CLI-friendly formatted output with Chinese suggestions

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- **9a84e24** feat(02-01): extend Fixer interface with PostFixGuidance, PreflightCheck
- **cc9e571** feat(02-01): extend ClassifiedError with code and context fields
- **8d7575f** feat(02-01): create diagnostics module combining classifyError + ERROR_MESSAGES

## Self-Check

- [x] src/fixers/types.ts contains PostFixGuidance with all 4 fields
- [x] src/fixers/types.ts contains PreflightCheck with id and check
- [x] Fixer interface has optional preflightChecks, getGuidance, getVerificationCommand
- [x] src/fixers/errors.ts ClassifiedError has code, recoverable, context
- [x] classifyError() returns code for all 6 error categories
- [x] src/fixers/diagnostics.ts exists with DiagnosticResult interface and diagnose()
- [x] TypeScript compiles without errors
- [x] All 3 commits exist

## Self-Check: PASSED
