import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { main as agentMain, _testHelpers } from '../src/agent/index';

function createTempHome() {
  return mkdtempSync(path.join(tmpdir(), 'mac-aicheck-agent-'));
}

function mockResponse(data: unknown, status = 200) {
  const body = JSON.stringify(data);
  return { status, ok: status >= 200 && status < 300, json: async () => data, text: async () => body };
}

function createSpawnStub() {
  const calls: Array<{ command: string; args: string[]; options: Record<string, unknown> }> = [];
  return {
    calls,
    spawnImpl(command: string, args: string[], options: Record<string, unknown>) {
      calls.push({ command, args, options });
      return {
        pid: 50000 + calls.length,
        unref() {},
      };
    },
  };
}

describe('agent v2 flow', () => {
  const homes: string[] = [];
  const originalHome = process.env.HOME;
  const originalBaseUrl = process.env.AICOEVO_BASE_URL;

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as { __MAC_AICHECK_TEST_SPAWN__?: unknown }).__MAC_AICHECK_TEST_SPAWN__;
    process.env.HOME = originalHome;
    process.env.AICOEVO_BASE_URL = originalBaseUrl;
    for (const home of homes.splice(0)) {
      rmSync(home, { recursive: true, force: true });
    }
  });

  function seedConfig(overrides: Record<string, unknown> = {}) {
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
      workerEnabled: true,
      ...overrides,
    }), 'utf8');
    process.env.HOME = home;
    process.env.AICOEVO_BASE_URL = 'https://aicoevo.net';
    return home;
  }

  it('reads recommended bounties from the v2 heartbeat response', async () => {
    seedConfig();
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({
      recommended_bounties: [{ id: 'bounty_1' }, { id: 'bounty_2' }],
    }));
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
      return mockResponse({
        bounty_id: 'bounty_1',
        lease_id: 'lease_1',
        claimed_until: '2026-04-24T12:00:00Z',
        slot_limit: 2,
      });
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

describe('worker-on (TASK-091)', () => {
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

  function seedConfig(overrides: Record<string, unknown> = {}) {
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
      workerEnabled: true,
      ...overrides,
    }), 'utf8');
    process.env.HOME = home;
    process.env.AICOEVO_BASE_URL = 'https://aicoevo.net';
    return home;
  }

  function captureOutput() {
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    });
    return { spy, get output() { return chunks.join(''); } };
  }

  it('workerEnabled defaults to true in config', () => {
    const home = createTempHome();
    homes.push(home);
    const configDir = path.join(home, '.mac-aicheck');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({
      clientId: 'client-test',
      deviceId: 'device-test',
      shareData: true,
      autoSync: true,
      paused: false,
      authToken: 'ak_test_123',
    }), 'utf8');
    process.env.HOME = home;

    const cfg = _testHelpers.loadConfig();
    expect(cfg.workerEnabled).toBe(true);
  });

  it('worker status shows config and state', async () => {
    seedConfig();
    vi.stubGlobal('fetch', vi.fn());
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => { chunks.push(String(chunk)); return true; });
    const code = await agentMain(['worker', 'status']);
    spy.mockRestore();
    const output = chunks.join('');
    expect(code).toBe(0);
    expect(output).toContain('"workerEnabled": true');
    expect(output).toContain('"status": "stopped"');
  });

  it('worker daemon performs heartbeat and processes recommended_bounties', async () => {
    seedConfig();
    const requests: Array<{ url: string; body?: string }> = [];
    let fetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      requests.push({ url, body: init?.body ? String(init.body) : undefined });
      fetchCount++;
      if (fetchCount >= 3) {
        // Disable after one complete cycle
        const cfg = _testHelpers.loadConfig();
        cfg.workerEnabled = false;
        _testHelpers.saveConfig(cfg);
      }
      if (url.includes('/heartbeat')) return mockResponse({ recommended_bounties: [{ id: 'bounty_m1', recommended_env_id: 'mac-py311' }] });
      if (url.includes('/auto-solve')) return mockResponse({ matched: true, answer: 'KB solution', confidence: 0.9 });
      if (url.includes('/claim-and-submit')) return mockResponse({ id: 'ans_m1', bounty_id: 'bounty_m1' });
      return mockResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    const { spy, output } = captureOutput();
    const code = await agentMain(['worker', 'daemon', '--worker-interval', '10']);
    spy.mockRestore();

    expect(code).toBe(0);
    expect(requests[0].url).toContain('/heartbeat');
    expect(requests[0].body).toContain('"worker_status":"active"');
    expect(requests[1].url).toContain('/auto-solve');
    expect(requests[2].url).toContain('/claim-and-submit');
    expect(requests[2].body).toContain('"env_id":"mac-py311"');

    const wState = _testHelpers.loadWorkerState();
    expect(wState.totalCycles).toBeGreaterThanOrEqual(1);
    expect(wState.totalSolved).toBeGreaterThanOrEqual(1);
  });

  it('disable sets workerEnabled to false and persists', async () => {
    seedConfig();
    vi.stubGlobal('fetch', vi.fn());
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => { chunks.push(String(chunk)); return true; });
    const code = await agentMain(['disable']);
    spy.mockRestore();
    const output = chunks.join('');
    expect(code).toBe(0);
    expect(output).toContain('已彻底禁用');
    const cfg = _testHelpers.loadConfig();
    expect(cfg.workerEnabled).toBe(false);
    expect(cfg.paused).toBe(false);
  });

  it('worker-enable re-enables worker without changing upload pause state', async () => {
    seedConfig({ workerEnabled: false, paused: true });
    vi.stubGlobal('fetch', vi.fn());
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => { chunks.push(String(chunk)); return true; });
    const code = await agentMain(['worker-enable']);
    spy.mockRestore();
    const output = chunks.join('');
    expect(code).toBe(0);
    expect(output).toContain('已重新启用');
    const cfg = _testHelpers.loadConfig();
    expect(cfg.workerEnabled).toBe(true);
    expect(cfg.paused).toBe(true);
  });

  it('worker daemon skips unmatched bounties', async () => {
    seedConfig();
    let fetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      fetchCount++;
      if (fetchCount >= 5) {
        const cfg = _testHelpers.loadConfig();
        cfg.workerEnabled = false;
        _testHelpers.saveConfig(cfg);
      }
      if (url.includes('/heartbeat')) return mockResponse({ recommended_bounties: [{ id: 'b1' }, { id: 'b2' }] });
      if (url.includes('/auto-solve')) return mockResponse({ matched: false });
      return mockResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const { spy } = captureOutput();
    const code = await agentMain(['worker', 'daemon', '--worker-interval', '10']);
    spy.mockRestore();
    expect(code).toBe(0);
    const wState = _testHelpers.loadWorkerState();
    expect(wState.totalSolved).toBe(0);
    expect(wState.totalSkipped).toBeGreaterThanOrEqual(2);
  });

  it('enable waits for binding before auto-starting worker', async () => {
    seedConfig({ authToken: undefined });
    const spawn = createSpawnStub();
    (globalThis as { __MAC_AICHECK_TEST_SPAWN__?: unknown }).__MAC_AICHECK_TEST_SPAWN__ = spawn.spawnImpl;
    vi.stubGlobal('fetch', vi.fn());
    const capture = captureOutput();
    const { spy } = capture;
    const code = await agentMain(['enable', '--target', 'claude-code']);
    spy.mockRestore();

    expect(code).toBe(0);
    expect(capture.output).toContain('等待绑定完成后自动启动');
    expect(spawn.calls).toHaveLength(0);
  });

  it('enable auto-starts worker when auth token already exists', async () => {
    seedConfig();
    const spawn = createSpawnStub();
    (globalThis as { __MAC_AICHECK_TEST_SPAWN__?: unknown }).__MAC_AICHECK_TEST_SPAWN__ = spawn.spawnImpl;
    vi.stubGlobal('fetch', vi.fn());
    const capture = captureOutput();
    const { spy } = capture;
    const code = await agentMain(['enable', '--target', 'claude-code']);
    spy.mockRestore();

    expect(code).toBe(0);
    expect(capture.output).toContain('Worker 互助循环: 已启动');
    expect(spawn.calls).toHaveLength(1);
    expect(spawn.calls[0]?.args.join(' ')).toContain('worker daemon');
  });

  it('bind auto-starts worker after token is granted', async () => {
    seedConfig({ authToken: undefined });
    const spawn = createSpawnStub();
    (globalThis as { __MAC_AICHECK_TEST_SPAWN__?: unknown }).__MAC_AICHECK_TEST_SPAWN__ = spawn.spawnImpl;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ api_key: 'ak_test_123' })));
    const capture = captureOutput();
    const { spy } = capture;
    const code = await agentMain(['bind', '--code', '123456']);
    spy.mockRestore();

    expect(code).toBe(0);
    expect(capture.output).toContain('绑定成功');
    expect(capture.output).toContain('Worker 互助循环: 已启动');
    expect(spawn.calls).toHaveLength(1);
    expect(spawn.calls[0]?.args.join(' ')).toContain('worker daemon');
  });
});
