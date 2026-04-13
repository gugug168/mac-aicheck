# External Integrations

**Analysis Date:** 2026-04-12

## APIs & External Services

**Community Reporting Platform:**
- AICoEvo Platform - Community scan data reporting
  - Base URL: `https://aicoevo.net` (configurable via `AICO_EVO_URL`)
  - API Version: v1
  - Client: `src/api/aicoevo-client.ts`
  - Endpoints:
    - `POST /api/v1/stash` - Upload anonymous scan data, returns one-time token
    - `POST /api/v1/feedback` - Submit user feedback
    - `GET /claim?t={token}` - Claim URL for browser-based token redemption
  - Auth: None required (anonymous uploads)

**Legacy API (deprecated):**
- `POST /api/v1/fingerprints` - Old endpoint, still supported for backwards compatibility
  - Uses `AICO_EVO_TOKEN` env var for Authorization header if present

## npm Package Registries

**Primary Registry:**
- `https://registry.npmmirror.com` - Chinese npm mirror (most packages)

**Secondary Registries:**
- `https://registry.npmjs.org` - Official npm registry (CCSwitch and OpenCode)

**Packages Installed via npm:**
- `@anthropic-ai/claude-code` - Claude Code CLI
- `openclaw` - OpenClaw AI framework
- `@google/gemini-cli` - Google Gemini CLI
- `opencode-ai` - OpenCode AI assistant
- `ccswitch` - Claude Code switcher tool
- `cute-claude-hooks` - Claude Code Chinese localization

## Data Storage

**Local File Storage:**
- Location: `~/.mac-aicheck/reports/`
- Format: JSON files named `scan-{timestamp}.json`
- Stores: Complete scan payloads with system info and results

**Web UI Data:**
- Location: `dist/web/scan-data.json`
- Stores: Latest scan results for web dashboard

## Authentication & Identity

**Auth Provider:**
- None - Anonymous community reporting
- Fingerprinting based on system characteristics (not login-based)

## HTTP Proxy Support

**Proxy Agent:**
- Package: `https-proxy-agent` 9.0
- Purpose: Routes HTTPS requests through corporate proxies
- Used by: AICoEvo API calls in `src/api/aicoevo-client.ts`

## CI/CD & Deployment

**Hosting:**
- GitHub Actions (self-hosted runner not used)

**CI Pipeline (`.github/workflows/ci.yml`):**
- Trigger: Push/PR to `main` branch
- Runner: `macos-15` (macOS Sequoia on Apple Silicon)
- Node.js: 20
- Steps:
  1. Checkout code
  2. Setup Node.js 20 with npm cache
  3. `npm ci` - Install dependencies
  4. TypeScript type check
  5. `npm run build` - Compile TypeScript
  6. Dry run scan test

## Environment Configuration

**Required env vars:**
- None strictly required (defaults work out of box)

**Optional env vars:**
- `AICO_EVO_URL` or `AICO_EVO_BASE_URL` - Override AICoEvo API endpoint
- `AICO_EVO_TOKEN` - Legacy API authentication token

**Secrets location:**
- No secrets management system detected
- Environment variables loaded via `dotenv` (but `.env` file not required)

## Webhooks & Callbacks

**Outgoing:**
- Browser opened to `https://aicoevo.net/claim?t={token}` after stash upload (via `buildClaimUrl()`)

**Incoming:**
- None - Tool operates entirely client-side

## System Commands Invoked

The tool spawns these external commands for scanning:

| Command | Purpose |
|---------|---------|
| `sw_vers -productVersion` | Get macOS version |
| `uname -m` | Get CPU architecture |
| `hostname` | Get system hostname |
| `node --version` | Check Node.js |
| `python3 --version` | Check Python |
| `git --version` | Check Git |
| `xcode-select -p` | Check Xcode |
| `system_profiler` | GPU/memory info |
| ` networksetup` | Proxy configuration |
| `security find-certificate` | SSL certificates |
| `npm config get registry` | npm mirror |
| `gh auth status` | GitHub CLI |

---

*Integration audit: 2026-04-12*
