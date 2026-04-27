import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createPayload } from '../src/api/aicoevo-client';
import { _testHelpers } from '../src/agent/index';
import type { ScanResult } from '../src/scanners/types';

describe('AICOEVO contract alignment', () => {
  it('includes error_type in uploaded scan payload', () => {
    const results: ScanResult[] = [
      {
        id: 'python-versions',
        name: 'Python',
        category: 'toolchain',
        status: 'fail',
        message: 'Python 版本过旧',
        error_type: 'outdated',
      },
    ];

    const payload = createPayload(results, { score: 42 } as { score: number });

    expect(payload.results[0].error_type).toBe('outdated');
  });

  it('only treats ak_ tokens as bounty-capable API keys', () => {
    expect(_testHelpers.agentApiKeyHeaders({ authToken: 'ak_live_123' })).toEqual({
      'X-API-Key': 'ak_live_123',
    });
    expect(_testHelpers.agentApiKeyHeaders({ authToken: 'jwt-token' })).toBeNull();
    expect(_testHelpers.agentApiKeyHeaders({})).toBeNull();
  });

  it('uses v2 agent routes for bounty and review flows', () => {
    expect(_testHelpers.agentApiBase()).toBe('https://aicoevo.net/api/v2/agent');
    expect(_testHelpers.agentApiBase('v1')).toBe('https://aicoevo.net/api/v1/agent');
  });

  it('keeps VERSION aligned with package.json', async () => {
    const repoRoot = path.resolve(__dirname, '..');
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { version: string };
    const releaseVersion = readFileSync(path.join(repoRoot, 'VERSION'), 'utf8').trim();

    expect(releaseVersion).toBe(pkg.version);
  });
});
