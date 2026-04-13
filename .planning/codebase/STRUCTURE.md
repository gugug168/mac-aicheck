# Codebase Structure

**Analysis Date:** 2026/04/12

## Directory Layout

```
mac-aicheck/
├── src/                    # TypeScript source
│   ├── index.ts           # Main entry point (CLI + HTTP server)
│   ├── scanners/          # Scanner implementations
│   │   ├── index.ts       # Registry + scanAll()
│   │   ├── types.ts      # Scanner, ScanResult types
│   │   ├── registry.ts   # Registration functions
│   │   └── *.ts           # Individual scanner modules
│   ├── executor/          # Command execution utilities
│   │   └── index.ts       # runCommand, commandExists, isAdmin
│   ├── scoring/           # Score calculation
│   │   └── calculator.ts # Weighted scoring
│   ├── report/            # HTML report generation
│   │   └── html.ts        # generateHtmlReport()
│   ├── api/                # aicoevo.net API client
│   │   └── aicoevo-client.ts
│   ├── web/                # Web UI data rendering
│   │   └── render.ts      # renderScoreWithTrend(), FIX_DEFS
│   ├── installers/        # One-click installers
│   │   └── index.ts       # 8 installer implementations
│   └── ...
├── dist/                   # Compiled JavaScript output
│   ├── index.js           # Compiled entry point
│   ├── scanners/          # Compiled scanners
│   ├── web/               # Static web UI assets
│   └── ...
├── dist/web/              # Web UI static files (committed)
│   └── index.html
├── package.json           # Project manifest
├── tsconfig.json          # TypeScript configuration
├── .github/workflows/     # CI/CD pipelines
└── .planning/codebase/   # This analysis output
```

## Directory Purposes

**src/scanners/:**
- Purpose: Individual health check implementations
- Contains: 22 scanner modules, types, registry
- Key files: `index.ts`, `registry.ts`, `types.ts`

**src/executor/:**
- Purpose: Cross-platform command execution
- Contains: Single file with utility functions
- Key file: `index.ts`

**src/scoring/:**
- Purpose: Weighted scoring by category
- Contains: Score calculation logic
- Key file: `calculator.ts`

**src/report/:**
- Purpose: HTML report generation
- Contains: Standalone HTML generator
- Key file: `html.ts`

**src/api/:**
- Purpose: External API communication
- Contains: aicoevo.net client
- Key file: `aicoevo-client.ts`

**src/web/:**
- Purpose: Web UI data preparation
- Contains: Score rendering, category grouping
- Key file: `render.ts`

**src/installers/:**
- Purpose: Tool installation helpers
- Contains: 8 installer implementations
- Key file: `index.ts`

**dist/:**
- Purpose: Compiled JavaScript output
- Generated: Yes (by `npm run build`)
- Committed: Yes (includes web UI assets)

## Key File Locations

**Entry Points:**
- `src/index.ts` - Main CLI and HTTP server (shebang: `#!/usr/bin/env node`)
- `dist/index.js` - Compiled entry (registered as `bin.mac-aicheck`)

**Configuration:**
- `package.json` - Dependencies, scripts, bin entry
- `tsconfig.json` - TypeScript config (ES2022, commonjs)

**Core Logic:**
- `src/scanners/index.ts` - Scanner orchestration
- `src/scoring/calculator.ts` - Scoring algorithm
- `src/api/aicoevo-client.ts` - Community reporting

**Web Server:**
- `src/index.ts` (lines 31-214) - HTTP server implementation

## Naming Conventions

**Files:**
- TypeScript: `kebab-case.ts` (e.g., `node-version.ts`, `git-identity-config.ts`)
- Compiled: Same structure in `dist/`

**Directories:**
- kebab-case: `scanners/`, `api/`, `web/`, `installers/`

**Types/Interfaces:**
- PascalCase: `Scanner`, `ScanResult`, `Installer`, `ScoreResult`

**Scanner IDs:**
- kebab-case: `git`, `node-version`, `apple-silicon`, `npm-mirror`

**Categories:**
- kebab-case: `toolchain`, `ai-tools`, `brew`, `network`, `apple`, `permission`, `system`

## Where to Add New Code

**New Scanner:**
- Implementation: `src/scanners/{scanner-name}.ts`
- Pattern: Import types, executor, registry; define scanner object; call `registerScanner(scanner)`
- Template:
```typescript
import type { Scanner, ScanResult } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'my-scanner',
  name: 'My Scanner',
  category: 'toolchain',
  async scan(): Promise<ScanResult> {
    // implementation
  },
};
registerScanner(scanner);
```

**New Installer:**
- Implementation: `src/installers/index.ts` (add to `ALL_INSTALLERS` array)
- Pattern: Define `Installer` object with `id`, `name`, `description`, `icon`, `needsAdmin`, `run()`
- Registration: Add to `getInstallers()` return

**New Web API Route:**
- Implementation: `src/index.ts` in the HTTP server section
- Pattern: Add route handler in `serveHttp()` function
- Security: Validate input, whitelist commands

**New Report Section:**
- Implementation: `src/report/html.ts`
- Pattern: Add HTML generation function

## Special Directories

**dist/web/:**
- Purpose: Static web UI (HTML, CSS, JS for dashboard)
- Generated: No (committed directly)
- Committed: Yes
- Contains: `index.html` served by HTTP server

**.planning/codebase/:**
- Purpose: This analysis output
- Generated: Yes (by this analysis)
- Committed: No

---

*Structure analysis: 2026/04/12*
