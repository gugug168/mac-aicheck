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

  it('parses phase 6 owner task fields and blocks owner_repair before rollback parity', () => {
    const details = _testHelpers.ownerTaskPhaseDetails({
      lifecycle_state: 'awaiting_owner',
      risk_level: 'L2',
      execution_task: { kind: 'owner_repair' },
      repair_capability: { available: false, mode: 'blocked' },
      consent_state: { status: 'granted' },
      rollback_state: { status: 'missing' },
      prepare_state: { status: 'prepared', prepared: true, prepared_action: 'run_validation_now' },
    });

    expect(details.lifecycle_state).toBe('awaiting_owner');
    expect(details.risk_level).toBe('L2');
    expect(details.execution_task_kind).toBe('owner_repair');
    expect(details.repair_capability_mode).toBe('blocked');
    expect(details.consent_status).toBe('granted');
    expect(details.rollback_status).toBe('missing');
    expect(details.prepare_status).toBe('prepared');
    expect(details.requires_rollback_parity_block).toBe(true);
    expect(details.block_reason).toBe('blocked_pending_rollback_parity');
  });

  it('keeps VERSION aligned with package.json', async () => {
    const repoRoot = path.resolve(__dirname, '..');
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { version: string };
    const releaseVersion = readFileSync(path.join(repoRoot, 'VERSION'), 'utf8').trim();

    expect(releaseVersion).toBe(pkg.version);
  });
});
