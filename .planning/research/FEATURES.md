# Feature Landscape: Fixer System

**Domain:** Automated repair system for macOS development environment diagnostics
**Researched:** 2026-04-12
**Confidence:** MEDIUM (based on training data, not real-time web search)

## Context

Issue #2 describes a three-layer fixer approach:
1. **Verification Loop (第一层)** — re-run scanner after fix, verify success/fail/warn
2. **Precise Diagnostics (第二层)** — error classification + preflight checks
3. **Post-Fix Guidance (第三层)** — terminal restart, reboot, manual verify commands

Current state: Project has `FIX_DEFS` in `src/web/render.ts` with 5 static fixes, but no actual fixer infrastructure.

---

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Fix verification** | After running a fix, user needs to know if it worked | Medium | Re-run scanner, compare before/after status |
| **Error classification** | "It failed" without reason is unhelpful | Medium | timeout, permission-denied, network-error, not-found, already-exists |
| **Preflight checks** | Prevent running fix on healthy system | Medium | Check prerequisites before executing |
| **Risk tiers** | Users need to understand consequence severity | Low | green/yellow/red already defined in TIER_CFG |
| **Rollback capability** | If fix makes things worse, undo it | High | Not always possible, but backup before changes |
| **Progress feedback** | Long-running fixes need status updates | Low | Show current step, percentage, ETA |
| **Dry-run mode** | Show what would change without executing | Low | Especially for destructive operations |

---

## Differentiators

Features that set mac-aicheck apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Automated verification loop** | No manual re-scan needed; fix + verify in one command | Medium | Core of 第一层 — scanner re-execution after fix |
| **Contextual post-fix guidance** | "Restart terminal" or "Reboot Mac" after specific fixes | Low | Core of 第三层 — not just "done" but next steps |
| **Smart preflight checks** | Don't try to install brew if already installed | Low | Prevents redundant operations |
| **Fix chaining** | Some fixes require others first (e.g., Rosetta before x86 brew) | High | Dependency graph for fix execution order |
| **Cumulative fix status** | Track "X of Y issues fixed" across sessions | Low | Persistence of fix history |
| **Intelligent retry** | On transient failures, suggest retry vs manual intervention | Medium | Classify error as retryable vs permanent |

---

## Comparable Tools Analysis

### Homebrew

**Auto-repair capabilities:**
- `brew doctor` — diagnoses issues with severity levels (Error, Warning, Annotation)
- Auto-update on every command (`brew update` before installs)
- Safety prompts: "This will install X. Continue? [y/N]"
- Cleanup: `brew cleanup` removes old package versions
- Prune: `brew prune` removes dead symlinks

**Verification approach:**
- Exit codes: 0 = success, 1 = generic error, 2 = usage error
- Warnings displayed but don't block operations
- Shows what will be installed/removed before proceeding (`brew install --dry-run`)

**Gaps/limitations:**
- Does not automatically fix found issues (just diagnoses)
- No post-fix verification beyond successful command exit
- Restart/reboot guidance is manual (user searches docs)

**Confidence:** MEDIUM (training data, not verified against current docs)

### npm

**Auto-repair capabilities:**
- `npm doctor` — checks registry connectivity, git, permissions, cache integrity
- `npm cache verify` — validates and cleans cache
- `npm rebuild` — rebuilds native modules after Node.js upgrade
- `npm audit fix` — automatically fixes security vulnerabilities

**Verification approach:**
- `--dry-run` flags to preview changes
- Exit codes distinguish success (0) from errors (1+)
- `npm ls` to verify installed packages match package.json

**Gaps/limitations:**
- No automatic rollback on failure
- Audit fix is security-focused, not general repair
- Network errors trigger retries but no classification

**Confidence:** MEDIUM (training data, not verified against current docs)

### Yarn

**Auto-repair capabilities:**
- `yarn doctor` — checks for common issues (Node version, npm version, offline)
- `yarn install --check-files` — verifies all installed files exist
- `yarn install --verifyツrees` — verifies dependency tree integrity

**Verification approach:**
- Exit code 0 for clean, non-zero for issues found
- No automatic fixing, just reporting

**Gaps/limitations:**
- Less aggressive repair automation than npm audit
- Post-fix verification requires manual re-run

**Confidence:** MEDIUM (training data, not verified against current docs)

---

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Automatic system changes without consent** | Users must control their system; unexpected changes erode trust | Always show command before execution, require confirmation for non-green tier |
| **Silent failures** | If fix fails silently, user assumes it worked | Return clear status: success/fail/warn with explanation |
| **Assume root/admin always available** | Some fixes genuinely require user action in GUI | Don't attempt privileged operations without checking `isAdmin()` |
| **One-size-fits-all fixes** | Network timeout vs permission denied need different handling | Classify errors, provide targeted remediation |
| **Fixes that require internet but don't check connectivity** | Fix attempt fails immediately if offline | Preflight check: verify connectivity before network-dependent fixes |
| **Overwriting user configurations silently** | User's custom npmrc or git config might be intentional | Backup before overwrite, restore option if user protests |
| **Automatic restart of services/terminals** | Cannot programmatically restart terminal in macOS | Post-fix guidance: clear instructions for manual restart |

