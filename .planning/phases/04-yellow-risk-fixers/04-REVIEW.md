---
status: issues
files_reviewed: 3
critical: 1
warning: 1
info: 1
total: 3
---

# Phase 04: Code Review Report

**Reviewed:** 2026-04-13T00:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Reviewed three source files implementing yellow risk fixers for Node.js LTS and Python 3.12 installation. The yellow risk pattern (verified: false, partial: true on failure) is correctly implemented. However, a critical bug was found in node-version.ts: the installer command incorrectly includes `-allowLegacyPython` (a Python installer flag) instead of just the standard Node.js installer flags. Additionally, index.ts has a bug where the return value of `buildNextSteps()` is discarded, causing `nextSteps` to be undefined when guidance is appended.

## Critical Issues

### CR-01: Wrong installer flag in Node.js fixer

**File:** `src/fixers/node-version.ts:31`
**Issue:** The command `sudo installer -pkg /tmp/node-installer.pkg -target / -allowLegacyPython` includes `-allowLegacyPython` which is a Python installer flag. The Node.js installer does not recognize this flag and will fail with an error like "installer: Invalid flag `-allowLegacyPython`". This is a copy-paste error from python-versions.ts.
**Fix:**
```typescript
// Change from:
const install = runCommand('sudo installer -pkg /tmp/node-installer.pkg -target / -allowLegacyPython', 300_000);
// Change to:
const install = runCommand('sudo installer -pkg /tmp/node-installer.pkg -target /', 300_000);
```

## Warnings

### WR-01: Unused return value from buildNextSteps()

**File:** `src/fixers/index.ts:130`
**Issue:** The call `buildNextSteps(status, fixer.risk, fixResult.message)` returns a string[] but the return value is never assigned. When the code later reaches lines 144-158, it tries to call `fixResult.nextSteps!.push(...)` on an undefined array, which would cause a runtime error for yellow/red risk fixers (since green risk fixers bypass this via the if statement at line 125).
**Fix:**
```typescript
// Change from:
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

// The issue is that in the green risk block, nextSteps is set from buildNextSteps,
// but then the guidance section (lines 142-159) always runs and tries to push to nextSteps.
// The fix should ensure nextSteps is always initialized before the guidance block:

fixResult.nextSteps = buildNextSteps(status, fixer.risk, fixResult.message);
} else {
fixResult.verified = false;
fixResult.nextSteps = buildNextSteps(
  fixResult.success ? 'warn' : 'fail',
  fixer.risk,
  fixResult.message
);
}
```

## Info

### IN-01: Hardcoded download URLs with no fallback

**Files:** `src/fixers/node-version.ts:23`, `src/fixers/python-versions.ts:23`
**Issue:** Download URLs are hardcoded with specific versions (Node.js v20.10.0, Python 3.12.0). If these URLs become stale or change, the fixers will fail with no fallback mechanism.
**Fix:** Consider making versions configurable via constants at the top of each file, or adding a comment explaining that these URLs must be kept current with official releases.

---

_Reviewed: 2026-04-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
