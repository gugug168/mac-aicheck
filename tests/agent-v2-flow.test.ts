import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { main as agentMain } from '../src/agent/index';

function createTempHome() {
  return mkdtempSync(path.join(tmpdir(), 'mac-aicheck-agent-'));
}

describe('agent v2 flow', () => {
  const homes: string[] = [];
  const originalHome = process.env.HOME;
  const originalBaseUrl = process.env.AICOEVO_BASE_URL;

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.HOME = originalHome;
    process.env.AICOEVO_BASE_URL = originalBaseUrl;
    for (const home of homes.splice(0)) {
      rmSync(home, { recursive: true, force: true });
    }
  });

  function seedConfig() {
    const home = createTempHome();
    homes.push(home);
    const configDir = path.join(home, '.mac-aicheck');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({
      clientId: 'client-test',
      deviceId: 'device-test',
      authToken: 'ak_test_123',
      shareData: true,
      autoSync: true,
      paused: false,
    }), 'utf8');
    process.env.HOME = home;
    process.env.AICOEVO_BASE_URL = 'https://aicoevo.net';
  }

  it('reads recommended bounties from the v2 heartbeat response', async () => {
    seedConfig();
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ recommended_bounties: [{ id: 'bounty_1' }, { id: 'bounty_2' }] }),
      json: async () => ({ recommended_bounties: [{ id: 'bounty_1' }, { id: 'bounty_2' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['bounty-recommended', '--limit', '1']);
    const output = stdout.mock.calls.map(call => String(call[0])).join('');
    stdout.mockRestore();

    expect(code).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://aicoevo.net/api/v2/agent/heartbeat');
    expect(output).toContain('"id": "bounty_1"');
    expect(output).not.toContain('"id": "bounty_2"');
  });

  it('heartbeats before claiming a v2 solver slot', async () => {
    seedConfig();
    const calls: Array<{ url: string; body?: string }> = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? String(init.body) : undefined });
      return {
        status: 200,
        ok: true,
        text: async () => JSON.stringify({
          bounty_id: 'bounty_1',
          lease_id: 'lease_1',
          claimed_until: '2026-04-24T12:00:00Z',
          slot_limit: 2,
        }),
        json: async () => ({
          bounty_id: 'bounty_1',
          lease_id: 'lease_1',
          claimed_until: '2026-04-24T12:00:00Z',
          slot_limit: 2,
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['bounty-claim', 'bounty_1']);
    const output = stdout.mock.calls.map(call => String(call[0])).join('');
    stdout.mockRestore();

    expect(code).toBe(0);
    expect(calls.map(call => call.url)).toEqual([
      'https://aicoevo.net/api/v2/agent/heartbeat',
      'https://aicoevo.net/api/v2/agent/bounties/bounty_1/claim',
    ]);
    expect(calls[1]?.body).toBe('{}');
    expect(output).toContain('lease_1');
  });
});
