import { describe, expect, it } from 'vitest';
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
});
