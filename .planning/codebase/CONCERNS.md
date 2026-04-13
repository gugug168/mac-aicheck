# Codebase Concerns

**Analysis Date:** 2026-04-12

## Tech Debt

**Test Infrastructure Missing:**
- Issue: CONTRIBUTING.md specifies tests must exist in `src/__tests__/` with 80% coverage, but no test files exist
- Files: No test files found in `src/__tests__/` or anywhere
- Impact: Cannot verify scanner correctness, regressions go undetected
- Fix approach: Add vitest configuration and write unit tests for scanners

**No Test Configuration:**
- Issue: No `vitest.config.ts` or `jest.config.ts` exists
- Files: Missing test config
- Impact: `npm test` cannot run (likely fails)
- Fix approach: Add vitest config and testing dependencies

**Hardcoded Configuration:**
- Issue: Port 7890 hardcoded in `src/index.ts:13`, not environment-configurable
- Files: `src/index.ts`
- Impact: Cannot run multiple instances or change port without code modification
- Fix approach: Use `process.env.PORT || 7890`

**Hardcoded Registry URLs:**
- Issue: npm registry URLs hardcoded in multiple places
- Files: `src/index.ts:21-28`, `src/installers/index.ts`
- Impact: Registry URLs may change, duplicates could get out of sync
- Fix approach: Centralize registry configuration

**No Watch Mode:**
- Issue: README mentions `npm run watch` but no such script exists
- Files: `package.json`
- Impact: Developer experience degraded
- Fix approach: Add `tsc --watch` or use `tsx watch`

**Scanner Category Mismatch:**
- Issue: `SCANNER_CATEGORIES` in `src/scanners/registry.ts:5` does not include `'system'`, but `gpu-monitor.ts` uses category `'system'`
- Files: `src/scanners/registry.ts`, `src/scanners/gpu-monitor.ts:186`
- Impact: Category filtering breaks for GPU scanner
- Fix approach: Add `'system'` to `SCANNER_CATEGORIES`

## Known Bugs

**Deprecated nslookup Usage:**
- Issue: DNS scanner uses `nslookup` which is deprecated on macOS
- Files: `src/scanners/dns-resolution.ts:17`
- Impact: May produce unexpected output on newer macOS versions
- Fix approach: Use `dscacheutil -q host` or `dnsutil`

**Slow GPU Detection:**
- Issue: GPU scanner runs 4 separate `system_profiler` commands with up to 8s timeout each
- Files: `src/scanners/gpu-monitor.ts:99-101`
- Impact: Scanning takes 10+ seconds, `system_profiler` is deprecated
- Fix approach: Use `pmset -g` or `powermetrics` instead

**SSL Check Against github.com:**
- Issue: SSL scanner connects to github.com which may be blocked in some environments (corporate firewalls, China)
- Files: `src/scanners/ssl-certs.ts:13`
- Impact: False failures in restricted network environments
- Fix approach: Test against multiple hosts or localhost

**Port Inconsistency:**
- Issue: CLAUDE.md mentions port 7891, README mentions 7890, code uses 7890
- Files: `src/index.ts:13`, `CLAUDE.md`, `README.md:58`
- Impact: Documentation confusion
- Fix approach: Standardize on 7890 and update docs

**Scanner Count Inconsistency:**
- Issue: CLAUDE.md says 16 scanners, README says 18 scanners
- Files: `CLAUDE.md`, `README.md:11`
- Impact: Documentation is unreliable
- Fix approach: Count actual scanners and update docs

**Stash API Error Handling:**
- Issue: Stash proxy returns 502 on network errors but message may leak internal details
- Files: `src/index.ts:163`
- Impact: Internal network topology could be exposed
- Fix approach: Generic error message without `e.message`

## Security Considerations

**CORS Origin 'null':**
- Issue: Server sets `Access-Control-Allow-Origin: 'null'` which is restrictive
- Files: `src/index.ts:39,64,86,96,159,183`
- Impact: Cannot be accessed from file:// URLs in some browsers
- Fix approach: Use proper origin validation if cross-origin needed

**Command Injection Prevention (Good):**
- Positive: ID-only validation prevents command injection
- Files: `src/index.ts:84-89`
- Implementation: Commands are whitelisted, IDs validated before execution

**Path Traversal Protection:**
- Issue: Only checks if path starts with WEB_DIR, could miss some traversal vectors
- Files: `src/index.ts:194`
- Impact: Potential path traversal if symlinks exist in WEB_DIR
- Fix approach: Use `realpath()` to resolve symlinks

