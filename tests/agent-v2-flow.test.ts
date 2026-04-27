import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { main as agentMain, _testHelpers } from '../src/agent/index';

function restoreEnv(name: 'HOME' | 'AICOEVO_BASE_URL' | 'AICOEVO_API_BASE', value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
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
  const originalApiBase = process.env.AICOEVO_API_BASE;

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as { __MAC_AICHECK_TEST_SPAWN__?: unknown }).__MAC_AICHECK_TEST_SPAWN__;
    delete (globalThis as { __MAC_AICHECK_TEST_DNS_LOOKUP__?: unknown }).__MAC_AICHECK_TEST_DNS_LOOKUP__;
    restoreEnv('HOME', originalHome);
    restoreEnv('AICOEVO_BASE_URL', originalBaseUrl);
    restoreEnv('AICOEVO_API_BASE', originalApiBase);
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

  it('blocks loopback, link-local and IPv6 private API bases', () => {
    for (const blockedHost of [
      'http://127.0.0.2',
      'http://169.254.10.20',
      'http://[::ffff:127.0.0.1]',
      'http://[fe80::1]',
      'metadata.google.internal',
    ]) {
      process.env.AICOEVO_API_BASE = blockedHost;
      expect(_testHelpers.isBlockedHost(new URL(blockedHost.startsWith('http') ? blockedHost : `https://${blockedHost}`).hostname)).toBe(true);
      expect(_testHelpers.apiBase()).toBe('https://aicoevo.net/api/v1');
      expect(_testHelpers.agentApiBase('v2')).toBe('https://aicoevo.net/api/v2/agent');
    }
  });

  it('rejects API hosts that resolve to loopback addresses', async () => {
    seedConfig();
    process.env.AICOEVO_API_BASE = 'http://127.0.0.1.nip.io';
    (globalThis as { __MAC_AICHECK_TEST_DNS_LOOKUP__?: (hostname: string) => Promise<Array<{ address: string; family: number }>> }).__MAC_AICHECK_TEST_DNS_LOOKUP__ = async (hostname: string) => {
      expect(hostname).toBe('127.0.0.1.nip.io');
      return [{ address: '127.0.0.1', family: 4 }];
    };
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['bounty-list']);
    const output = stdout.mock.calls.map(call => String(call[0])).join('');
    stdout.mockRestore();

    expect(code).toBe(1);
    expect(output).toContain('解析到内网地址 127.0.0.1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normalizes legacy suffixed device ids before adding the current agent suffix', async () => {
    const home = seedConfig({ deviceId: 'device-test_oc', agentType: 'openclaw', autoSync: false });

    const code = await agentMain(['capture', '--agent', 'claude-code', '--message', 'legacy suffix test']);
    expect(code).toBe(0);

    const outboxPath = path.join(home, '.mac-aicheck', 'outbox', 'events.jsonl');
    const [event] = readFileSync(outboxPath, 'utf8').trim().split('\n').map(line => JSON.parse(line) as { deviceId: string; agent: string });
    expect(event.agent).toBe('claude-code');
    expect(event.deviceId).toBe('device-test_cc');

    let request: { url: string; body?: string } | null = null;
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      request = { url, body: init?.body ? String(init.body) : undefined };
      return mockResponse({ accepted: 1, bountyDrafts: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const syncCode = await agentMain(['sync']);
    expect(syncCode).toBe(0);
    expect(request?.url).toBe('https://aicoevo.net/api/v1/agent-events/batch');
    const body = JSON.parse(request?.body || '{}') as { deviceId: string; events: Array<{ deviceId: string }> };
    expect(body.deviceId).toBe('device-test');
    expect(body.events[0]?.deviceId).toBe('device-test_cc');
  });

  // ── TASK-100: Owner reproduction loop ──

  it('owner-check lists pending owner verifications from status', async () => {
    const home = seedConfig();
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({
        owner_metrics: { queued_problems: 0, solutions_pending_owner: 1 },
        worker_metrics: {},
        pending_owner_verifications: [{
          bounty_id: 'b_001',
          answer_id: 'a_001',
          title: 'npm install fails',
          solution_summary: 'Run npm cache clean --force',
          submitted_at: '2026-04-26T00:00:00Z',
          deadline_at: '2026-04-28T00:00:00Z',
        }],
        timestamp: '2026-04-26T00:00:00Z',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['owner-check']);
    const output = stdout.mock.calls.map(call => String(call[0])).join('');
    stdout.mockRestore();

    expect(code).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://aicoevo.net/api/v2/agent/status');
    expect(output).toContain('b_001');
    expect(output).toContain('a_001');
    expect(output).toContain('npm install fails');
    expect(output).toContain('owner-verify');
    const guidePath = path.join(home, '.mac-aicheck', 'owner-verify', 'b_001__a_001.md');
    const snapshotPath = path.join(home, '.mac-aicheck', 'owner-verify', 'b_001__a_001.json');
    expect(existsSync(guidePath)).toBe(true);
    expect(existsSync(snapshotPath)).toBe(true);
    expect(readFileSync(guidePath, 'utf8')).toContain('AICOEVO 发起者复现指南');
  });

  it('owner-check shows empty message when no pending', async () => {
    seedConfig();
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({
        owner_metrics: {},
        worker_metrics: {},
        pending_owner_verifications: [],
        timestamp: '2026-04-26T00:00:00Z',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['owner-check']);
    const output = stdout.mock.calls.map(call => String(call[0])).join('');
    stdout.mockRestore();

    expect(code).toBe(0);
    expect(output).toContain('没有待复现确认');
  });

  it('owner-verify submits verification result to endpoint', async () => {
    seedConfig();
    let request: { url: string; body?: string } | null = null;
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      request = { url, body: init?.body ? String(init.body) : undefined };
      return {
        status: 200,
        ok: true,
        text: async () => JSON.stringify({
          bounty_id: 'b_001',
          answer_id: 'a_001',
          owner_verification: 'success',
          owner_score: 60,
          community_score: 0,
          total_score: 60,
          threshold: 70,
          review_status: 'pending_review',
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['owner-verify', 'b_001', '--answer', 'a_001', '--result', 'success', '--yes']);
    const output = stdout.mock.calls.map(call => String(call[0])).join('');
    stdout.mockRestore();

    expect(code).toBe(0);
    expect(request?.url).toBe('https://aicoevo.net/api/v2/agent/bounties/b_001/owner-verify');
    const body = JSON.parse(request?.body || '{}');
    expect(body.answer_id).toBe('a_001');
    expect(body.result).toBe('success');
    expect(body.proof_payload.summary).toContain('b_001/a_001');
    expect(body.proof_payload.before_context.item.answer_id).toBe('a_001');
    expect(body.proof_payload.after_context.result).toBe('success');
    expect(body.artifacts.owner_reproduction_guide_path).toContain('b_001__a_001.md');
    expect(body.artifacts.owner_reproduction_snapshot_path).toContain('b_001__a_001.json');
    expect(output).toContain('60');
    expect(output).toContain('pending_review');
  });

  it('owner-verify rejects missing required args', async () => {
    seedConfig();
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => '{}',
    });
    vi.stubGlobal('fetch', fetchMock);

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['owner-verify']);
    const output = stdout.mock.calls.map(call => String(call[0])).join('');
    stdout.mockRestore();

    expect(code).toBe(1);
    expect(output).toContain('用法');
  });

  it('reports version updates once per cached result with a JSON object payload', async () => {
    const home = seedConfig({ upgradeNotify: true, autoUpgrade: false });
    const cachePath = path.join(home, '.mac-aicheck', 'version-cache.json');
    writeFileSync(cachePath, JSON.stringify({
      current: 'node:20.0.0|claude:1.0.0|openclaw:0.9.0',
      latest: 'claude-code: 1.0.0 → 1.1.0',
      repo: '',
      lastCheck: new Date().toISOString(),
      hasUpdate: true,
      updates: [{ name: 'claude-code', current: '1.0.0', latest: '1.1.0' }],
    }), 'utf8');

    (globalThis as { __MAC_AICHECK_TEST_DNS_LOOKUP__?: (hostname: string) => Promise<Array<{ address: string; family: number }>> }).__MAC_AICHECK_TEST_DNS_LOOKUP__ = async (hostname: string) => {
      expect(hostname).toBe('aicoevo.net');
      return [{ address: '93.184.216.34', family: 4 }];
    };

    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await _testHelpers.checkUpdatesWithNotify();
    await _testHelpers.checkUpdatesWithNotify();
    const output = stderr.mock.calls.map(call => String(call[0])).join('');
    stderr.mockRestore();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://aicoevo.net/api/v1/events/tool-version');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || 'null'))).toEqual({
      tool: 'claude-code',
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      eventType: 'version_update_available',
    });
    expect(output.match(/发现新版本/g)).toHaveLength(1);

    const cache = JSON.parse(readFileSync(cachePath, 'utf8')) as { notifiedSignature?: string };
    expect(cache.notifiedSignature).toBe('claude-code:1.0.0->1.1.0');
  });
});

