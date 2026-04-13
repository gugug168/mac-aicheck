# Technology Stack

**Analysis Date:** 2026-04-12

## Languages

**Primary:**
- TypeScript 5.4 - All source code

**Secondary:**
- JavaScript - Generated output in `dist/`

## Runtime

**Environment:**
- Node.js 20 (CI uses macos-15 runner with Node.js 20)
- Development on macOS (darwin)

**Package Manager:**
- npm 9+
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- None - Pure Node.js CLI application
- Commander pattern for CLI argument parsing (`commander`)

**Testing:**
- None detected (no test framework in devDependencies)

**Build/Dev:**
- TypeScript 5.4 - TypeScript compiler (`tsc`)
- Node.js built-in `child_process` for spawning processes
- Node.js built-in `http` for local web server

## Key Dependencies

**CLI & Output:**
- `chalk` 5.3 - Terminal string styling
- `commander` 12.0 - CLI argument parsing

**Networking:**
- `https-proxy-agent` 9.0 - HTTPS proxy support for API calls
- Node.js built-in `fetch` (native)

**Configuration:**
- `dotenv` 16.4 - Environment variable loading

**Type Definitions:**
- `@types/node` 20.0

## Configuration

**TypeScript:**
- Config file: `tsconfig.json`
- Target: ES2022
- Module: CommonJS
- Strict mode enabled
- Output: `dist/` directory

**Build Scripts (from `package.json`):**
```json
{
  "build": "tsc",
  "scan": "node dist/index.js scan",
  "report": "node dist/index.js report",
  "upload": "node dist/index.js upload"
}
```

**Environment Variables:**
- `AICO_EVO_URL` or `AICO_EVO_BASE_URL` - Override AICoEvo API base URL (defaults to `https://aicoevo.net`)
- `AICO_EVO_TOKEN` - Optional API token for legacy fingerprint endpoint

## Project Structure

```
mac-aicheck/
├── src/
│   ├── index.ts          # CLI entry, scan orchestration, HTTP server
│   ├── scanners/         # 16 scanner implementations
│   ├── scoring/          # Score calculation
│   ├── report/           # HTML report generation
│   ├── web/              # Web UI rendering
│   ├── api/              # AICoEvo API client
│   └── installers/       # AI tool installer implementations
├── dist/                 # Compiled JavaScript output
├── package.json
└── tsconfig.json
```

## Platform Requirements

**Development:**
- Node.js 20+
- npm 9+
- TypeScript 5.4+
- macOS (scanners invoke macOS-specific commands)

**Production:**
- Node.js runtime (compiled to CommonJS)
- macOS environment (scanners check macOS-specific paths and commands)

---

*Stack analysis: 2026-04-12*
