import { expect, it } from 'vitest';
import {
  agentRecovery,
  parseRecoveryArguments,
  stateWithRecoveredThread,
} from './recover-compressed-session.mjs';

it('parses a dry-run recovery command', () => {
  const parsed = parseRecoveryArguments(['/tmp/backup.tar', '/tmp/repo', '--dry-run']);
  expect(parsed).toEqual({
    backupPath: '/tmp/backup.tar',
    agentFolder: '/tmp/repo',
    dryRun: true,
  });
});

it('recovers only the matching Codex agent thread', () => {
  const currentState = state('thread-broken');
  currentState.agents.push({ id: 'untouched', backend: 'claude', folder: '/tmp/other' });
  const backupState = state('thread-recovered');

  const recovery = agentRecovery(currentState, backupState, '/tmp/repo');
  expect(recovery.currentThreadId).toBe('thread-broken');
  expect(recovery.recoveredThreadId).toBe('thread-recovered');

  const nextState = stateWithRecoveredThread(
    currentState,
    recovery.currentAgent.id,
    recovery.recoveredThreadId,
    '2026-09-07T12:00:00.000Z',
  );
  expect(nextState.agents[0]).toEqual({
    ...currentState.agents[0],
    backendSession: { kind: 'codex', threadId: 'thread-recovered' },
    updatedAt: '2026-09-07T12:00:00.000Z',
  });
  expect(nextState.agents[1]).toBe(currentState.agents[1]);
});

it('rejects an ambiguous folder instead of changing multiple agents', () => {
  const currentState = state('thread-current');
  currentState.agents.push({ ...currentState.agents[0], id: 'agent-2' });
  expect(() => agentRecovery(currentState, state('thread-backup'), '/tmp/repo'))
    .toThrow(/Expected exactly one Codex agent.*found 2/);
});

function state(threadId) {
  return {
    agents: [{
      id: 'agent-1',
      backend: 'codex',
      folder: '/tmp/repo',
      backendSession: { kind: 'codex', threadId },
      updatedAt: 'before',
    }],
    theme: 'system',
  };
}
