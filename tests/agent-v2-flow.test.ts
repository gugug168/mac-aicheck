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
    delete (globalThis as { __MAC_AICHECK_TEST_EXEC__?: unknown }).__MAC_AICHECK_TEST_EXEC__;
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

  it('bounty-submit forwards validation contract fields when provided', async () => {
    seedConfig();
    const calls: Array<{ url: string; body?: string }> = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? String(init.body) : undefined });
      return mockResponse({ id: 'ans_submit_1' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain([
      'bounty-submit',
      'bounty_1',
      '--content',
      'Use pytest to verify',
      '--cmd',
      'pytest -q',
      '--validation-cmd',
      'pytest -q',
      '--expected-output',
      '3 passed',
      '--summary',
      'Run tests after fix',
    ]);
    stdout.mockRestore();

    expect(code).toBe(0);
    expect(calls[0]?.url).toBe('https://aicoevo.net/api/v2/agent/bounties/bounty_1/submit');
    const body = JSON.parse(calls[0]?.body || '{}');
    expect(body.commands_run).toEqual(['pytest -q']);
    expect(body.proof_payload.validation_cmd).toBe('pytest -q');
    expect(body.proof_payload.expected_output).toBe('3 passed');
    expect(body.proof_payload.summary).toBe('Run tests after fix');
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
          execution_decision: {
            decision: 'ask_user_run',
            phase: 'owner_verification',
            current_profile_is_target: true,
            target_route: {
              profile_id: 'prof_001',
              device_id: 'device_001',
              agent_type: 'claude-code',
            },
          },
          user_authorization_gate: {
            allow_safe_validation_autorun: false,
            require_web_confirmation_for_validation: true,
          },
          web_confirmation: {
            confirmed: false,
          },
          prepare_state: {
            prepared: false,
            prepared_action: 'manual_confirm_only',
          },
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
    expect(output).toContain('执行决策: ask_user_run');
    expect(output).toContain('目标机器: profile=prof_001 / device=device_001 / agent=claude-code');
    expect(output).toContain('自动验证: blocked');
    expect(output).toContain('平台放行: manual_confirm_only');
    expect(output).toContain('自动运行授权: 未开启');
    expect(output).toContain('网站确认: 待确认');
    expect(output).toContain('阻塞原因: missing_validation_command');
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

  it('review-list keeps the matched project directory instead of walking to a parent folder', async () => {
    const home = seedConfig();
    const projectDir = path.join(home, 'repo');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(path.join(projectDir, 'test_review_ready.py'), '# smoke\n', 'utf8');
    const outboxPath = path.join(home, '.mac-aicheck', 'outbox', 'events.jsonl');
    mkdirSync(path.dirname(outboxPath), { recursive: true });
    writeFileSync(
      outboxPath,
      JSON.stringify({
        fingerprint: 'fp_review_ready_1',
        eventType: 'post_tool_error',
        agent: 'claude-code',
        deviceId: 'device-test',
        occurredAt: '2026-04-30T00:00:00Z',
        toolContext: {
          command: 'pytest -q',
          filePath: path.join(projectDir, 'test_review_ready.py'),
          fileName: 'test_review_ready.py',
          cwd: projectDir,
        },
        localContext: {
          cwdHash: 'cwdhash-review-ready-1',
        },
      }) + '\n',
      'utf8',
    );

    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        items: [
          {
            assignment_id: 'lease_1',
            answer: { id: 'a_ready_1', content: 'Fix review ready issue' },
            submission_run: {
              proof_payload: {
                validation_cmd: 'pytest -q',
                expected_output: '3 passed',
                summary: 'Dependency mismatch resolved',
              },
              commands_run: ['pytest -q'],
            },
            project_hint: {
              fingerprint: 'fp_review_ready_1',
              event_type: 'post_tool_error',
              cwd_hash: 'cwdhash-review-ready-1',
              origin_device_id: 'device-test',
              origin_agent_type: 'claude-code',
              tool_context: {
                command: 'pytest -q',
                fileName: 'test_review_ready.py',
              },
            },
          },
        ],
        total: 1,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['review-list']);
    const output = stdout.mock.calls.map(call => String(call[0])).join('');
    stdout.mockRestore();

    expect(code).toBe(0);
    const data = JSON.parse(output) as {
      items: Array<{ local_automation_readiness: { status: string; suggested_project_dir: string } }>;
    };
    expect(data.items[0]?.local_automation_readiness.status).toBe('ready');
    expect(data.items[0]?.local_automation_readiness.suggested_project_dir).toBe(projectDir);
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

  it('treats failed upgrade results as unsuccessful', () => {
    expect(_testHelpers.isUpgradeCommandOk([
      { name: 'claude-code', from: '1.0.0', to: '1.1.0', status: 'upgraded' },
      { name: 'openclaw', from: '2.0.0', to: '2.1.0', status: 'failed: brew exited 1' },
    ])).toBe(false);

    expect(_testHelpers.isUpgradeCommandOk([
      { name: 'claude-code', from: '1.0.0', to: '1.1.0', status: 'upgraded' },
      { name: 'openclaw', from: '2.0.0', to: '2.0.0', status: 'up to date' },
    ])).toBe(true);
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
    expect(output).toContain('"api_key_bound": true');
    expect(output).toContain('"hook_not_configured"');
  });

  it('draft-organizer run-once fetches only the current profile batch and submits one reconcile payload', async () => {
    seedConfig({
      profileId: 'prof_mac',
      draftOrganizerEnabled: true,
      draftOrganizerMode: 'apply',
      draftOrganizerTriggerMode: 'manual_only',
      draftOrganizerScheduleDays: 7,
    });

    const calls: Array<{ url: string; body?: string }> = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? String(init.body) : undefined });
      if (url.endsWith('/api/v2/agent/status')) {
        return mockResponse({
          owner_metrics: {},
          worker_metrics: {},
          pending_owner_verifications: [],
          pending_draft_reconcile_batches: [
            {
              id: 'batch_mac_1',
              title: 'Mac OpenClaw draft reconcile',
              profile_id: 'prof_mac',
              profile_label: 'Mac OpenClaw',
              draft_count: 1,
              requested_at: '2026-04-29T08:00:00Z',
              trigger: 'manual',
              status: 'queued',
            },
            {
              id: 'batch_other_1',
              title: 'Other profile batch',
              profile_id: 'prof_other',
              profile_label: 'Other profile',
              draft_count: 1,
              requested_at: '2026-04-29T08:00:00Z',
              trigger: 'manual',
              status: 'queued',
            },
            {
              id: 'batch_scheduled_1',
              title: 'Scheduled batch for same profile',
              profile_id: 'prof_mac',
              profile_label: 'Mac OpenClaw',
              draft_count: 1,
              requested_at: '2026-04-29T08:05:00Z',
              trigger: 'scheduled',
              status: 'queued',
            },
          ],
          timestamp: '2026-04-29T08:00:00Z',
        });
      }
      if (url.endsWith('/api/v2/agent/draft-reconcile-batches/batch_mac_1')) {
        return mockResponse({
          id: 'batch_mac_1',
          profile_id: 'prof_mac',
          drafts: [
            {
              id: 'draft_mac_1',
              title: 'Mac draft',
              source_data: {
                origin_profile_id: 'prof_mac',
                origin_device_id: 'device-test',
                origin_agent_type: 'openclaw',
                event_ids: ['evt_mac_1'],
              },
            },
          ],
        });
      }
      if (url.endsWith('/api/v2/agent/draft-reconcile-batches/batch_mac_1/submit')) {
        return mockResponse({ ok: true, accepted: 1 });
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const capture = captureOutput();
    const code = await agentMain(['draft-organizer', 'run-once']);
    capture.spy.mockRestore();

    expect(code).toBe(0);
    expect(calls.map(call => call.url)).toContain('https://aicoevo.net/api/v2/agent/status');
    expect(calls.map(call => call.url)).toContain('https://aicoevo.net/api/v2/agent/draft-reconcile-batches/batch_mac_1');
    expect(calls.map(call => call.url)).toContain('https://aicoevo.net/api/v2/agent/draft-reconcile-batches/batch_mac_1/submit');
    expect(calls.some(call => call.url.includes('batch_other_1'))).toBe(false);
    expect(calls.some(call => call.url.includes('batch_scheduled_1'))).toBe(false);
    expect(calls.find(call => call.url.endsWith('/submit'))?.body).toContain('"draft_id":"draft_mac_1"');
  });

  it('draft-organizer status shows config summary', async () => {
    seedConfig({
      profileId: 'prof_mac',
      draftOrganizerEnabled: true,
      draftOrganizerMode: 'dry_run',
      draftOrganizerTriggerMode: 'hybrid',
      draftOrganizerScheduleDays: 14,
    });

    vi.stubGlobal('fetch', vi.fn());
    const capture = captureOutput();
    const code = await agentMain(['draft-organizer', 'status']);
    capture.spy.mockRestore();

    expect(code).toBe(0);
    expect(capture.output).toContain('"enabled": true');
    expect(capture.output).toContain('"mode": "dry_run"');
    expect(capture.output).toContain('"scheduleDays": 14');
    expect(capture.output).toContain('"profileId": "prof_mac"');
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

  it('worker daemon skips strict submission bounties before auto-solve', async () => {
    seedConfig();
    const requests: Array<{ url: string; body?: string }> = [];
    let fetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      requests.push({ url, body: init?.body ? String(init.body) : undefined });
      fetchCount++;
      if (fetchCount >= 3) {
        const cfg = _testHelpers.loadConfig();
        cfg.workerEnabled = false;
        _testHelpers.saveConfig(cfg);
      }
      if (url.includes('/heartbeat')) {
        return mockResponse({
          recommended_bounties: [
            {
              id: 'bounty_strict_1',
              submission_auto_contract_required: true,
              submission_automation_policy: 'strict',
            },
          ],
        });
      }
      if (url.includes('/reviews/recommended')) return mockResponse({ items: [] });
      if (url.includes('/status')) return mockResponse({ pending_owner_verifications: [] });
      return mockResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    const capture = captureOutput();
    const code = await agentMain(['worker', 'daemon', '--worker-interval', '10']);
    capture.spy.mockRestore();

    expect(code).toBe(0);
    expect(requests[0]?.url).toContain('/heartbeat');
    expect(requests.some(req => req.url.includes('/auto-solve'))).toBe(false);
    expect(requests.some(req => req.url.includes('/claim-and-submit'))).toBe(false);
    expect(capture.output).toContain('平台要求严格自动化契约');
    const wState = _testHelpers.loadWorkerState();
    expect(wState.totalSkipped).toBeGreaterThanOrEqual(1);
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

  it('worker daemon auto-submits owner verification with a safe validation command', async () => {
    const home = seedConfig();
    const projectRoot = path.join(home, 'demo-owner-project');
    const projectFile = path.join(projectRoot, 'tests', 'test_owner_auto.py');
    mkdirSync(path.dirname(projectFile), { recursive: true });
    writeFileSync(path.join(projectRoot, 'pyproject.toml'), '[project]\nname="demo-owner"\n', 'utf8');
    writeFileSync(projectFile, 'print("ok")\n', 'utf8');
    const outboxPath = path.join(home, '.mac-aicheck', 'outbox', 'events.jsonl');
    mkdirSync(path.dirname(outboxPath), { recursive: true });
    writeFileSync(outboxPath, `${JSON.stringify({
      eventId: 'evt_owner_auto_1',
      deviceId: 'device-test_cc',
      agent: 'claude-code',
      fingerprint: 'fp_owner_auto_1',
      eventType: 'post_tool_error',
      occurredAt: '2026-04-30T00:00:00Z',
      sanitizedMessage: 'pytest failed in test_owner_auto.py',
      toolContext: { filePath: projectFile, command: 'pytest -q' },
    })}\n`, 'utf8');
    const requests: Array<{ url: string; body?: string }> = [];
    let fetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      requests.push({ url, body: init?.body ? String(init.body) : undefined });
      fetchCount++;
      if (fetchCount >= 3) {
        const cfg = _testHelpers.loadConfig();
        cfg.workerEnabled = false;
        _testHelpers.saveConfig(cfg);
      }
      if (url.includes('/heartbeat')) return mockResponse({ recommended_bounties: [] });
      if (url.includes('/status')) {
        return mockResponse({
          pending_owner_verifications: [{
            bounty_id: 'b_owner_1',
            answer_id: 'a_owner_1',
            title: 'pytest owner auto',
            solution_summary: 'Run tests again',
            submitted_at: '2026-04-30T00:00:00Z',
            deadline_at: '2026-05-02T00:00:00Z',
            validation_cmd: 'pytest -q',
            expected_output: '3 passed',
            commands_run: ['pip install -r requirements.txt', 'pytest -q'],
            project_hint: {
              fingerprint: 'fp_owner_auto_1',
              event_type: 'post_tool_error',
              origin_device_id: 'device-test',
              origin_agent_type: 'claude-code',
              tool_context: { fileName: 'test_owner_auto.py', command: 'pytest -q' },
            },
            automation_contract: { mode: 'auto', auto_run_allowed: true },
            automation_readiness: { status: 'ready', selected_command: 'pytest -q' },
          }],
        });
      }
      if (url.includes('/owner-validation-tasks/prepare')) {
        return mockResponse({
          prepared: true,
          prepared_action: 'run_validation_now',
          prepare_state: { prepared: true, prepared_action: 'run_validation_now' },
        });
      }
      if (url.includes('/owner-verify')) return mockResponse({ review_status: 'pending_review', owner_score: 60, total_score: 60, threshold: 70 });
      return mockResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    (globalThis as {
      __MAC_AICHECK_TEST_EXEC__?: (command: string, options?: { cwd?: string }) => { exitCode: number; stdout?: string; stderr?: string };
    }).__MAC_AICHECK_TEST_EXEC__ = (command: string, options?: { cwd?: string }) => {
      expect(command).toBe('pytest -q');
      expect(options?.cwd).toBe(projectRoot);
      return { exitCode: 0, stdout: '3 passed', stderr: '' };
    };

    const { spy } = captureOutput();
    const code = await agentMain(['worker', 'daemon', '--worker-interval', '10']);
    spy.mockRestore();

    expect(code).toBe(0);
    expect(requests[0]?.url).toContain('/heartbeat');
    expect(requests[1]?.url).toContain('/reviews/recommended');
    expect(requests[2]?.url).toContain('/status');
    expect(requests[3]?.url).toContain('/owner-validation-tasks/prepare');
    expect(requests[4]?.url).toContain('/owner-verify');
    const prepareBody = JSON.parse(requests[3]?.body || '{}');
    expect(prepareBody.answer_id).toBe('a_owner_1');
    const body = JSON.parse(requests[4]?.body || '{}');
    expect(body.result).toBe('success');
    expect(body.commands_run).toEqual(['pytest -q']);
    expect(body.proof_payload.validation_cmd).toBe('pytest -q');
    expect(body.proof_payload.after_context.confirmation_mode).toBe('worker_auto');
    expect(body.artifacts.owner_reproduction_project_dir).toBe(projectRoot);
    expect(body.stdout_digest).toContain('3 passed');
    const wState = _testHelpers.loadWorkerState();
    expect(wState.totalOwnerVerified).toBeGreaterThanOrEqual(1);
  });

  it('worker daemon auto-submits reviewer verification with a safe validation command', async () => {
    const home = seedConfig();
    const projectRoot = path.join(home, 'demo-review-project');
    const projectFile = path.join(projectRoot, 'tests', 'test_review_auto.py');
    mkdirSync(path.dirname(projectFile), { recursive: true });
    writeFileSync(path.join(projectRoot, 'pyproject.toml'), '[project]\nname="demo-review"\n', 'utf8');
    writeFileSync(projectFile, 'print("ok")\n', 'utf8');
    const outboxPath = path.join(home, '.mac-aicheck', 'outbox', 'events.jsonl');
    mkdirSync(path.dirname(outboxPath), { recursive: true });
    writeFileSync(outboxPath, `${JSON.stringify({
      eventId: 'evt_review_auto_1',
      deviceId: 'device-test_cc',
      agent: 'claude-code',
      fingerprint: 'fp_review_auto_1',
      eventType: 'post_tool_error',
      occurredAt: '2026-04-30T00:00:00Z',
      sanitizedMessage: 'pytest failed in test_review_auto.py',
      toolContext: { filePath: projectFile, command: 'pytest -q' },
    })}\n`, 'utf8');
    const requests: Array<{ url: string; body?: string }> = [];
    let fetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      requests.push({ url, body: init?.body ? String(init.body) : undefined });
      fetchCount++;
      if (fetchCount >= 4) {
        const cfg = _testHelpers.loadConfig();
        cfg.workerEnabled = false;
        _testHelpers.saveConfig(cfg);
      }
      if (url.includes('/heartbeat')) return mockResponse({ recommended_bounties: [] });
      if (url.includes('/reviews/recommended')) {
        return mockResponse({
          items: [{
            assignment_id: 'lease_review_1',
            answer: { id: 'a_review_1', content: 'Review me' },
            submission_run: {
              proof_payload: { summary: 'Run tests', validation_cmd: 'pytest -q', expected_output: '3 passed' },
              commands_run: ['pip install -r requirements.txt', 'pytest -q'],
            },
              project_hint: {
                fingerprint: 'fp_review_auto_1',
                event_type: 'post_tool_error',
                origin_device_id: 'device-test',
                origin_agent_type: 'claude-code',
                tool_context: { fileName: 'test_review_auto.py', command: 'pytest -q' },
              },
              automation_contract: { mode: 'auto', auto_run_allowed: true },
              automation_readiness: { status: 'ready', selected_command: 'pytest -q' },
            }],
            total: 1,
          });
        }
      if (url.includes('/reviews/lease_review_1/submit')) return mockResponse({ ok: true });
      if (url.includes('/status')) return mockResponse({ pending_owner_verifications: [] });
      return mockResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    (globalThis as {
      __MAC_AICHECK_TEST_EXEC__?: (command: string, options?: { cwd?: string }) => { exitCode: number; stdout?: string; stderr?: string };
    }).__MAC_AICHECK_TEST_EXEC__ = (command: string, options?: { cwd?: string }) => {
      expect(command).toBe('pytest -q');
      expect(options?.cwd).toBe(projectRoot);
      return { exitCode: 0, stdout: '3 passed', stderr: '' };
    };

    const { spy } = captureOutput();
    const code = await agentMain(['worker', 'daemon', '--worker-interval', '10']);
    spy.mockRestore();

    expect(code).toBe(0);
    expect(requests[1]?.url).toContain('/reviews/recommended');
    expect(requests[2]?.url).toContain('/reviews/lease_review_1/submit');
    const body = JSON.parse(requests[2]?.body || '{}');
    expect(body.result).toBe('success');
    expect(body.method).toBe('execution');
    expect(body.commands_run).toEqual(['pytest -q']);
    expect(body.proof_payload.validation_cmd).toBe('pytest -q');
    expect(body.proof_payload.after_context.review_mode).toBe('worker_auto');
    expect(body.proof_payload.after_context.validation_cwd).toBe(projectRoot);
    expect(body.artifacts.validation_workdir).toBe(projectRoot);
    const wState = _testHelpers.loadWorkerState();
    expect(wState.totalReviewsSubmitted).toBeGreaterThanOrEqual(1);
  });

  it('worker daemon auto-submits owner verification from captured cwd when file path is missing', async () => {
    const home = seedConfig();
    const projectRoot = path.join(home, 'demo-owner-cwd-project');
    mkdirSync(path.join(projectRoot, 'tests'), { recursive: true });
    writeFileSync(path.join(projectRoot, 'pyproject.toml'), '[project]\nname="demo-owner-cwd"\n', 'utf8');
    const outboxPath = path.join(home, '.mac-aicheck', 'outbox', 'events.jsonl');
    mkdirSync(path.dirname(outboxPath), { recursive: true });
    writeFileSync(outboxPath, `${JSON.stringify({
      eventId: 'evt_owner_auto_cwd_1',
      deviceId: 'device-test_cc',
      agent: 'claude-code',
      fingerprint: 'fp_owner_auto_cwd_1',
      eventType: 'post_tool_error',
      occurredAt: '2026-04-30T00:00:00Z',
      sanitizedMessage: 'pytest failed in current workspace',
      localContext: { cwdHash: 'cwdhash-owner-auto-1' },
      toolContext: { cwd: projectRoot, command: 'pytest -q' },
    })}\n`, 'utf8');
    const requests: Array<{ url: string; body?: string }> = [];
    let fetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      requests.push({ url, body: init?.body ? String(init.body) : undefined });
      fetchCount++;
      if (fetchCount >= 3) {
        const cfg = _testHelpers.loadConfig();
        cfg.workerEnabled = false;
        _testHelpers.saveConfig(cfg);
      }
      if (url.includes('/heartbeat')) return mockResponse({ recommended_bounties: [] });
      if (url.includes('/status')) {
        return mockResponse({
          pending_owner_verifications: [{
            bounty_id: 'b_owner_cwd_1',
            answer_id: 'a_owner_cwd_1',
            title: 'pytest owner auto via cwd',
            solution_summary: 'Run tests again',
            submitted_at: '2026-04-30T00:00:00Z',
            deadline_at: '2026-05-02T00:00:00Z',
            validation_cmd: 'pytest -q',
            expected_output: '3 passed',
            commands_run: ['pytest -q'],
            project_hint: {
              fingerprint: 'fp_owner_auto_cwd_1',
              event_type: 'post_tool_error',
              cwd_hash: 'cwdhash-owner-auto-1',
              origin_agent_type: 'claude-code',
              tool_context: { command: 'pytest -q' },
            },
            automation_contract: { mode: 'auto', auto_run_allowed: true },
            automation_readiness: { status: 'ready', selected_command: 'pytest -q' },
          }],
        });
      }
      if (url.includes('/owner-validation-tasks/prepare')) {
        return mockResponse({
          prepared: true,
          prepared_action: 'run_validation_now',
          prepare_state: { prepared: true, prepared_action: 'run_validation_now' },
        });
      }
      if (url.includes('/owner-verify')) return mockResponse({ review_status: 'pending_review', owner_score: 60, total_score: 60, threshold: 70 });
      return mockResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    (globalThis as {
      __MAC_AICHECK_TEST_EXEC__?: (command: string, options?: { cwd?: string }) => { exitCode: number; stdout?: string; stderr?: string };
    }).__MAC_AICHECK_TEST_EXEC__ = (command: string, options?: { cwd?: string }) => {
      expect(command).toBe('pytest -q');
      expect(options?.cwd).toBe(projectRoot);
      return { exitCode: 0, stdout: '3 passed', stderr: '' };
    };

    const { spy } = captureOutput();
    const code = await agentMain(['worker', 'daemon', '--worker-interval', '10']);
    spy.mockRestore();

    expect(code).toBe(0);
    expect(requests[3]?.url).toContain('/owner-validation-tasks/prepare');
    expect(requests[4]?.url).toContain('/owner-verify');
    const body = JSON.parse(requests[4]?.body || '{}');
    expect(body.artifacts.owner_reproduction_project_dir).toBe(projectRoot);
    expect(body.proof_payload.after_context.local_context.project_dir).toBe(projectRoot);
  });

  it('worker daemon waits for website confirmation before owner auto validation', async () => {
    const home = seedConfig();
    const projectRoot = path.join(home, 'demo-owner-web-confirm-project');
    mkdirSync(path.join(projectRoot, 'tests'), { recursive: true });
    writeFileSync(path.join(projectRoot, 'pyproject.toml'), '[project]\nname="demo-owner-web-confirm"\n', 'utf8');
    const outboxPath = path.join(home, '.mac-aicheck', 'outbox', 'events.jsonl');
    mkdirSync(path.dirname(outboxPath), { recursive: true });
    writeFileSync(outboxPath, `${JSON.stringify({
      eventId: 'evt_owner_web_gate_1',
      deviceId: 'device-test_cc',
      agent: 'claude-code',
      fingerprint: 'fp_owner_web_gate',
      eventType: 'post_tool_error',
      occurredAt: '2026-04-30T00:00:00Z',
      sanitizedMessage: 'pytest failed before web confirm',
      toolContext: { cwd: projectRoot, command: 'pytest -q' },
    })}\n`, 'utf8');
    const requests: string[] = [];
    let fetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      requests.push(url);
      fetchCount++;
      if (fetchCount >= 3) {
        const cfg = _testHelpers.loadConfig();
        cfg.workerEnabled = false;
        _testHelpers.saveConfig(cfg);
      }
      if (url.includes('/heartbeat')) return mockResponse({ recommended_bounties: [] });
      if (url.includes('/status')) {
        return mockResponse({
          pending_owner_verifications: [{
            bounty_id: 'b_owner_web_gate',
            answer_id: 'a_owner_web_gate',
            title: 'owner web confirmation required',
            solution_summary: 'Run tests again',
            submitted_at: '2026-04-30T00:00:00Z',
            deadline_at: '2026-05-02T00:00:00Z',
            validation_cmd: 'pytest -q',
            commands_run: ['pytest -q'],
            project_hint: {
              fingerprint: 'fp_owner_web_gate',
              event_type: 'post_tool_error',
              cwd_hash: '',
              origin_agent_type: 'claude-code',
              tool_context: { command: 'pytest -q' },
            },
            automation_contract: { mode: 'auto', auto_run_allowed: true },
            automation_readiness: { status: 'ready', selected_command: 'pytest -q' },
          }],
        });
      }
      if (url.includes('/owner-validation-tasks/prepare')) {
        return mockResponse({
          prepared: false,
          prepared_action: 'confirm_on_web_then_run',
          prepare_state: {
            prepared: false,
            prepared_action: 'confirm_on_web_then_run',
            web_confirmation_required: true,
            web_confirmation_recorded: false,
          },
        });
      }
      return mockResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const execSpy = vi.fn();
    (globalThis as {
      __MAC_AICHECK_TEST_EXEC__?: (command: string) => { exitCode: number; stdout?: string; stderr?: string };
    }).__MAC_AICHECK_TEST_EXEC__ = (command: string) => {
      execSpy(command);
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    const capture = captureOutput();
    const code = await agentMain(['worker', 'daemon', '--worker-interval', '10']);
    capture.spy.mockRestore();

    expect(code).toBe(0);
    expect(execSpy).not.toHaveBeenCalled();
    expect(requests.some(url => url.includes('/owner-validation-tasks/prepare'))).toBe(true);
    expect(requests.some(url => url.includes('/owner-verify'))).toBe(false);
    expect(capture.output).toContain('需要先在网站确认后再运行');
  });

  it('worker daemon blocks Mac L2 owner repair before backup rollback parity', async () => {
    seedConfig();
    const requests: string[] = [];
    let fetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      requests.push(url);
      fetchCount++;
      if (fetchCount >= 3) {
        const cfg = _testHelpers.loadConfig();
        cfg.workerEnabled = false;
        _testHelpers.saveConfig(cfg);
      }
      if (url.includes('/heartbeat')) return mockResponse({ recommended_bounties: [] });
      if (url.includes('/status')) {
        return mockResponse({
          pending_owner_verifications: [{
            bounty_id: 'b_mac_repair',
            answer_id: 'a_mac_repair',
            title: 'mac repair should block',
            solution_summary: 'Attempt L2 repair',
            validation_cmd: 'pytest -q',
            execution_decision: {
              phase: 'owner_verification',
              decision: 'auto_validate',
              current_profile_is_target: true,
            },
            execution_task: {
              kind: 'owner_repair',
              risk_level: 'L2',
              recommended_action: 'run_repair_now',
              auto_run_allowed: true,
              validation_cmd: 'pytest -q',
              repair_capability: {
                scanner_id: 'npm-mirror',
                backup_available: true,
                rollback_available: true,
              },
              rollback_state: { available: true },
              rollback_ready: true,
            },
            prepare_state: {
              prepared: true,
              prepared_action: 'run_repair_now',
              consent_state: 'granted',
              rollback_ready: true,
            },
          }],
        });
      }
      if (url.includes('/owner-validation-tasks/prepare')) {
        return mockResponse({
          prepared: true,
          prepared_action: 'run_repair_now',
          execution_task: {
            kind: 'owner_repair',
            risk_level: 'L2',
            recommended_action: 'run_repair_now',
            auto_run_allowed: true,
            repair_capability: {
              scanner_id: 'npm-mirror',
              backup_available: true,
              rollback_available: true,
            },
            rollback_state: { available: true },
            rollback_ready: true,
          },
          prepare_state: {
            prepared: true,
            prepared_action: 'run_repair_now',
            consent_state: 'granted',
            rollback_ready: true,
          },
        });
      }
      return mockResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const execSpy = vi.fn();
    (globalThis as {
      __MAC_AICHECK_TEST_EXEC__?: (command: string) => { exitCode: number; stdout?: string; stderr?: string };
    }).__MAC_AICHECK_TEST_EXEC__ = (command: string) => {
      execSpy(command);
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    const capture = captureOutput();
    const code = await agentMain(['worker', 'daemon', '--worker-interval', '10']);
    capture.spy.mockRestore();

    expect(code).toBe(0);
    expect(execSpy).not.toHaveBeenCalled();
    expect(requests.some(url => url.includes('/owner-validation-tasks/prepare'))).toBe(true);
    expect(requests.some(url => url.includes('/owner-verify'))).toBe(false);
    expect(capture.output).toContain('MacAICheck 暂未开放 L2 自动修复');
  });

  it('worker daemon skips owner auto validation when platform prepare stays manual only', async () => {
    const home = seedConfig();
    const projectRoot = path.join(home, 'demo-owner-prepare-manual-project');
    mkdirSync(path.join(projectRoot, 'tests'), { recursive: true });
    writeFileSync(path.join(projectRoot, 'pyproject.toml'), '[project]\nname="demo-owner-manual"\n', 'utf8');
    const outboxPath = path.join(home, '.mac-aicheck', 'outbox', 'events.jsonl');
    mkdirSync(path.dirname(outboxPath), { recursive: true });
    writeFileSync(outboxPath, `${JSON.stringify({
      eventId: 'evt_owner_prepare_manual_1',
      deviceId: 'device-test_cc',
      agent: 'claude-code',
      fingerprint: 'fp_owner_prepare_manual',
      eventType: 'post_tool_error',
      occurredAt: '2026-04-30T00:00:00Z',
      sanitizedMessage: 'pytest failed before prepare manual',
      toolContext: { cwd: projectRoot, command: 'pytest -q' },
    })}\n`, 'utf8');
    const requests: string[] = [];
    let fetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      requests.push(url);
      fetchCount++;
      if (fetchCount >= 3) {
        const cfg = _testHelpers.loadConfig();
        cfg.workerEnabled = false;
        _testHelpers.saveConfig(cfg);
      }
      if (url.includes('/heartbeat')) return mockResponse({ recommended_bounties: [] });
      if (url.includes('/status')) {
        return mockResponse({
          pending_owner_verifications: [{
            bounty_id: 'b_owner_prepare_manual',
            answer_id: 'a_owner_prepare_manual',
            title: 'owner prepare manual only',
            solution_summary: 'Run tests again',
            submitted_at: '2026-04-30T00:00:00Z',
            deadline_at: '2026-05-02T00:00:00Z',
            validation_cmd: 'pytest -q',
            commands_run: ['pytest -q'],
            project_hint: {
              fingerprint: 'fp_owner_prepare_manual',
              event_type: 'post_tool_error',
              origin_agent_type: 'claude-code',
              tool_context: { command: 'pytest -q' },
            },
            automation_contract: { mode: 'auto', auto_run_allowed: true },
            automation_readiness: { status: 'ready', selected_command: 'pytest -q' },
          }],
        });
      }
      if (url.includes('/owner-validation-tasks/prepare')) {
        return mockResponse({
          prepared: false,
          prepared_action: 'manual_confirm_only',
          prepare_state: {
            prepared: false,
            prepared_action: 'manual_confirm_only',
          },
        });
      }
      return mockResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const execSpy = vi.fn();
    (globalThis as {
      __MAC_AICHECK_TEST_EXEC__?: (command: string) => { exitCode: number; stdout?: string; stderr?: string };
    }).__MAC_AICHECK_TEST_EXEC__ = (command: string) => {
      execSpy(command);
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    const capture = captureOutput();
    const code = await agentMain(['worker', 'daemon', '--worker-interval', '10']);
    capture.spy.mockRestore();

    expect(code).toBe(0);
    expect(execSpy).not.toHaveBeenCalled();
    expect(requests.some(url => url.includes('/owner-validation-tasks/prepare'))).toBe(true);
    expect(requests.some(url => url.includes('/owner-verify'))).toBe(false);
    expect(capture.output).toContain('平台未放行自动执行');
  });

  it('worker daemon writes owner prompt when platform routes execution back to the origin machine', async () => {
    seedConfig();
    const requests: string[] = [];
    let fetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      requests.push(url);
      fetchCount++;
      if (fetchCount >= 2) {
        const cfg = _testHelpers.loadConfig();
        cfg.workerEnabled = false;
        _testHelpers.saveConfig(cfg);
      }
      if (url.includes('/heartbeat')) return mockResponse({ recommended_bounties: [] });
      if (url.includes('/status')) {
        return mockResponse({
          pending_owner_verifications: [{
            bounty_id: 'b_owner_prompt',
            answer_id: 'a_owner_prompt',
            title: 'prompt owner on origin machine',
            solution_summary: 'Please verify on the original machine',
            submitted_at: '2026-04-30T00:00:00Z',
            deadline_at: '2026-05-02T00:00:00Z',
            execution_decision: {
              decision: 'ask_user_run',
              phase: 'owner_verification',
              current_profile_is_target: true,
              target_route: {
                profile_id: 'prof-owner',
                device_id: 'device-owner',
                agent_type: 'claude-code',
              },
            },
          }],
        });
      }
      return mockResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const execSpy = vi.fn();
    (globalThis as {
      __MAC_AICHECK_TEST_EXEC__?: (command: string) => { exitCode: number; stdout?: string; stderr?: string };
    }).__MAC_AICHECK_TEST_EXEC__ = (command: string) => {
      execSpy(command);
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    const capture = captureOutput();
    const code = await agentMain(['worker', 'daemon', '--worker-interval', '10']);
    capture.spy.mockRestore();

    expect(code).toBe(0);
    expect(execSpy).not.toHaveBeenCalled();
    expect(requests.some(url => url.includes('/owner-verify'))).toBe(false);
    expect(capture.output).toContain('owner-prompt 待人工确认 b_owner_prompt/a_owner_prompt');
    const wState = _testHelpers.loadWorkerState();
    expect(wState.totalOwnerSkipped).toBeGreaterThanOrEqual(1);
  });

  it('worker daemon skips owner verification when only unsafe commands are available', async () => {
    seedConfig();
    const requests: string[] = [];
    let fetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      requests.push(url);
      fetchCount++;
      if (fetchCount >= 2) {
        const cfg = _testHelpers.loadConfig();
        cfg.workerEnabled = false;
        _testHelpers.saveConfig(cfg);
      }
      if (url.includes('/heartbeat')) return mockResponse({ recommended_bounties: [] });
      if (url.includes('/status')) {
        return mockResponse({
          pending_owner_verifications: [{
            bounty_id: 'b_owner_unsafe',
            answer_id: 'a_owner_unsafe',
            title: 'unsafe owner auto',
            solution_summary: 'Validation command: npm install left-pad',
            submitted_at: '2026-04-30T00:00:00Z',
            deadline_at: '2026-05-02T00:00:00Z',
            validation_cmd: 'npm install left-pad',
            commands_run: ['npm install left-pad'],
          }],
        });
      }
      return mockResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const execSpy = vi.fn();
    (globalThis as {
      __MAC_AICHECK_TEST_EXEC__?: (command: string) => { exitCode: number; stdout?: string; stderr?: string };
    }).__MAC_AICHECK_TEST_EXEC__ = (command: string) => {
      execSpy(command);
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    const capture = captureOutput();
    const code = await agentMain(['worker', 'daemon', '--worker-interval', '10']);
    capture.spy.mockRestore();

    expect(code).toBe(0);
    expect(execSpy).not.toHaveBeenCalled();
    expect(requests.some(url => url.includes('/owner-verify'))).toBe(false);
    expect(capture.output).toContain('无可自动执行的验证命令');
    const wState = _testHelpers.loadWorkerState();
    expect(wState.totalOwnerSkipped).toBeGreaterThanOrEqual(1);
  });

  it('worker daemon skips owner verification when command is safe but not a real validation', async () => {
    seedConfig();
    const requests: string[] = [];
    let fetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      requests.push(url);
      fetchCount++;
      if (fetchCount >= 2) {
        const cfg = _testHelpers.loadConfig();
        cfg.workerEnabled = false;
        _testHelpers.saveConfig(cfg);
      }
      if (url.includes('/heartbeat')) return mockResponse({ recommended_bounties: [] });
      if (url.includes('/status')) {
        return mockResponse({
          pending_owner_verifications: [{
            bounty_id: 'b_owner_safe_skip',
            answer_id: 'a_owner_safe_skip',
            title: 'safe but meaningless owner auto',
            solution_summary: 'Validation command: python --version',
            submitted_at: '2026-04-30T00:00:00Z',
            deadline_at: '2026-05-02T00:00:00Z',
            validation_cmd: 'python --version',
            commands_run: ['python --version'],
          }],
        });
      }
      return mockResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const execSpy = vi.fn();
    (globalThis as {
      __MAC_AICHECK_TEST_EXEC__?: (command: string) => { exitCode: number; stdout?: string; stderr?: string };
    }).__MAC_AICHECK_TEST_EXEC__ = (command: string) => {
      execSpy(command);
      return { exitCode: 0, stdout: 'Python 3.12.0', stderr: '' };
    };

    const capture = captureOutput();
    const code = await agentMain(['worker', 'daemon', '--worker-interval', '10']);
    capture.spy.mockRestore();

    expect(code).toBe(0);
    expect(execSpy).not.toHaveBeenCalled();
    expect(requests.some(url => url.includes('/owner-verify'))).toBe(false);
    expect(capture.output).toContain('无可自动执行的验证命令');
    const wState = _testHelpers.loadWorkerState();
    expect(wState.totalOwnerSkipped).toBeGreaterThanOrEqual(1);
  });

  it('worker daemon skips owner verification when platform marks the answer as manual-only', async () => {
    seedConfig();
    const requests: string[] = [];
    let fetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      requests.push(url);
      fetchCount++;
      if (fetchCount >= 2) {
        const cfg = _testHelpers.loadConfig();
        cfg.workerEnabled = false;
        _testHelpers.saveConfig(cfg);
      }
      if (url.includes('/heartbeat')) return mockResponse({ recommended_bounties: [] });
      if (url.includes('/status')) {
        return mockResponse({
          pending_owner_verifications: [{
            bounty_id: 'b_owner_manual_only',
            answer_id: 'a_owner_manual_only',
            title: 'manual only owner auto',
            solution_summary: 'Run tests again',
            submitted_at: '2026-04-30T00:00:00Z',
            deadline_at: '2026-05-02T00:00:00Z',
            validation_cmd: 'pytest -q',
            commands_run: ['pytest -q'],
            automation_contract: { mode: 'manual_only', auto_run_allowed: false },
            automation_readiness: {
              status: 'degraded',
              selected_command: 'pytest -q',
              warning_reasons: ['missing_project_locator_hint'],
            },
          }],
        });
      }
      return mockResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const execSpy = vi.fn();
    (globalThis as {
      __MAC_AICHECK_TEST_EXEC__?: (command: string) => { exitCode: number; stdout?: string; stderr?: string };
    }).__MAC_AICHECK_TEST_EXEC__ = (command: string) => {
      execSpy(command);
      return { exitCode: 0, stdout: '3 passed', stderr: '' };
    };

    const capture = captureOutput();
    const code = await agentMain(['worker', 'daemon', '--worker-interval', '10']);
    capture.spy.mockRestore();

    expect(code).toBe(0);
    expect(execSpy).not.toHaveBeenCalled();
    expect(requests.some(url => url.includes('/owner-verify'))).toBe(false);
    expect(capture.output).toContain('平台已标记为 manual-only');
  });

  it('worker daemon skips reviewer verification when command is safe but not a real validation', async () => {
    seedConfig();
    const requests: Array<{ url: string; body?: string }> = [];
    let fetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      requests.push({ url, body: init?.body ? String(init.body) : undefined });
      fetchCount++;
      if (fetchCount >= 3) {
        const cfg = _testHelpers.loadConfig();
        cfg.workerEnabled = false;
        _testHelpers.saveConfig(cfg);
      }
      if (url.includes('/heartbeat')) return mockResponse({ recommended_bounties: [] });
      if (url.includes('/reviews/recommended')) {
        return mockResponse({
          items: [{
            assignment_id: 'lease_review_safe_skip',
            answer: { id: 'a_review_safe_skip', content: 'Review me safely' },
            submission_run: {
              proof_payload: {
                summary: 'Use python --version',
                validation_cmd: 'python --version',
                expected_output: 'Python 3.12.0',
              },
              commands_run: ['python --version'],
            },
          }],
          total: 1,
        });
      }
      if (url.includes('/status')) return mockResponse({ pending_owner_verifications: [] });
      return mockResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const execSpy = vi.fn();
    (globalThis as {
      __MAC_AICHECK_TEST_EXEC__?: (command: string) => { exitCode: number; stdout?: string; stderr?: string };
    }).__MAC_AICHECK_TEST_EXEC__ = (command: string) => {
      execSpy(command);
      return { exitCode: 0, stdout: 'Python 3.12.0', stderr: '' };
    };

    const capture = captureOutput();
    const code = await agentMain(['worker', 'daemon', '--worker-interval', '10']);
    capture.spy.mockRestore();

    expect(code).toBe(0);
    expect(execSpy).not.toHaveBeenCalled();
    expect(requests.some(req => req.url.includes('/reviews/lease_review_safe_skip/submit'))).toBe(false);
    expect(capture.output).toContain('无可自动执行的验证命令');
    const wState = _testHelpers.loadWorkerState();
    expect(wState.totalReviewSkipped).toBeGreaterThanOrEqual(1);
  });

  it('worker daemon skips reviewer verification when platform marks the answer as manual-only', async () => {
    seedConfig();
    const requests: Array<{ url: string; body?: string }> = [];
    let fetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      requests.push({ url, body: init?.body ? String(init.body) : undefined });
      fetchCount++;
      if (fetchCount >= 3) {
        const cfg = _testHelpers.loadConfig();
        cfg.workerEnabled = false;
        _testHelpers.saveConfig(cfg);
      }
      if (url.includes('/heartbeat')) return mockResponse({ recommended_bounties: [] });
      if (url.includes('/reviews/recommended')) {
        return mockResponse({
          items: [{
            assignment_id: 'lease_review_manual_only',
            answer: { id: 'a_review_manual_only', content: 'Review me manually' },
            submission_run: {
              proof_payload: { validation_cmd: 'pytest -q', expected_output: '3 passed' },
              commands_run: ['pytest -q'],
            },
            project_hint: {},
            automation_contract: { mode: 'manual_only', auto_run_allowed: false },
            automation_readiness: {
              status: 'degraded',
              selected_command: 'pytest -q',
              warning_reasons: ['missing_project_locator_hint'],
            },
          }],
          total: 1,
        });
      }
      if (url.includes('/status')) return mockResponse({ pending_owner_verifications: [] });
      return mockResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const execSpy = vi.fn();
    (globalThis as {
      __MAC_AICHECK_TEST_EXEC__?: (command: string) => { exitCode: number; stdout?: string; stderr?: string };
    }).__MAC_AICHECK_TEST_EXEC__ = (command: string) => {
      execSpy(command);
      return { exitCode: 0, stdout: '3 passed', stderr: '' };
    };

    const capture = captureOutput();
    const code = await agentMain(['worker', 'daemon', '--worker-interval', '10']);
    capture.spy.mockRestore();

    expect(code).toBe(0);
    expect(execSpy).not.toHaveBeenCalled();
    expect(requests.some(({ url }) => url.includes('/reviews/lease_review_manual_only/submit'))).toBe(false);
    expect(capture.output).toContain('平台已标记为 manual-only');
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ api_key: 'ak_test_123', profile_id: 'prof_mac' })));
    const capture = captureOutput();
    const { spy } = capture;
    const code = await agentMain(['bind', '--code', '123456']);
    spy.mockRestore();

    expect(code).toBe(0);
    expect(capture.output).toContain('绑定成功');
    expect(capture.output).toContain('Worker 互助循环: 已启动');
    expect(spawn.calls).toHaveLength(1);
    expect(spawn.calls[0]?.args.join(' ')).toContain('worker daemon');
    expect(_testHelpers.loadConfig().profileId).toBe('prof_mac');
  });

  it('device-flow bind polls profile_id and saves it to config', async () => {
    seedConfig({ authToken: undefined, profileId: null });
    const spawn = createSpawnStub();
    (globalThis as { __MAC_AICHECK_TEST_SPAWN__?: unknown }).__MAC_AICHECK_TEST_SPAWN__ = spawn.spawnImpl;

    const requests: Array<{ url: string; method: string }> = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      requests.push({ url, method: String(init?.method || 'GET') });
      if (url.includes('/bind/request')) {
        return mockResponse({
          request_token: 'req_tok_123',
          confirm_url: 'https://aicoevo.net/bind?t=req_tok_123',
          expires_in: 9,
        });
      }
      if (url.includes('/bind/poll')) {
        return mockResponse({
          status: 'confirmed',
          api_key: 'ak_device_flow_123',
          profile_id: 'prof_device_flow_mac',
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const capture = captureOutput();
    const code = await agentMain(['bind', '--agent', 'claude-code']);
    capture.spy.mockRestore();

    expect(code).toBe(0);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.url).toContain('/bind/request?');
    expect(requests[0]?.url).toContain('agent_type=claude-code');
    expect(requests[0]?.url).toContain('device_id=device-test');
    expect(requests.some(req => req.url.includes('/bind/poll?request_token=req_tok_123'))).toBe(true);
    expect(capture.output).toContain('绑定成功');
    expect(capture.output).toContain('Worker 互助循环: 已启动');
    expect(spawn.calls).toHaveLength(1);
    expect(_testHelpers.loadConfig().authToken).toBe('ak_device_flow_123');
    expect(_testHelpers.loadConfig().profileId).toBe('prof_device_flow_mac');
  });
});