describe('worker-on (TASK-091)', () => {
  const homes: string[] = [];
  const originalHome = process.env.HOME;
  const originalBaseUrl = process.env.AICOEVO_BASE_URL;
  const originalApiBase = process.env.AICOEVO_API_BASE;

  afterEach(() => {
    vi.unstubAllGlobals();
    restoreEnv('HOME', originalHome);
    restoreEnv('AICOEVO_BASE_URL', originalBaseUrl);
    restoreEnv('AICOEVO_API_BASE', originalApiBase);
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

  it('upgradeNotify defaults to true and autoUpgrade defaults to false in config', () => {
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
    expect(cfg.upgradeNotify).toBe(true);
    expect(cfg.autoUpgrade).toBe(false);
  });

  it('config set/get persists runtime boolean settings', async () => {
    seedConfig();
    vi.stubGlobal('fetch', vi.fn());

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const setCode = await agentMain(['config', 'set', 'autoUpgrade', 'true']);
    const getCode = await agentMain(['config', 'get', 'autoUpgrade']);
    const listCode = await agentMain(['config']);
    const output = stdout.mock.calls.map(call => String(call[0])).join('');
    stdout.mockRestore();

    expect(setCode).toBe(0);
    expect(getCode).toBe(0);
    expect(listCode).toBe(0);
    expect(output).toContain('已更新 autoUpgrade = true');
    expect(output).toContain('true');
    expect(output).toContain('"autoUpgrade": true');
    expect(output).toContain('"authToken": "<redacted>"');
    expect(_testHelpers.loadConfig().autoUpgrade).toBe(true);
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

  it('worker lock rejects a live foreign pid and replaces stale locks', async () => {
    const home = seedConfig();
    const lockPath = path.join(home, '.mac-aicheck', 'worker.lock');
    const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { stdio: 'ignore' });

    try {
      writeFileSync(lockPath, JSON.stringify({ pid: holder.pid, startedAt: new Date().toISOString() }), 'utf8');
      expect(_testHelpers.acquireWorkerLock()).toBe(false);
    } finally {
      holder.kill();
      await once(holder, 'exit');
    }

    expect(_testHelpers.acquireWorkerLock()).toBe(true);
    _testHelpers.releaseWorkerLock();
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
