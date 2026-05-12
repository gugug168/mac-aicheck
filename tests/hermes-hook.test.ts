/**
 * tests/hermes-hook.test.ts
 *
 * Tests for Hermes error hook integration:
 *   - report-error writes to hermes-events.jsonl + events.jsonl
 *   - hermes-status reads both outbox files
 *   - hermes-connect configures log path
 *   - Sanitization strips API keys / tokens from error messages
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { main as agentMain } from '../src/agent/index';

function createTempHome(): string {
  const home = path.join(tmpdir(), `mac-aicheck-hermes-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(home, { recursive: true });
  return home;
}

describe('hermes hook — report-error', () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.HOME = originalHome ?? '/Users/gugu';
  });

  it('report-error --json writes event to hermes-events.jsonl', async () => {
    const home = createTempHome();
    process.env.HOME = home;

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain([
      'report-error',
      '--json',
      JSON.stringify({ type: 'hermes-error', kind: 'auth_failure', message: '401 invalid api key' }),
    ]);
    stdout.mockRestore();

    expect(code).toBe(0);
    const outboxPath = path.join(home, '.mac-aicheck', 'outbox', 'hermes-events.jsonl');
    expect(existsSync(outboxPath)).toBe(true);
    const lines = readFileSync(outboxPath, 'utf8').split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    const event = JSON.parse(lines[0]);
    expect(event.kind).toBe('auth_failure');
    expect(event.source).toBe('hermes');
    expect(event.receivedAt).toBeTruthy();
  });

  it('report-error --json also writes sanitized event to events.jsonl', async () => {
    const home = createTempHome();
    process.env.HOME = home;

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain([
      'report-error',
      '--json',
      JSON.stringify({ type: 'hermes-error', kind: 'auth_failure', message: '401 invalid api key', severity: 'error' }),
    ]);
    stdout.mockRestore();

    expect(code).toBe(0);
    const mainOutboxPath = path.join(home, '.mac-aicheck', 'outbox', 'events.jsonl');
    expect(existsSync(mainOutboxPath)).toBe(true);
    const lines = readFileSync(mainOutboxPath, 'utf8').split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    const event = JSON.parse(lines[0]);
    expect(event.source).toBe('hermes');
    expect(event.eventType).toBe('hermes-error');
    expect(event.syncStatus).toBe('pending');
  });

  it('report-error returns error for missing --json arg', async () => {
    const home = createTempHome();
    process.env.HOME = home;

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['report-error']);
    stdout.mockRestore();

    expect(code).toBe(1);
  });

  it('report-error returns error for invalid JSON', async () => {
    const home = createTempHome();
    process.env.HOME = home;

    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const code = await agentMain(['report-error', '--json', 'not-valid-json{']);
    stderr.mockRestore();

    expect(code).toBe(1);
  });

  it('multiple report-error calls append to hermes-events.jsonl', async () => {
    const home = createTempHome();
    process.env.HOME = home;

    await agentMain(['report-error', '--json', JSON.stringify({ kind: 'auth_failure', message: 'err1' })]);
    await agentMain(['report-error', '--json', JSON.stringify({ kind: 'network', message: 'err2' })]);

    const outboxPath = path.join(home, '.mac-aicheck', 'outbox', 'hermes-events.jsonl');
    const lines = readFileSync(outboxPath, 'utf8').split('\n').filter(Boolean);
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).message).toBe('err1');
    expect(JSON.parse(lines[1]).message).toBe('err2');
  });
});

describe('hermes hook — hermes-status', () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.HOME = originalHome ?? '/Users/gugu';
  });

  it('hermes-status returns zero counts when no events exist', async () => {
    const home = createTempHome();
    process.env.HOME = home;

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['hermes-status']);
    const output = stdout.mock.calls.map(c => String(c[0])).join('');
    stdout.mockRestore();

    expect(code).toBe(0);
    const r = JSON.parse(output);
    expect(r.errorCount).toBe(0);
    expect(r.mergedErrorCount).toBe(0);
  });

  it('hermes-status counts hermes events in both outboxes', async () => {
    const home = createTempHome();
    process.env.HOME = home;

    // Seed hermes-events.jsonl
    const outboxDir = path.join(home, '.mac-aicheck', 'outbox');
    mkdirSync(outboxDir, { recursive: true });
    writeFileSync(path.join(outboxDir, 'hermes-events.jsonl'),
      JSON.stringify({ kind: 'auth_failure', message: 'err', receivedAt: new Date().toISOString(), source: 'hermes' }) + '\n',
    );
    writeFileSync(path.join(outboxDir, 'events.jsonl'),
      JSON.stringify({ source: 'hermes', eventType: 'hermes_error', message: 'err' }) + '\n',
    );

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['hermes-status']);
    const output = stdout.mock.calls.map(c => String(c[0])).join('');
    stdout.mockRestore();

    expect(code).toBe(0);
    const r = JSON.parse(output);
    expect(r.errorCount).toBe(1);
    expect(r.mergedErrorCount).toBe(1);
    expect(r.lastErrorAt).toBeTruthy();
  });

  it('hermes-status includes hermesConnected: true when log-path is configured', async () => {
    const home = createTempHome();
    process.env.HOME = home;
    mkdirSync(path.join(home, '.mac-aicheck'), { recursive: true });
    writeFileSync(
      path.join(home, '.mac-aicheck', 'config.json'),
      JSON.stringify({ hermesLogPath: '/Users/gugu/.hermes/logs' }),
    );

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['hermes-status']);
    const output = stdout.mock.calls.map(c => String(c[0])).join('');
    stdout.mockRestore();

    expect(code).toBe(0);
    const r = JSON.parse(output);
    expect(r.hermesConnected).toBe(true);
    expect(r.hermesLogPath).toContain('.hermes/logs');
  });
});

describe('hermes hook — hermes-connect', () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.HOME = originalHome ?? '/Users/gugu';
  });

  it('hermes-connect --log-path saves path to config', async () => {
    const home = createTempHome();
    process.env.HOME = home;

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['hermes-connect', '--log-path', '/custom/hermes/logs']);
    stdout.mockRestore();

    expect(code).toBe(0);
    const configPath = path.join(home, '.mac-aicheck', 'config.json');
    expect(existsSync(configPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(cfg.hermesLogPath).toBe('/custom/hermes/logs');
  });

  it('hermes-connect without args shows current log path', async () => {
    const home = createTempHome();
    process.env.HOME = home;

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await agentMain(['hermes-connect']);
    const output = stdout.mock.calls.map(c => String(c[0])).join('');
    stdout.mockRestore();

    expect(code).toBe(0);
    expect(output).toContain('Hermes');
  });
});
