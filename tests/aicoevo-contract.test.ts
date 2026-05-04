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

  it('treats legacy and Phase 6 fields as one compatible payload surface', () => {
    const payload = {
      mode: 'community_verified',
      current_lifecycle_focus: {
        problem_brief_id: 'pb_001',
        bounty_id: 'b_001',
        answer_id: 'a_001',
        lifecycle_state: 'awaiting_user_consent',
        risk_level: 'L2',
        next_action: 'await_owner_verification',
        next_action_label: '等待发起者复现',
        requires_user_attention: true,
      },
      pending_owner_verifications: [{
        bounty_id: 'b_001',
        answer_id: 'a_001',
        execution_task: {
          kind: 'owner_repair',
          risk_level: 'L2',
          lifecycle_state: 'awaiting_user_consent',
          repair_capability: {
            mode: 'reversible_repair',
            backup_available: true,
            rollback_available: true,
          },
          rollback_state: {
            status: 'available',
            available: true,
            mode: 'automatic',
          },
        },
        prepare_state: {
          prepared: false,
          prepared_action: 'manual_confirm_only',
          consent_state: 'required',
        },
      }],
    };

    expect(payload.mode).toBe('community_verified');
    expect(payload.current_lifecycle_focus.lifecycle_state).toBe('awaiting_user_consent');
    expect(payload.pending_owner_verifications[0]?.execution_task.kind).toBe('owner_repair');
    expect(payload.pending_owner_verifications[0]?.prepare_state.consent_state).toBe('required');
  });

  it('keeps VERSION aligned with package.json', async () => {
    const repoRoot = path.resolve(__dirname, '..');
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { version: string };
    const releaseVersion = readFileSync(path.join(repoRoot, 'VERSION'), 'utf8').trim();

    expect(releaseVersion).toBe(pkg.version);
  });
});
