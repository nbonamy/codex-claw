import { describe, expect, it } from 'vitest';
import type { Agent, SendPromptOptions } from '../contracts';
import { createEmptySnapshot } from '../snapshot';
import {
  backendDisplayName,
  backendRuntimeFromSnapshot,
  codexPromptOptions,
  unsupportedBackendFeature,
} from '../backend-driver';

describe('backend driver helpers', () => {
  it('uses product-facing backend names in unsupported feature errors', () => {
    expect(backendDisplayName('codex')).toBe('Codex');
    expect(backendDisplayName('claude')).toBe('Claude');
    expect(unsupportedBackendFeature(agent('claude'), 'rollback').message)
      .toBe('Claude does not support rollback.');
  });

  it('finds a runtime in a snapshot and supplies a safe fallback', () => {
    const snapshot = createEmptySnapshot();
    snapshot.backendRuntimes = [{ backend: 'codex', status: 'running' }];

    expect(backendRuntimeFromSnapshot(snapshot, 'codex')).toStrictEqual({
      backend: 'codex',
      status: 'running',
    });
    expect(backendRuntimeFromSnapshot(snapshot, 'claude')).toStrictEqual({
      backend: 'claude',
      status: 'notConfigured',
    });
  });

  it('extracts only Codex prompt options', () => {
    const codexOptions = {
      backendOptions: {
        kind: 'codex',
        model: 'gpt-5',
      },
    } as SendPromptOptions;
    const claudeOptions = {
      backendOptions: {
        kind: 'claude',
      },
    } as SendPromptOptions;

    expect(codexPromptOptions(codexOptions)).toBe(codexOptions.backendOptions);
    expect(codexPromptOptions(claudeOptions)).toBeUndefined();
    expect(codexPromptOptions(undefined)).toBeUndefined();
  });
});

function agent(backend: Agent['backend']): Agent {
  return {
    id: 'agent-dina',
    teamId: 'team-claw',
    name: 'Dina',
    avatar: 'DI',
    folder: '/tmp/claw',
    backend,
    backendDefaults: backend === 'codex' ? { kind: 'codex' } : { kind: 'claude' },
    status: { type: 'idle' },
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
  };
}
