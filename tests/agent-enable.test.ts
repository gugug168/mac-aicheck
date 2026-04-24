import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

function createTempHome() {
  return mkdtempSync(path.join(tmpdir(), 'mac-aicheck-enable-'));
}

describe('agent enable targets', () => {
  const homes: string[] = [];
  const originalHome = process.env.HOME;
  const originalArgv1 = process.argv[1];

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
    process.env.HOME = originalHome;
    process.argv[1] = originalArgv1;
    for (const home of homes.splice(0)) {
      rmSync(home, { recursive: true, force: true });
    }
  });

  async function loadAgentMain(execImpl?: (cmd: string, args?: string[]) => string) {
    vi.doMock('child_process', () => ({
      execFileSync: vi.fn((cmd: string, args?: string[]) => {
        if (execImpl) return execImpl(cmd, args);
        if (cmd === 'command' && args?.[0] === '-v' && args[1] === 'claude') return '/usr/local/bin/claude\n';
        if (cmd === 'command' && args?.[0] === '-v' && args[1] === 'openclaw') return '/usr/local/bin/openclaw\n';
        return '';
      }),
      spawn: vi.fn(),
    }));
    const mod = await import('../src/agent/index');
    return mod.main;
  }

  it('enable --target all installs Claude settings hook and OpenClaw shell hook', async () => {
    const home = createTempHome();
    homes.push(home);
    process.env.HOME = home;
    process.argv[1] = path.join(process.cwd(), 'src', 'agent', 'index.ts');

    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ confirm_url: 'https://aicoevo.net/bind/test' }),
      text: async () => JSON.stringify({ confirm_url: 'https://aicoevo.net/bind/test' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const main = await loadAgentMain();
    const code = await main(['enable', '--target', 'all']);
    stdout.mockRestore();

    expect(code).toBe(0);
    expect(readFileSync(path.join(home, '.claude', 'settings.json'), 'utf-8')).toContain('mac-aicheck-post-tool.js');
    const zshrc = readFileSync(path.join(home, '.zshrc'), 'utf-8');
    expect(zshrc).toContain('function openclaw');
    expect(zshrc).not.toContain('function claude');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('agent_type=claude-code');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('agent_type=openclaw');
  });

  it('enable --target openclaw only installs OpenClaw shell hook', async () => {
    const home = createTempHome();
    homes.push(home);
    process.env.HOME = home;
    process.argv[1] = path.join(process.cwd(), 'src', 'agent', 'index.ts');

    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ confirm_url: 'https://aicoevo.net/bind/openclaw' }),
      text: async () => JSON.stringify({ confirm_url: 'https://aicoevo.net/bind/openclaw' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const main = await loadAgentMain((cmd, args) => {
      if (cmd === 'command' && args?.[0] === '-v' && args[1] === 'openclaw') return '/usr/local/bin/openclaw\n';
      if (cmd === 'command' && args?.[0] === '-v' && args[1] === 'claude') throw new Error('not found');
      return '';
    });

    const code = await main(['enable', '--target', 'openclaw']);
    expect(code).toBe(0);
    expect(existsSync(path.join(home, '.claude', 'settings.json'))).toBe(false);
    const zshrc = readFileSync(path.join(home, '.zshrc'), 'utf-8');
    expect(zshrc).toContain('function openclaw');
    expect(zshrc).not.toContain('function claude');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('agent_type=openclaw');
  });
});