---

## Feature Dependencies

```
Fixer Interface
    ├── Verification Loop (Layer 1)
    │   └── Re-run scanner after fix execution
    ├── Precise Diagnostics (Layer 2)
    │   ├── Error classification (timeout, perm-denied, etc.)
    │   └── Preflight checks (prerequisites, connectivity)
    └── Post-Fix Guidance (Layer 3)
        └── Contextual instructions (restart terminal, reboot)

Fixer Registry
    └── Each fixer registered with:
        ├── scanner ID (which scanner it fixes)
        ├── risk tier (green/yellow/red)
        ├── preflight checks
        ├── fix command(s)
        └── verification scanner + post-fix guidance
```

---

## MVP Recommendation

**Prioritize building in this order:**

1. **Fixer interface + registry** — infrastructure to register and execute fixes
2. **Layer 1 (Verification loop)** — re-run scanner after fix, return new ScanResult
3. **Layer 2 (Error classification)** — map command exit codes to error types
4. **Layer 2 (Preflight checks)** — check prerequisites before executing fix
5. **Layer 3 (Post-fix guidance)** — static guidance strings per fixer
6. **green-tier fixers** — homebrew, npm-mirror, rosetta (lowest risk)
7. **yellow-tier fixers** — node-version, python-versions (medium risk)
8. **Persistence** — save fix history across sessions

**Defer:**
- Fix chaining/dependency graph (Phase 2)
- Rollback/backup system (Phase 2)
- Automated retry on transient errors (Phase 2)
- red-tier fixers (developer-mode, screen-permission) — require user GUI interaction

---

## Three-Layer Deep Dive

### Layer 1: Verification Loop

**What it does:**
1. Execute fix command
2. Re-run associated scanner
3. Compare new result to original result
4. Report: "Fixed" (status improved), "Not fixed" (status same), "Made worse" (status degraded)

**Interface:**
```typescript
interface FixResult {
  originalResult: ScanResult;
  fixedResult: ScanResult;
  changed: boolean;
  improvement: 'fixed' | 'not_fixed' | 'made_worse' | 'error';
  errorMessage?: string;
}
```

**Key requirement:** Fix command must not be bundled with scanner re-run; scanner must be independently executable.

### Layer 2: Precise Diagnostics

**Error classification taxonomy:**
| Error Type | Example | Retry Behavior |
|------------|---------|----------------|
| `timeout` | Network slow, server unresponsive | Retry with longer timeout |
| `permission-denied` | sudo required, no admin rights | Instruct user to grant permissions |
| `not-found` | Command doesn't exist, path wrong | Suggest installation |
| `network-error` | DNS failure, connection refused | Check connectivity, suggest VPN |
| `already-exists` | Resource already configured | Skip, report as "already OK" |
| `version-mismatch` | Tool version incompatible | Suggest upgrade path |
| `unknown` | Catch-all for unexpected errors | Log details, suggest manual intervention |

**Preflight checks (per fixer):**
- Check if fix is needed (don't fix if already healthy)
- Check connectivity (for downloads)
- Check permissions (for privileged operations)
- Check disk space (for installations)
- Check tool availability (for dependent tools)

### Layer 3: Post-Fix Guidance

**Guidance categories:**
| Category | Trigger | Example Guidance |
|----------|---------|------------------|
| `restart-terminal` | PATH changes, shell config edits | "Close and reopen your terminal, or run: source ~/.zshrc" |
| `reboot-system` | Kernel extensions, system permissions | "Restart your Mac for changes to take effect" |
| `manual-verify` | Complex fixes that can't be auto-verified | "Verify in Safari: Settings > Privacy > Cookies" |
| `restart-service` | Background services modified | "Restart your IDE or Claude Code" |
| `none` | Fix fully self-contained | No additional guidance needed |

---

## Sources

- Project context: `.planning/PROJECT.md`, `src/web/render.ts`, `src/scanners/types.ts`
- Comparable tools: Homebrew `brew doctor`, npm `npm doctor`, Yarn `yarn doctor` (training data, not verified)
- WinAICheck reference: PR #1 mentioned in PROJECT.md (not reviewed directly)

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Table stakes | MEDIUM | Based on comparable tools analysis (training data) |
| Differentiators | MEDIUM | Derived from three-layer requirements |
| Comparable tools | MEDIUM | Training data, not real-time verification |
| Anti-features | HIGH | Based on standard UX security principles |
| MVP recommendation | HIGH | Based on stated project requirements |

---

## Open Questions

1. Should verifier be built into Scanner interface or separate?
2. How to handle fixers that modify multiple scanners' results?
3. Should fixes be CLI-only or also Web UI interactive?
4. How to persist fix history — local JSON or上报 to AICO EVO?
5. WinAICheck reference implementation not reviewed — would benefit from direct analysis
