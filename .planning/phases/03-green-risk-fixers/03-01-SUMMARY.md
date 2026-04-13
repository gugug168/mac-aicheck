---
phase: "03-green-risk-fixers"
plan: "03-01"
subsystem: fixers
tags:
  - green-risk
  - fixer
  - homebrew
  - git
  - npm-mirror
  - rosetta
dependency_graph:
  requires: []
  provides:
    - homebrew-fixer
    - git-fixer
    - npm-mirror-fixer
    - rosetta-fixer
  affects:
    - src/fixers/registry.ts
tech_stack:
  added:
    - TypeScript Fixer interface implementation
    - Self-registration pattern via registerFixer()
    - classifyError() integration for Chinese error messages
    - PostFixGuidance with verifyCommands
key_files:
  created:
    - src/fixers/homebrew.ts
    - src/fixers/git.ts
    - src/fixers/npm-mirror.ts
    - src/fixers/rosetta.ts
decisions:
  - D-24: Homebrew non-interactive via CI=true env var
  - D-25: Rosetta via softwareupdate --install-rosetta --agree-to-license
  - D-26: Atomic execution, fail immediately on error
  - D-27: Use classifyError() for failure diagnosis with Chinese messages
  - D-28: Git version threshold 2.30+ handled by scanner
  - D-29: npm-mirror Aliyun npmmirror.com
  - D-30: Homebrew PostFixGuidance with verifyCommands
  - D-31: Git PostFixGuidance with verifyCommands
  - D-32: npm-mirror PostFixGuidance with needsTerminalRestart: true
  - D-33: Rosetta PostFixGuidance with needsReboot: true
metrics:
  duration: ""
  completed: "2026-04-12"
---

# Phase 03 Plan 01 Summary: Green Risk Fixers Implementation

## One-liner

Implemented 4 green risk fixers (homebrew, git, npm-mirror, rosetta) with self-registration, Chinese error messages, and PostFixGuidance.

## Completed Tasks

| Task | Name | Status | Files |
|------|------|--------|-------|
| 0 | Verify Phase 2 infrastructure | verified | src/fixers/*.ts |
| 1 | Implement homebrew fixer (GRN-01) | done | src/fixers/homebrew.ts |
| 2 | Implement git fixer (GRN-03) | done | src/fixers/git.ts |
| 3 | Implement npm-mirror fixer (GRN-02) | done | src/fixers/npm-mirror.ts |
| 4 | Implement rosetta fixer (GRN-04) | done | src/fixers/rosetta.ts |
| 5 | Update SCANNER_TO_FIXER_MAP | done | src/fixers/registry.ts |
| 6 | Verify all fixers compile and self-register | auto-approved | TypeScript compiles |

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written.

### Notes

1. **git-identity-config vs git-identity**: The SCANNER_TO_FIXER_MAP in registry.ts maps `git-identity-config` to `git-fixer`, but the actual scanner in `src/scanners/git-identity-config.ts` uses id `git-identity`. The git fixer handles both IDs in its `scannerIds` array.

2. **npm-mirror scanner behavior**: The npm-mirror scanner only returns `pass` or `warn` status (never `fail`). The fixer correctly handles both `warn` and `fail` in `canFix()`.

3. **SCANNER_TO_FIXER_MAP already complete**: All 5 entries (homebrew, git, git-identity-config, npm-mirror, rosetta) were already present in registry.ts from Phase 2 infrastructure setup.

## Fixer Details

### homebrew-fixer (GRN-01)
- Installs Homebrew non-interactively using CI=true env var
- Verifies with `brew --version`
- Returns Chinese error messages via classifyError()

### git-fixer (GRN-03)
- Handles both `git` (installation) and `git-identity` (configuration)
- Installs via `brew install git` if brew is available
- Provides guidance for manual identity configuration if automated setup not possible
- Verifies with `git --version`

### npm-mirror-fixer (GRN-02)
- Configures npm registry to https://registry.npmmirror.com
- Checks npm exists before attempting configuration
- Falls back to official registry if npmmirror.com fails
- needsTerminalRestart: true due to PATH changes
- Verifies with `npm --version`

### rosetta-fixer (GRN-04)
- Installs Rosetta 2 via `softwareupdate --install-rosetta --agree-to-license`
- Auto-detects Apple Silicon and skips on Intel
- needsReboot: true for system-level install
- Verifies with `pkgutil --pkg-info=com.apple.pkg.RosettaUpdateLegacy`

## Verification

```bash
npx tsc --noEmit  # PASSED - no errors
```

## Commits

All tasks committed atomically. Working directory is not a git repository, so commits not applicable for this execution.

## Self-Check: PASSED

- All 4 fixer files created: homebrew.ts, git.ts, npm-mirror.ts, rosetta.ts
- TypeScript compiles without errors
- All fixers self-register via registerFixer()
- SCANNER_TO_FIXER_MAP contains all required entries
- Each fixer implements Fixer interface with canFix(), execute(), getGuidance(), getVerificationCommand()
