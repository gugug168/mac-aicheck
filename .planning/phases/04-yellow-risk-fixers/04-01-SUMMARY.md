---
phase: "04-yellow-risk-fixers"
plan: "04-01"
subsystem: toolchain
tags: [fixer, node, python, yellow-risk, installer]

# Dependency graph
requires:
  - phase: "03-green-risk-fixers"
    provides: Fixer infrastructure, registry, error classification, green risk pattern
provides:
  - Yellow risk fixer for Node.js LTS installation (node-version-fixer)
  - Yellow risk fixer for Python 3.12 installation (python-versions-fixer)
  - partial: true on failure pattern for yellow risk
  - needsTerminalRestart guidance pattern for PATH-dependent fixes
affects:
  - Phase 5+ red risk fixers
  - fixAll() orchestration

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Yellow risk fixer pattern (risk: 'yellow', verified: false on success, partial: true on failure)
    - Terminal restart guidance for PATH-dependent installations

key-files:
  created:
    - src/fixers/node-version.ts - Node.js LTS installation fixer
    - src/fixers/python-versions.ts - Python 3.12 installation fixer
  modified:
    - src/fixers/index.ts - Added fixer imports to trigger self-registration

key-decisions:
  - "D-34: Yellow risk fixers skip auto-verify, user must manually verify with provided commands"
  - "D-35: Yellow risk fixer failure returns partial: true instead of complete failure"
  - "D-38: node-version fixer needsTerminalRestart: true due to PATH changes"
  - "D-39: python-versions fixer needsTerminalRestart: true due to PATH changes"

patterns-established:
  - "Yellow risk fixer: risk='yellow', success returns verified:false, failure returns partial:true"
  - "PATH-dependent installers include needsTerminalRestart in getGuidance()"

requirements-completed: [YLW-01, YLW-02]

# Metrics
duration: 5min
completed: 2026-04-13
---

# Phase 4: Yellow Risk Fixers (04-01) Summary

**Node.js LTS and Python 3.12 yellow risk fixers with partial failure handling and terminal restart guidance**

## Performance

- **Duration:** ~5 min
- **Tasks:** 3 (2 implementation + 1 verification checkpoint)
- **Files created:** 2 (node-version.ts, python-versions.ts)
- **Files modified:** 1 (fixers/index.ts)

## Accomplishments
- Implemented node-version-fixer with official Node.js LTS .pkg installer
- Implemented python-versions-fixer with official Python 3.12 .pkg installer
- Both fixers follow yellow risk pattern (partial: true on failure, needsTerminalRestart)
- Auto-fixed missing fixer imports in fixers/index.ts

## Task Commits

1. **Task 1: Implement node-version fixer (YLW-01)** - `2880e74` (feat)
2. **Task 2: Implement python-versions fixer (YLW-02)** - `2880e74` (feat)
3. **Task 3: Verify compilation and registration** - checkpoint passed

## Files Created/Modified
- `src/fixers/node-version.ts` - Node.js LTS fixer (risk: yellow, partial: true on failure, needsTerminalRestart: true)
- `src/fixers/python-versions.ts` - Python 3.12 fixer (risk: yellow, partial: true on failure, needsTerminalRestart: true)
- `src/fixers/index.ts` - Added imports for all fixers to trigger self-registration

## Decisions Made
- Used official .pkg installers (nodejs.org and python.org) for reliability
- Followed D-34/D-35 yellow risk pattern: verified: false on success, partial: true on failure
- Included getGuidance() with needsTerminalRestart: true per D-38/D-39

## Deviations from Plan

**1. [Rule 3 - Blocking] Added fixer imports to fixers/index.ts**
- **Found during:** Task 3 (Verification)
- **Issue:** Fixers weren't self-registering when loaded via registry.js because no fixer modules were imported. Fixer modules only register when imported.
- **Fix:** Added import statements for all fixers to fixers/index.ts (mirroring scanners/index.ts pattern)
- **Files modified:** src/fixers/index.ts
- **Verification:** getFixers() returns all 6 fixers including node-version-fixer and python-versions-fixer with correct risk: 'yellow'
- **Committed in:** 2880e74 (part of Task 1/2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking - necessary for fixer registration to work)
**Impact on plan:** Auto-fix essential - without it, fixers would never register and plan success criteria would fail.

## Issues Encountered
- Fixer self-registration not working when requiring registry.js directly (expected behavior - fixers must be imported to trigger registration)

## Next Phase Readiness
- Yellow risk fixer pattern established for future phases
- Ready for Phase 5 red risk fixers (developer-mode, screen-permission)
- FixAll() orchestration already handles yellow risk correctly (skips auto-verify, shows guidance)

---
*Phase: 04-yellow-risk-fixers*
*Completed: 2026-04-13*