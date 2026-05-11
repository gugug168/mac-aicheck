/**
 * tests/agent-e2e.test.ts
 *
 * End-to-end tests for the AICO EVO Agent integration:
 *   status (bound/unbound) → bounty-recommended → bounty-list → worker status → owner-check → review-list
 *
 * All HTTP calls are stubbed via vi.stubGlobal('fetch').
 * Each test uses an isolated temp HOME directory.
 *
 * NOTE: main() expects the argv AFTER the top-level "agent" dispatch.
 * For CLI "mac-aicheck agent status", index.ts calls main(['status']).
 * So test calls use argv WITHOUT the leading 'agent' element.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { main as agentMain } from '../src/agent/index';

function createTempHome(): string {
  const home = path.join(tmpdir(), `mac-aicheck-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(home, { recursive: true });
  return home;
}

function mockResponse(data: unknown, status = 200) {
  return { status, ok: status >= 200 && status < 300, json: async () => data, text: async () => JSON.stringify(data) };
}

function seedConfig(home: string, overrides: Record<string, unknown> = {}) {
  mkdirSync(path.join(home, '.mac-aicheck'), { recursive: true });
  writeFileSync(
    path.join(home, '.mac-aicheck', 'config.json'),
    JSON.stringify({
      clientId: 'cli_test',
      deviceId: 'device_test',
      profileId: 'prof_test123',
      authToken: 'ak_test_valid',
      shareData: true,
      autoSync: true,
      paused: false,
      workerEnabled: true,
      ...overrides,
    }),
  );
}

describe('agent e2e — AICO EVO integration', () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.HOME = originalHome ?? '/Users/gugu';
  });

  // ── agent status — unbound state ─────────────────────────────────────────

  it('status returns connected:false when not bound', async () => {
    const home = createTempHome();
    process.env.HOME = home;

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['status']);
    const output = stdout.mock.calls.map(c => String(c[0])).join('');
    stdout.mockRestore();

    expect(code).toBe(0);
    expect(JSON.parse(output).connected).toBe(false);
  });

  it('status returns connected:true with authToken', async () => {
    const home = createTempHome();
    process.env.HOME = home;
    seedConfig(home);

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['status']);
    const output = stdout.mock.calls.map(c => String(c[0])).join('');
    stdout.mockRestore();

    expect(code).toBe(0);
    expect(JSON.parse(output).connected).toBe(true);
    expect(JSON.parse(output).profileId).toBe('prof_test123');
  });

  // ── bounty-recommended ───────────────────────────────────────────────────

  it('bounty-recommended returns items from heartbeat v2', async () => {
    const home = createTempHome();
    process.env.HOME = home;
    seedConfig(home);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      recommended_bounties: [
        { id: 'b001', title: 'Fix CUDA OOM', reward: 10, status: 'open' },
        { id: 'b002', title: 'npm install fails', reward: 5, status: 'open' },
      ],
    })));

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['bounty-recommended', '--limit', '5']);
    const output = stdout.mock.calls.map(c => String(c[0])).join('');
    stdout.mockRestore();

    expect(code).toBe(0);
    expect(output).toContain('b001');
    expect(output).toContain('b002');
  });

  it('bounty-recommended requires authToken', async () => {
    const home = createTempHome();
    process.env.HOME = home;
    seedConfig(home, { authToken: '' });

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['bounty-recommended']);
    const output = stdout.mock.calls.map(c => String(c[0])).join('');
    stdout.mockRestore();

    expect(code).toBe(1);
    expect(output).toContain('bind');
  });

  // ── bounty-list ─────────────────────────────────────────────────────────

  it('bounty-list returns bounty items paginated', async () => {
    const home = createTempHome();
    process.env.HOME = home;
    seedConfig(home);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      data: [{ id: 'f2417839c4', title: '8GB VRAM llama.cpp OOM', reward: 10, status: 'open' }],
    })));

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['bounty-list', '--page', '1', '--limit', '10']);
    stdout.mockRestore();

    expect(code).toBe(0);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const calledUrl = vi.mocked(fetch).mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('/agent/bounties');
  });

  // ── worker status ───────────────────────────────────────────────────────

  it('worker status returns worker config and daemon state', async () => {
    const home = createTempHome();
    process.env.HOME = home;
    seedConfig(home);

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['worker', 'status']);
    const output = stdout.mock.calls.map(c => String(c[0])).join('');
    stdout.mockRestore();

    const r = JSON.parse(output);
    expect(code).toBe(0);
    expect(r.ok).toBe(true);
    expect(r.workerEnabled).toBe(true);
    expect(r.worker).toBeDefined();
  });

  it('worker status includes automation readiness flags', async () => {
    const home = createTempHome();
    process.env.HOME = home;
    seedConfig(home, { workerEnabled: true, paused: false });

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['worker', 'status']);
    const output = stdout.mock.calls.map(c => String(c[0])).join('');
    stdout.mockRestore();

    const r = JSON.parse(output);
    expect(code).toBe(0);
    expect(r.automation.api_key_bound).toBe(true);
    expect(r.automation.worker_enabled).toBe(true);
  });

  // ── owner-check ─────────────────────────────────────────────────────────

  it('owner-check returns pending verifications from heartbeat', async () => {
    const home = createTempHome();
    process.env.HOME = home;
    seedConfig(home);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      pending_owner_verifications: [
        { bounty_id: '7b1971364d', answer_id: '39e3588385', status: 'pending' },
      ],
      recommended_bounties: [],
    })));

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['owner-check']);
    const output = stdout.mock.calls.map(c => String(c[0])).join('');
    stdout.mockRestore();

    expect(code).toBe(0);
    expect(output).toContain('7b1971364d');
  });

  it('owner-check handles empty pending list gracefully', async () => {
    const home = createTempHome();
    process.env.HOME = home;
    seedConfig(home);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      pending_owner_verifications: [],
      recommended_bounties: [],
    })));

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['owner-check']);
    stdout.mockRestore();

    expect(code).toBe(0);
  });

  // ── review-list ─────────────────────────────────────────────────────────

  it('review-list returns review items from the platform', async () => {
    const home = createTempHome();
    process.env.HOME = home;
    seedConfig(home);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      items: [{ lease_id: 'lease_abc', bounty_id: 'bounty_1', status: 'in_progress' }],
      total: 1,
    })));

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['review-list']);
    const output = stdout.mock.calls.map(c => String(c[0])).join('');
    stdout.mockRestore();

    expect(code).toBe(0);
    expect(output).toContain('lease_abc');
  });

  it('review-list returns empty list when no reviews available', async () => {
    const home = createTempHome();
    process.env.HOME = home;
    seedConfig(home);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ items: [], total: 0 })));

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['review-list']);
    stdout.mockRestore();

    expect(code).toBe(0);
  });
});
