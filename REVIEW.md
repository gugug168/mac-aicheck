# mac-aicheck Code Review

**Reviewed:** 2026-04-27
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed `src/agent/index.ts` (2413 lines), `src/api/aicoevo-client.ts`, `src/fixers/` (9 files), and `src/scanners/index.ts`. Found 2 critical issues, 3 high-severity issues.

---

## Critical Issues

### CR-01: Command Injection in Shell Hook Builder

**File:** `src/agent/index.ts:1150-1155`
**Issue:** The `buildHookBlock` function embeds user-controlled `a.original` (resolved command path) into a shell single-quoted string using escape `replace(/'/g, "'\"'\"'")`. However, this only escapes single quotes. Newlines and other shell metacharacters in a crafted `original` path could break out of the single-quoted context.

```typescript
const orig = a.original.replace(/'/g, "'\"'\"'");
lines.push(`  command ${a.functionName} "$@"`);
```
**Fix:** Validate `original` is a safe absolute path before embedding. Use regex `/^\/[^\s;'"]+$/` to verify.

---

### CR-02: SSRF via Environment Variable URL Injection

**File:** `src/agent/index.ts:557-560`
**Issue:** `apiBase()` trusts `AICOEVO_API_BASE` / `AICOEVO_BASE_URL` without validation. An attacker with hook access could set these to internal IPs (e.g., `http://169.254.169.254`) to proxy requests through the agent.

```typescript
function apiBase() {
  const raw = (process.env.AICOEVO_API_BASE || process.env.AICOEVO_BASE_URL || 'https://aicoevo.net').replace(/\/+$/, '');
```
**Fix:** Add hostname blocklist (already exists in `aicoevo-client.ts:31-38`): block `169.254.169.254`, `100.100.100.200`, private IP ranges, and `localhost`.

---

## High Issues

### HR-01: TOCTOU Race in Worker Lock

**File:** `src/agent/index.ts:460-471`
**Issue:** `acquireWorkerLock()` reads lock file, checks PID, then writes - not atomic. Two processes can race: both read same lock, neither finds live PID, both write their own PID.

```typescript
const existing = readJson<{ pid?: number; startedAt?: string }>(lockPath, {});
if (existing.pid && existing.pid !== process.pid) {
  try { process.kill(existing.pid, 0); return false; } catch { unlinkSync(lockPath); }
}
```
**Fix:** Use `fs.rename()` atomic swap, or file locking (`fs.openSync` with `flock`), or write to temp file then rename.

---

### HR-02: Git Identity Fixer Returns Incorrect Status

**File:** `src/fixers/git.ts:55-73`
**Issue:** When `git-identity` scan fails because global user.name/email is unset, the fixer returns `success: false` with guidance. But the fixer's `canFix` also matches `git-identity`, and it should actually SET the identity (interactive), not just report failure.

```typescript
if (scanResult.id === 'git-identity') {
  // ...
  if (!currentName || !currentEmail) {
    return { success: false, message: 'Git 全局身份未配置...', verified: false };
  }
}
```
**Fix:** `git-identity` fixer should not match when identity is unconfigured - the scanner should instead prompt for setup. Or implement interactive setup.

---

### HR-03: Missing `await` for Background `syncEvents()`

**File:** `src/agent/index.ts:1407-1409`
**Issue:** `syncEvents()` is called without `await` or error handling in the passthrough command handler. If it fails silently, events are lost without user feedback.

```typescript
if (config.autoSync && config.shareData && !config.paused) {
  try { await syncEvents(); } catch {}
}
```
**Fix:** At minimum log failures to stderr. Consider queuing failed syncs for retry.

---

## Medium Issues

### MD-01: Unhandled Promise Rejection in `upgradeCommand()`

**File:** `src/agent/index.ts:218-226`
**Issue:** `execFileSync` runs with `stdio: 'inherit'` - if upgrade fails, error propagates up but `upgraded` stays `false`. The loop correctly tries npm then brew, but errors are only caught in outer catch.

### MD-02: Hardcoded Timeout in `runValidationCommand`

**File:** `src/agent/index.ts:872-874`
**Issue:** Validation command timeout is hardcoded to 120 seconds. Should be configurable or at minimum documented.

---

_Reviewed: 2026-04-27T10:24:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
