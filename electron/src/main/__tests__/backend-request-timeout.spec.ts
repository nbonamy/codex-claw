import { describe, expect, it } from 'vitest';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { backendRequestTimeoutMs } from '../backend-request-timeout';

describe('backendRequestTimeoutMs', () => {
  it('allows complete history hydration to outlive ordinary request timeouts', () => {
    expect(backendRequestTimeoutMs(backendMethods.agentHistoryHydrate, 5_000)).toBe(120_000);
    expect(backendRequestTimeoutMs(backendMethods.agentHistoryLoadOlder, 5_000)).toBe(120_000);
    expect(backendRequestTimeoutMs(backendMethods.agentSelect, 5_000)).toBe(120_000);
    expect(backendRequestTimeoutMs(backendMethods.agentFork, 5_000)).toBe(120_000);
    expect(backendRequestTimeoutMs(backendMethods.snapshotGet, 5_000)).toBe(5_000);
  });
});
