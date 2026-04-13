# Domain Pitfalls: CLI Fixer/Repair Systems

**Domain:** Automatic repair systems for CLI tooling
**Researched:** 2026-04-12
**Overall confidence:** MEDIUM (based on general fixer system patterns; web search unavailable for verification)

## Executive Summary

Fixer/repair systems for CLI tools fail in predictable ways that can leave systems in worse states than before. The most dangerous patterns involve privilege escalation without guardrails, network-dependent operations without rollback, and partial fix states that hide failures. For macOS specifically, System Integrity Protection (SIP) and Transparency, Consent, and Control (TCC) create permission boundaries that can silently block repairs or cause confusing failures.

The WinAICheck four-stage model (preflight → backup → execute → verify) provides a sound foundation, but each stage has well-documented failure modes. This document catalogs them.

---

## Critical Pitfalls

Mistakes that cause data loss, security degradation, or systems left in broken states.

### Pitfall 1: Privilege Escalation Without Confirmation

**What goes wrong:** Fixers that request admin privileges (`sudo`) execute commands with full system access. A single malformed command or path injection can:
- Overwrite system files
- Grant unintended permissions
- Delete critical directories
- Execute malicious content if URLs are interpolated incorrectly

**Why it happens:**
- Developers assume "if user asked for fix, they want the command to run"
- No dry-run mode to preview destructive actions
- Insufficient input validation on user-provided paths or URLs

**Consequences:**
- System instability or boot failure
- Security policy violations
- Lost user data if wrong directory is targeted

**Prevention:**
- Always implement `--dry-run` / `--preview` flag that shows exact commands without executing
- Require explicit user confirmation for ANY command using `sudo`
- Implement command allowlisting (not blocklisting) for all fixer operations
- Validate all paths are within expected directories before use

**macOS-specific notes:**
- `sudo` grants TCC bypass for some operations
- Some directories are SIP-protected and cannot be modified even with sudo
- Gatekeeper can block unsigned repair scripts

---

### Pitfall 2: Network Operations Without Rollback

**What goes wrong:** Downloads, package installs, and API calls fail mid-way, leaving partial downloads or half-installed packages.

**Why it happens:**
- No atomic operation guarantees for downloads
- Downloads are written before validation
- No checksum verification before execution
- Timeout values too aggressive for slow connections

**Consequences:**
- Partial Homebrew installation (brew exists but is broken)
- Corrupted package binaries
- Inconsistent state that is hard to diagnose

**Prevention:**
- Download to temp directory first, verify checksum, THEN move to final location
- Implement transaction-style operations with explicit rollback
- For Homebrew: use `brew install --force-bottle` with checksum validation
- Set reasonable timeouts with exponential backoff for retries

**macOS-specific notes:**
- Rosetta 2 download can fail if Apple servers are throttled
- Xcode CLT install requires Apple's servers - failures are common and not retry-friendly

---

### Pitfall 3: Partial Fix States Without Detection

**What goes wrong:** A fixer reports success but only partially completed. The symptom persists.

**Why it happens:**
- Exit code checked but stdout/stderr not analyzed
- Post-fix verification scan runs but uses cached results
- Asynchronous operations not awaited

**Consequences:**
- User believes problem is fixed when it is not
- Subsequent support requests about "the fix didn't work"
- Loss of trust in the tool

**Prevention:**
- **Always re-scan after fix** to confirm problem is resolved
- Check exit codes AND parse output for success indicators
- Implement a "fix verification timeout" - if verification doesn't pass within X seconds, mark as failed
- Use the same scanner logic for verification that was used for detection

**This project's approach (from PROJECT.md):**
- Phase 1 focuses on "verification closure" - this is critical
- Do NOT skip verification even for "simple" fixes like git config

---

### Pitfall 4: PATH Modifications Without Terminal Restart Guidance

**What goes wrong:** Fixer modifies PATH, shell config, or environment variables but changes don't take effect until terminal restart - which user may not do.

**Why it happens:**
- Shell config files (`~/.zshrc`, `~/.bashrc`) modified but current shell not reloaded
- Environment variables set in non-interactive shells only
- Fixer runs in different shell context than user's interactive shell

**Consequences:**
- User runs `node` expecting new version, gets old version
- "I ran the fix but it says the same thing!"
- Confusion about whether fix actually worked

**Prevention:**
- After modifying shell config, explicitly print: "Please restart your terminal or run: `source ~/.zshrc`"
- Test the fix in a new shell context before declaring success
- Document which fixes require terminal restart

**macOS-specific notes:**
- macOS 15+ uses zsh by default
- GUI applications don't read shell configs - they need `launchctl setenv`
- Xcode and JetBrains tools use their own environment, not shell environment

---

### Pitfall 5: TCC Permission Changes Without Re-scanning

**What goes wrong:** Fixer grants permissions (screen recording, accessibility, automation) but the system permission state is cached.

**Why it happens:**
- TCC permissions require GUI confirmation that cannot be automated
- macOS caches permission grants - new processes don't see them immediately
- Permission granted to Terminal but not to the app being repaired

**Consequences:**
- Fixer reports success but app still can't access screen/automation
- User gets confusing "permission denied" errors
- Some permissions require logout/login to fully activate

**Prevention:**
- Always instruct user to: (1) grant permission when dialog appears, (2) if issues persist, log out and log back in
- For screen recording permission: warn that some apps need to be quit and reopened
- Implement explicit "permission refresh" guidance

