# Research Summary: mac-aicheck Fixer System

**Project:** mac-aicheck automatic repair capability
**Researched:** 2026-04-12
**Overall confidence:** MEDIUM

## Executive Summary

Adding automatic repair to mac-aicheck introduces significant complexity and risk beyond detection. The core danger is making things worse: privilege escalation without guardrails can damage systems, network operations can leave partial states, and macOS permission boundaries (SIP, TCC) create hard limits that cannot be crossed programmatically. The WinAICheck four-stage model (preflight → backup → execute → verify) provides sound structure, but each stage has documented failure modes requiring explicit mitigation.

The most critical finding: verification closure is non-negotiable. A fixer that reports success without re-scanning will cause more confusion than not fixing at all.

## Key Findings

1. **Privilege escalation is the highest-risk operation** - Any `sudo` command can cause irreversible damage. Require dry-run and explicit confirmation.

2. **Network-dependent operations need atomic guarantees** - Downloads should go to temp first, verify checksum, then move. Homebrew/Rosetta/Xcode CLT installs can fail mid-way.

3. **macOS has hard permission boundaries** - SIP protects critical directories even from root. TCC permissions require GUI confirmation and are cached. Some repairs simply cannot be automated.

4. **Partial fix states are worse than no fix** - The same scanner used for detection must verify the fix. Skip verification and you will get false success reports.

5. **PATH and environment changes require explicit restart guidance** - Shell config modifications don't affect the current shell. Users need to be told explicitly to restart or re-source.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Phase 1: Green-risk fixers with verification closure**
   - Addresses: homebrew, npm-mirror, git config
   - Avoids: privilege escalation disasters by requiring dry-run + confirmation
   - Must include: mandatory re-scan verification

2. **Phase 2: Error classification + preflight checks**
   - Addresses: partial fix states, network failures
   - Avoids: executing commands without checking external dependencies first
   - Implement: rollback mechanism for failed operations

3. **Phase 3: Yellow-risk fixers + restart guidance**
   - Addresses: node-version, python-versions, Xcode CLT
   - Avoids: terminal restart confusion
   - Must include: explicit restart instructions in output

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Privilege escalation risks | MEDIUM | General patterns well-known; macOS specifics need verification |
| Network operation failures | MEDIUM | Patterns documented; timing issues require hands-on testing |
| macOS permission boundaries | MEDIUM | SIP/TCC behavior documented by Apple; edge cases need testing |
| Phase ordering | HIGH | Based on risk classification already in PROJECT.md |

## Open Questions

- WinAICheck's `src/fixers/index.ts` has 500+ lines of tested fixer logic - should be reviewed before implementation
- Homebrew on Apple Silicon vs Intel has different install paths and potential issues
- Xcode CLT install behavior when user cancels mid-download
- Rosetta 2 install failure modes on Apple Silicon