**Environment Variable Exposure:**
- Issue: No redaction of sensitive env vars in上报 data
- Files: `src/api/aicoevo-client.ts`
- Impact: Could accidentally send credentials
- Fix approach: Audit what `collectSystemInfo()` gathers

## Performance Bottlenecks

**Unbounded Parallel Scanning:**
- Issue: All 16+ scanners run concurrently via `Promise.all`
- Files: `src/scanners/index.ts:31`
- Impact: High system load during scan, could overwhelm system
- Fix approach: Use `Promise.all` with concurrency limit or sequential scanning

**Slow System Profiler Calls:**
- Issue: GPU detection runs multiple slow `system_profiler` commands
- Files: `src/scanners/gpu-monitor.ts:99-101`
- Impact: 10+ second delay during scan
- Fix approach: Cache GPU info or use faster APIs

**No Scanner Result Caching:**
- Issue: Every scan runs all commands from scratch
- Files: All scanners
- Impact: Repeated work on consecutive scans
- Fix approach: Add optional result caching with TTL

## Fragile Areas

**GPU Monitor Complex Parsing:**
- Files: `src/scanners/gpu-monitor.ts` (190 lines)
- Why fragile: Complex line-by-line parsing, regex matching for display detection
- Safe modification: Add comprehensive tests before changing parsing logic
- Test coverage: None

**Installers Index Size:**
- Files: `src/installers/index.ts` (333 lines)
- Why fragile: Very large file with repetitive patterns, hard to maintain
- Safe modification: Extract common patterns into base installer class
- Test coverage: None

**Scoring Calculator Unknown Handling:**
- Files: `src/scoring/calculator.ts:71`
- Why fragile: `unknown` status excluded from scoring denominator
- Safe modification: Document behavior clearly, ensure intentional
- Test coverage: None

**Registry Pattern Matching:**
- Files: `src/scanners/npm-mirror.ts:13-15`
- Why fragile: String matching for registry detection (taobao.org, cnpm)
- Safe modification: Use exact matching instead of includes()
- Test coverage: None

## Scaling Limits

**In-Memory Report Storage:**
- Issue: Scan results stored in `~/.mac-aicheck-cache.json` and `~/.mac-aicheck/reports/`
- Files: `src/api/aicoevo-client.ts`, `src/web/render.ts`
- Current capacity: Limited by disk space
- Limit: No cleanup of old reports
- Scaling path: Add report retention policy

**HTTP Server Single-Threaded:**
- Issue: Node.js HTTP server without clustering
- Files: `src/index.ts:32`
- Current capacity: Handles single user
- Limit: Cannot utilize multi-core
- Scaling path: Use `cluster` module if multi-user support needed

## Dependencies at Risk

**https-proxy-agent v9.0.0:**
- Risk: Older version with potential security issues
- Impact: Used for proxy support in network requests
- Migration plan: Review and update to latest version

**chalk v5.3.0:**
- Risk: Major version, ESM-only
- Impact: May cause issues if transitioning to ESM
- Migration plan: Already at latest major, monitor

**dotenv v16.4.0:**
- Risk: Security concerns with automatic loading
- Impact: Could load malicious .env files
- Migration plan: Use `dotenv/config` only where needed

## Missing Critical Features

**No Input Validation on API Responses:**
- Problem: API responses from aicoevo.net are used directly without validation
- Blocks: Potential XSS if serving HTML report
- Fix approach: Validate API response schema

**No Graceful Degradation:**
- Problem: If aicoevo.net is down, community features fail completely
- Blocks: Can still scan but cannot report
- Fix approach: Queue上报 requests for retry

**No Scan Result Export:**
- Problem: Only HTML report and JSON output, no CSV/other formats
- Blocks: Integration with other tools

## Test Coverage Gaps

**All Scanners Untested:**
- What's not tested: Every scanner's logic
- Files: All `src/scanners/*.ts`
- Risk: Scanner bugs undetected, breaking changes not caught
- Priority: High

**Scoring Calculator Untested:**
- What's not tested: Score calculation, grade assignment, category weighting
- Files: `src/scoring/calculator.ts`
- Risk: Score miscalculation could be silently wrong
- Priority: High

**API Client Untested:**
- What's not tested: HTTP calls, error handling, payload creation
- Files: `src/api/aicoevo-client.ts`
- Risk:上报 failures undetected
- Priority: Medium

**Executor Untested:**
- What's not tested: Command execution, timeout handling, buffer decoding
- Files: `src/executor/index.ts`
- Risk: Commands fail silently or hang
- Priority: Medium

---

*Concerns audit: 2026-04-12*
