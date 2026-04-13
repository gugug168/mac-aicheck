# Coding Conventions

**Analysis Date:** 2026/04/12

## Naming Patterns

**Files:**
- Scanners: kebab-case (e.g., `node-version.ts`, `git-identity-config.ts`)
- Modules: PascalCase for types/interfaces, camelCase otherwise (e.g., `aicoevo-client.ts`, `calculator.ts`)

**Functions:**
- camelCase: `calculateScore`, `runCommand`, `scanAll`
- Verb-first naming: `getScanners`, `checkGpu`, `isAdmin`

**Variables:**
- camelCase: `exitCode`, `prevScore`, `totalWeightedPass`
- UPPER_SNAKE_CASE for constants: `MAX_BODY`, `PORT`, `DEFAULT_TIMEOUT`, `CATEGORY_WEIGHTS`

**Types:**
- PascalCase: `ScanResult`, `Scanner`, `ScoreResult`, `Installer`, `AICOEVOPayload`
- Descriptive names: `ScannerCategory`, `ScoreGrade`, `InstallEvent`

## Code Style

**Formatting:**
- Tool: Not configured (CONTRIBUTING.md references `.prettierrc` but file not present)
- Manual formatting observed: 2-space indentation, no trailing semicolons in some files
- Line limit: 200 lines per file (ESLint `max-lines` rule mentioned in CONTRIBUTING.md)

**Linting:**
- Tool: Not configured (CONTRIBUTING.md references `.eslintrc` but file not present)
- TypeScript strict mode enabled (`tsconfig.json`: `"strict": true`)

**TypeScript Settings:**
```json
{
  "target": "ES2022",
  "module": "commonjs",
  "strict": true,
  "esModuleInterop": true,
  "forceConsistentCasingInFileNames": true
}
```

## Import Organization

**Order (observed):**
1. Built-in modules: `fs`, `path`, `http`, `child_process`, `os`
2. External libraries: `chalk`, `commander`, `dotenv`, `https-proxy-agent`
3. Internal modules: `../scanners/types`, `./executor/index`, `../api/aicoevo-client`

**Path style:**
- Relative imports with `./` or `../` prefixes
- No path aliases configured (no `paths` in tsconfig)

**Example imports:**
```typescript
import * as fs from 'fs';
import * as path from 'path';
import { scanAll } from './scanners/index';
import type { ScanResult } from './scanners/types';
```

## Error Handling

**Patterns:**

1. **Try-catch with type annotation:**
```typescript
try {
  // operation
} catch (e: any) {
  res.writeHead(502, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: '无法连接 aicoevo.net: ' + e.message }));
}
```

2. **Silent catch for non-critical operations:**
```typescript
saveFingerprint(payload).catch(() => {}); // non-blocking
```

3. **Empty catch blocks:**
```typescript
} catch { /* skip corrupt */ }
```

4. **Error-type catches with early return:**
```typescript
} catch (err: any) {
  return {
    stdout: err.stdout ? decodeOutput(err.stdout).trim() : '',
    stderr: err.stderr ? (err.stderr as Buffer).toString('utf-8').trim() : '',
    exitCode: err.status ?? 1,
  };
}
```

5. **Nullish coalescing for defaults:**
```typescript
const weight = CATEGORY_WEIGHTS[category] ?? 1.0;
```

## Logging

**Framework:** `console` (built-in Node.js)

**Patterns:**
```typescript
console.log(`[*] MacAICheck scanning...\n`);
console.log(`Score: ${score.score}/100 ${score.label}`);
console.error(`Error: ${err.message}`);
```

## Comments

**Style:** JSDoc for public APIs, inline comments for business logic

**Examples:**
```typescript
/**
 * AICO EVO 平台 API 客户端
 * 文档: https://github.com/gugug168/aicoevo-platform
 */

/**
 * 上传扫描数据到 stash，获取一次性 token（无需登录）
 */
export async function stashData(payload: AICOEVOPayload): Promise<StashResponse>

/** @deprecated 使用 stashData + buildClaimUrl 代替 */
```

## Function Design

**Size:** Small, focused functions (CONTRIBUTING.md mandates max 200 lines)

**Parameters:**
- Typed parameters with interfaces
- Timeout parameters with defaults: `runCommand(cmd: string, timeout = DEFAULT_TIMEOUT)`

**Return Values:**
- Explicit return types for exported functions
- Promise-based async for I/O operations

## Module Design

**Exports:**
- Named exports preferred
- Type-only exports use `export type { ... }`

**Barrel Files:**
- `src/scanners/index.ts` exports all scanners and registry functions
- `src/installers/index.ts` exports installer registry

**Scanner Pattern:**
```typescript
// src/scanners/<name>.ts
import type { Scanner, ScanResult } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'my-scanner',
  name: 'My Scanner',
  category: 'toolchain',

  async scan(): Promise<ScanResult> {
    return { id: this.id, name: this.name, category: this.category, status: 'pass',
      message: `detected` };
  },
};
registerScanner(scanner);
```

## Security Patterns

**Whitelisting for command execution:**
```typescript
const ALLOWED_COMMANDS: Record<string, { cmd: string }> = {
  'claude-code': { cmd: 'npm install -g @anthropic-ai/claude-code --registry=https://registry.npmmirror.com' },
  // ...
};

const entry = ALLOWED_COMMANDS[id || ''];
if (!entry) {
  res.writeHead(403);
  res.end(JSON.stringify({ error: 'Unknown installer ID' }));
  return;
}
```

**Path traversal protection:**
```typescript
let filePath = path.join(WEB_DIR, pathname === '/' ? 'index.html' : pathname);
if (!filePath.startsWith(WEB_DIR)) {
  res.writeHead(403);
  res.end('Forbidden');
  return;
}
```

## Async Patterns

**Async/await for I/O:**
```typescript
async function scanAll(): Promise<ScanResult[]> {
  const scanners = getScanners();
  const results = await Promise.all(scanners.map(s => s.scan()));
  return results;
}
```

**Promise-based child_process:**
```typescript
return new Promise((resolve) => {
  const proc = spawn('bash', ['-c', cmd], { stdio: ['pipe', 'pipe', 'pipe'] });
  proc.on('close', (code) => resolve(code ?? 1));
  proc.on('error', () => resolve(1));
});
```

---

*Convention analysis: 2026/04/12*
