# Testing Patterns

**Analysis Date:** 2026/04/12

## Test Framework

**Runner:**
- Vitest (mentioned in CONTRIBUTING.md)
- **Not currently installed** - no vitest dependency in `package.json`
- **No test files exist** in the codebase

**Configuration:**
- No `vitest.config.ts` found
- No `jest.config.*` found

**Run Commands (per CONTRIBUTING.md):**
```bash
npm test              # Run tests with coverage
npm run build         # Build only (actual CI command)
npm run typecheck     # TypeScript type check
```

## Test File Organization

**Location (per CONTRIBUTING.md):**
- `src/__tests__/` - Unit tests for scanners
- **Actual location:** No test files found anywhere in the codebase

**Naming:**
- Pattern: `*.test.ts` or `*.spec.ts`
- Scanner tests: `src/__tests__/scanners/<scanner-name>.test.ts`

**Structure (per CONTRIBUTING.md example):**
```typescript
import { describe, it, expect } from 'vitest';
import { checkGpu } from '../scanners/gpu-monitor';

describe('gpu-monitor', () => {
  it('should detect Apple Silicon GPU', async () => {
    const result = await checkGpu();
    expect(['pass', 'warn', 'fail']).toContain(result.status);
  });
});
```

## Test Coverage

**Target (per CONTRIBUTING.md):**
- 80% coverage for core logic
- **CI gate:** Coverage below 80% should cause `npm test` to fail
- **Actual:** No coverage enforcement - no test command in CI

**View Coverage:**
- Command not documented (framework not configured)

## Test Patterns

### Scanner Testing

**Mock injection via executor `_test` hook:**
```typescript
// src/executor/index.ts
export const _test = {
  mockExecSync: null as ((cmd: string, opts: any) => Buffer) | null,
  mockExistsSync: null as ((path: string) => boolean) | null,
};

export function runCommand(...) {
  if (_test.mockExecSync) {
    try {
      const buf = _test.mockExecSync(cmd, { timeout });
      return { stdout: decodeOutput(buf).trim(), stderr: '', exitCode: 0 };
    } catch (err: any) {
      return {
        stdout: err.stdout ? decodeOutput(err.stdout).trim() : '',
        stderr: err.stderr ? String(err.stderr).trim() : '',
        exitCode: err.status ?? 1,
      };
    }
  }
  // ... actual implementation
}
```

**Usage pattern (for scanner tests):**
```typescript
import { _test } from '../executor/index';

beforeEach(() => {
  _test.mockExecSync = (cmd: string) => Buffer.from('mock output');
});

afterEach(() => {
  _test.mockExecSync = null;
});
```

### Integration Testing

**Scanner registry testing:**
- `src/scanners/registry.ts` provides `clearScanners()` for test isolation
```typescript
export function clearScanners(): void {
  _scanners.length = 0;
}
```

## Mocking

**What to Mock:**
- Command execution: Override `_test.mockExecSync` in `src/executor/index.ts`
- File system: Override `_test.mockExistsSync` in `src/executor/index.ts`
- External APIs: HTTP mocking not implemented

**Mocking Pattern (executor):**
```typescript
// Setup
_test.mockExecSync = (cmd: string, opts: any) => {
  if (cmd.includes('git --version')) {
    return Buffer.from('git version 2.40.0');
  }
  throw { status: 1, stdout: '', stderr: 'command not found' };
};

// Teardown
_test.mockExecSync = null;
```

## CI Integration

**Current CI workflow (`.github/workflows/ci.yml`):**
```yaml
- name: TypeScript type check
  run: npm run typecheck 2>&1 || npm run build 2>&1

- name: Build
  run: npm run build

- name: Test scan (dry run)
  run: node dist/index.js scan 2>&1 | head -20
```

**Gap:** `npm test` is NOT run in CI despite CONTRIBUTING.md stating it should be

**Actual test command in CI:** None - only typecheck and build

## Test Types

**Unit Tests:**
- Scanner logic via mock `_test` hooks
- Scoring calculation
- Registry operations

**Integration Tests:**
- End-to-end via CLI: `node dist/index.js scan`
- Web server endpoints (manual testing only)

**E2E Tests:**
- Not implemented

## Current Testing State

**Critical Gap:** The codebase has:
1. No test dependencies installed
2. No test files written
3. No test command in `package.json`
4. No test runner configured
5. CI does not run tests

**CONTRIBUTING.md specifies tests should exist but they are not implemented.**

## Test Isolation Patterns

**Scanner registration side-effect:**
- Scanners self-register via `import './scanner-name'` (side effect)
- `clearScanners()` clears registry between tests

**Mock isolation:**
- Each test should reset `_test.mockExecSync` and `_test.mockExistsSync` in `afterEach`

---

*Testing analysis: 2026/04/12*
