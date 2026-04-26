import { describe, expect, it, vi } from 'vitest';
import { createPayload, stashData } from '../src/api/aicoevo-client';
import type { ScanResult } from '../src/scanners/types';

describe('scan intake upload contract', () => {
  it('createPayload uses the current runtime platform for system info', () => {
    const payload = createPayload([], { score: 100 } as { score: number });
    expect(payload.systemInfo.os).toBe(process.platform);
    expect(payload.systemInfo.hostname).toBeTruthy();
    expect(payload.systemInfo.arch).toBeTruthy();
  });

  it('uploads scan payload to problem-brief scan-intake endpoint', async () => {
    const results: ScanResult[] = [
      {
        id: 'openclaw',
        name: 'OpenClaw',
        category: 'ai-tools',
        status: 'fail',
        message: 'OpenClaw config missing',
        error_type: 'misconfigured',
      },
    ];
    const payload = createPayload(results, { score: 45 } as { score: number });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'abc123',
        claim_url: 'https://aicoevo.net/claim?t=abc123',
        ttl_seconds: 900,
        problem_brief_id: 'pb1',
        evidence_pack_id: 'ep1',
      }),
    });

    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await stashData(payload);
      expect(result.problem_brief_id).toBe('pb1');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://aicoevo.net/api/v1/problem-briefs/scan-intake');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