**macOS-specific notes:**
- TCC database at `/Library/Application Support/com.apple.TCC/TCC.db` cannot be modified directly (SIP)
- `tccutil` can reset permissions but requires full disk access
- Some permissions (Automation) require user approval per-app, not globally

---

### Pitfall 6: Assuming Admin Rights Are Sufficient

**What goes wrong:** Fixer checks `sudo` access and proceeds, but still fails due to other permission boundaries.

**Why it happens:**
- SIP blocks modification of `/System`, `/usr/lib`, `/bin`, `/sbin`
- Full Disk Access required to read some directories
- Apple Notarization requirements for kernel extensions

**Consequences:**
- Fixer fails with confusing "Permission denied" even with sudo
- User thinks tool is broken
- Potential data loss if fixer tries to force through SIP

**Prevention:**
- Before attempting privileged operations, check SIP status (`csrutil status`)
- Document which directories are SIP-protected
- Fail fast with clear message: "This directory is protected by System Integrity Protection"

**macOS-specific notes:**
- SIP can be disabled only from Recovery Mode
- Even root cannot modify SIP-protected paths
- Homebrew on Apple Silicon uses `/opt/homebrew` (not SIP-protected); Intel uses `/usr/local` (partially protected)

---

## Moderate Pitfalls

Issues that cause user confusion or fix failures but don't break the system.

### Pitfall 7: Color Output in Non-TTY Contexts

**What goes wrong:** Fixer prints ANSI color codes when output is piped to file or another tool.

**Why it happens:**
- Color detection only checks if stdout is a TTY
- Does not account for `script` command, CI environments, or file redirection

**Prevention:**
- Always check `isTTY` AND `NO_COLOR` environment variable
- Use a color library that respects `FORCE_COLOR`
- Test with: `mac-aicheck scan 2>&1 | cat`

---

### Pitfall 8: Silent Failures in Non-Interactive Mode

**What goes wrong:** Fixer in batch/CI mode fails silently because errors go to stderr but aren't captured.

**Why it happens:**
- Errors printed to console but exit code still 0
- Background processes fail without notification
- Exit code not checked in calling scripts

**Prevention:**
- Always check exit codes in scripts
- Use `set -e` to fail fast
- Log errors to file in addition to console

---

### Pitfall 9: Inconsistent State After Keyboard Interrupt

**What goes wrong:** User presses Ctrl+C during a multi-step fix, leaving system in partial state.

**Why it happens:**
- No signal handling for SIGINT/SIGTERM
- Cleanup handlers not registered
- No transaction rollback on interruption

**Prevention:**
- Register signal handlers that trigger rollback
- Use temporary directories with auto-cleanup on exit
- Track all modifications for potential rollback

---

### Pitfall 10: Version-Specific Commands Become Stale

**What goes wrong:** Fixer uses commands that work on current macOS version but fail on older/newer versions.

**Why it happens:**
- macOS command syntax changes between versions
- Apple moves directories between releases
- Tool flags deprecate without notice

**Prevention:**
- Always check macOS version before using version-specific commands
- Document known incompatibilities
- Provide fallback commands when possible

**macOS-specific notes:**
- macOS 13 Ventura changed some System Preferences to Settings
- macOS 12 Monterey changed gatekeeper behavior
- Rosetta install command changed between Intel and Apple Silicon

---

## Phase-Specific Warnings

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|----------------|------------|
| Phase 1 | Verification Closure | Skipping re-scan to "save time" | Make verification mandatory, not optional |
| Phase 1 | Green-risk fixers | Assuming "safe" commands have no risk | All commands can have edge cases |
| Phase 2 | Error Classification | Overly generic error messages | Parse actual command output, don't just check exit code |
| Phase 2 | Pre-flight checks | Checks pass but fix still fails | Pre-flight should check external dependencies (network, disk space) |
| Phase 3 | Restart Guidance | Users ignore restart instructions | Make restart messages prominent, require confirmation |

---

## Pattern: The Four-Stage Failure Modes

The WinAICheck four-stage model (preflight → backup → execute → verify) has known failure points at each stage:

### Preflight Failures
- Assumes system state is static when it isn't (network changes, concurrent modifications)
- Checks pass but don't cover all failure modes
- Timing: state changes between check and execute

### Backup Failures
- Backup location not writable
- Backup succeeds but restore mechanism untested
- Backup is partial (doesn't capture all relevant state)

### Execute Failures
- Command runs but does wrong thing (input validation failure)
- Partial execution (one step succeeds, another fails)
- privilege change mid-execution (can leave inconsistent state)

### Verify Failures
- Verification uses different logic than detection (false positive success)
- Verification passes but user still sees problem (caching, environment)
- Verification runs before system state stabilizes

---

## Safety Checklist

Before implementing ANY fixer:

- [ ] Dry-run mode that shows exact commands without executing
- [ ] Explicit user confirmation for privileged operations
- [ ] Command allowlisting (not blocklisting)
- [ ] Post-fix verification scan
- [ ] Clear error messages that explain what went wrong
- [ ] Restart/refresh guidance where needed
- [ ] Signal handling for interruption
- [ ] Transaction rollback on failure

---

## Sources

- **LOW confidence** (training data only, no web verification available):
  - General fixer system patterns
  - macOS permission system (SIP, TCC) documented behavior
  - WinAICheck architecture notes from PROJECT.md

## Gaps to Address

- No web search available to verify current best practices
- WinAICheck source code (`src/fixers/index.ts`) not examined - should be reviewed before implementation
- Homebrew/Apple Silicon specific repair edge cases need hands-on testing
- TCC permission automation limits need verification with Apple documentation
