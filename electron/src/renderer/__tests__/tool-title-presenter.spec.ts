import { describe, expect, it } from 'vitest';
import type { CodexToolTitlePresenterContext } from 'codex-app-sdk/vue';
import { messages } from '../i18n/messages';
import { presentClawToolTitle } from '../tool-title-presenter';

describe('Claw tool title presenter', () => {
  it.each([
    ['codex_claw.set-status', { status: 'Reviewing changes' }, 'completed', 'Updated status'],
    ['codex_claw.set-status', { status: '' }, 'completed', 'Cleared status'],
    ['codex_claw.send-message', { to: 'computer-use' }, 'completed', 'Sent message to computer-use'],
    ['codex_claw.list-agents', {}, 'completed', 'Listed agents'],
    ['codex_claw.browser-screenshot', {}, 'running', 'Capturing page screenshot'],
    ['codex_claw.browser-open', { url: 'https://example.com' }, 'completed', 'Opened https://example.com'],
    ['mcp__codex_claw__computer_use_launch_app', { name: 'Codex Claw' }, 'completed', 'Launched Codex Claw'],
    ['codex_claw.create-worktree', { branchName: 'feature/tool-labels' }, 'error', 'Failed creating worktree feature/tool-labels'],
  ])('presents %s as user-facing activity text', (functionName, args, state, expected) => {
    expect(presentClawToolTitle(context(
      functionName,
      args,
      state as 'running' | 'completed' | 'error',
    ))).toBe(expected);
  });

  it('uses the resolved recipient name after sending by agent id', () => {
    expect(presentClawToolTitle({
      ...context('codex_claw.send-message', { to: 'agent-uuid' }, 'completed'),
      toolCall: {
        ...context('codex_claw.send-message', { to: 'agent-uuid' }, 'completed').toolCall,
        result: { recipientId: 'agent-uuid', recipientName: 'Computer Use' },
      },
    })).toBe('Sent message to Computer Use');
  });

  it('uses the loaded agent name while sending by agent id', () => {
    expect(presentClawToolTitle(
      context('codex_claw.send-message', { to: 'agent-uuid' }, 'running'),
      (identifier) => identifier === 'agent-uuid' ? 'Computer Use' : undefined,
    )).toBe('Sending message to Computer Use');
  });

  it('uses approval descriptors and leaves other MCP servers to their own presenters', () => {
    expect(presentClawToolTitle(context(
      'codex_claw.register-agent',
      {},
      'running',
      { params: { tool: 'codex_claw.register-agent' }, phase: 'running' },
    ))).toBe('Registering agent');
    expect(presentClawToolTitle(context('github.create_issue', {}, 'completed'))).toBeUndefined();
  });
});

function context(
  functionName: string,
  args: unknown,
  state: 'running' | 'completed' | 'error',
  descriptor?: { params?: Record<string, unknown>; phase: string },
): CodexToolTitlePresenterContext {
  return {
    descriptor: descriptor ? { action: 'run', source: 'mcp', ...descriptor } : undefined,
    toolCall: {
      args,
      done: state !== 'running',
      function: functionName,
      id: 'tool-1',
      result: undefined,
      state,
    },
    translate: translate as CodexToolTitlePresenterContext['translate'],
  };
}

function translate(key: string, params?: Record<string, unknown>): string {
  const value = key.split('.').reduce<unknown>((current, segment) => (
    typeof current === 'object' && current !== null
      ? (current as Record<string, unknown>)[segment]
      : undefined
  ), messages.en);
  if (typeof value !== 'string') return key;
  return value.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? '')).trim();
}
