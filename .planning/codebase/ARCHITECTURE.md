# Architecture

**Analysis Date:** 2026/04/12

## Pattern Overview

**Overall:** Plugin-based Scanner Architecture with Registry Pattern

**Key Characteristics:**
- Scanner modules self-register to a central registry on import
- Parallel execution of independent scanner checks via `Promise.all`
- Layered architecture: Scanners -> Scoring -> Report/API
- Dual output modes: CLI console output and Web dashboard
- Community reporting via external API (aicoevo.net)

## Layers

**Scanners Layer:**
- Purpose: Individual health checks for macOS development environment
- Location: `src/scanners/`
- Contains: 22 scanner implementations (git, node-version, xcode, etc.)
- Depends on: `src/executor/` (for command execution utilities)
- Used by: `src/index.ts` via `scanAll()`

**Executor Layer:**
- Purpose: Cross-platform command execution utilities
- Location: `src/executor/index.ts`
- Contains: `runCommand()`, `commandExists()`, `isAdmin()`, `parsePath()`
- Depends on: Node.js `child_process`, `Buffer`
- Used by: All scanners for running system commands

**Scoring Layer:**
- Purpose: Weighted scoring system by scanner category
- Location: `src/scoring/calculator.ts`
- Contains: `calculateScore()` with category-based weight breakdown
- Depends on: `src/scanners/types.ts` (`ScanResult`)
- Used by: `src/index.ts`, `src/report/html.ts`

**Report Layer:**
- Purpose: HTML report generation
- Location: `src/report/html.ts`
- Contains: `generateHtmlReport()` producing standalone HTML
- Depends on: `src/scoring/calculator.ts`, `src/web/render.ts`
- Used by: External callers (not used internally in current flow)

**API Layer:**
- Purpose: Communication with aicoevo.net community platform
- Location: `src/api/aicoevo-client.ts`
- Contains: `stashData()`, `submitFeedback()`, `createPayload()`, local storage
- Depends on: `src/scanners/types.ts`, `src/scoring/calculator.ts`
- Used by: `src/index.ts` for community reporting

**Web Layer:**
- Purpose: Web UI data rendering and installer management
- Location: `src/web/render.ts`
- Contains: `renderScoreWithTrend()`, `groupByCategory()`, fix definitions
- Depends on: `src/scanners/types.ts`, `src/scoring/calculator.ts`
- Used by: `src/report/html.ts`, `src/index.ts` (Web server)

**Installers Layer:**
- Purpose: One-click installation for AI tools
- Location: `src/installers/index.ts`
- Contains: 8 installer implementations (Claude Code, OpenClaw, etc.)
- Depends on: Node.js `child_process`, `fs`
- Used by: `src/index.ts` via `/api/installers` endpoint

## Data Flow

**Scan Execution Flow:**

1. CLI invocation: `mac-aicheck` or `node dist/index.js scan`
2. `src/index.ts` calls `scanAll()` from `src/scanners/index.ts`
3. `scanAll()` retrieves all registered scanners from registry
4. `Promise.all` executes all scanners in parallel
5. Each scanner calls `runCommand()` from `src/executor/` to check system state
6. Results aggregated as `ScanResult[]`

**Scoring Flow:**

1. `calculateScore(results)` from `src/scoring/calculator.ts`
2. Groups results by category (toolchain, ai-tools, brew, etc.)
3. Applies category weights (permission: 1.2, toolchain: 1.0, brew: 0.8, etc.)
4. Returns `ScoreResult` with breakdown per category

**Web Server Flow:**

1. CLI with `--serve`: `runScan(true)` in `src/index.ts`
2. Saves scan data to `dist/web/scan-data.json`
3. Starts HTTP server on port 7890 (127.0.0.1 only)
4. Serves static web UI from `dist/web/`
5. Handles API routes: `/scan-data.json`, `/api/installers`, `/api/run`, `/api/stash`, `/api/feedback`

**Community Reporting Flow:**

1. Scan results + score packaged via `createPayload()`
2. `stashData(payload)` POSTs to `https://aicoevo.net/api/v1/stash`
3. Returns token for browser-based claim flow
4. `submitFeedback()` allows anonymous feedback submission

## Key Abstractions

**Scanner Interface:**
- Location: `src/scanners/types.ts`
- Pattern: Plugin registration via `registerScanner()`
- Interface:
```typescript
interface Scanner {
  id: string;
  name: string;
  category: ScannerCategory;
  scan(): Promise<ScannerResult>;
}
```
- Self-registering: Each scanner file imports and calls `registerScanner(scanner)`

**Scanner Categories:**
- Location: `src/scanners/registry.ts`
- Categories: `brew`, `apple`, `toolchain`, `ai-tools`, `network`, `permission`, `system`

**Installer Interface:**
- Location: `src/installers/index.ts`
- Pattern: Strategy pattern with `Installer` interface
```typescript
interface Installer {
  id: string;
  name: string;
  description: string;
  icon: string;
  needsAdmin: boolean;
  run(onProgress: (event: InstallEvent) => void): Promise<InstallResult>;
}
```

## Entry Points

**CLI Entry:**
- Location: `src/index.ts`
- Triggers: `node dist/index.js [args]`
- Responsibilities: Scan orchestration, scoring, local storage, Web server, API proxy
- Commands: `scan`, `--serve`, `--json`, `--help`

**Scanner Entry:**
- Location: `src/scanners/index.ts`
- Triggers: Imported by `src/index.ts` on startup
- Responsibilities: Scanner registry, `scanAll()` function, module side-effect imports

## Error Handling

**Strategy:** Graceful degradation with fallback values

**Patterns:**
- Command timeouts: 15s default, 5s for existence checks
- Scanner failures: Return `unknown` status if check fails
- API failures: Non-blocking (`.catch(() => {})` for fingerprint save)
- Path traversal protection in Web server (`filePath.startsWith(WEB_DIR)`)

## Cross-Cutting Concerns

**Logging:** Console output via `chalk` (colored), no structured logging framework

**Validation:** Input sanitization in API client (`sanitize()` removes `<>` chars)

**Authentication:** No internal auth; community features use token-based claim flow

**Security:**
- Whitelisted installer commands only (`ALLOWED_COMMANDS` map)
- Command ID validation prevents injection
- Server bound to localhost only (127.0.0.1)
- Path traversal protection for static file serving

---

*Architecture analysis: 2026/04/12*
