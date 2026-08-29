import { describe, expect, it } from 'vitest';
import type { CodexToolTitlePresenterContext } from '@codex-app-sdk/vue';
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
    ['mcp__codex_claw__computer_use_launch_app', { path: '/Applications/Codex Claw.app' }, 'completed', 'Launched Codex Claw'],
    ['mcp__codex_claw__computer_use_get_app_state', { app: 'Codex Claw' }, 'completed', 'Inspected Codex Claw'],
    ['mcp__codex_claw__computer_use_click', { pid: 74070, x: 33, y: 236 }, 'error', 'Failed clicking target app at (33, 236)'],
    ['mcp__codex_claw__computer_use_scroll', { app: 'Safari', deltaY: 400 }, 'completed', 'Scrolled down in Safari'],
    ['mcp__codex_claw__computer_use_screenshot', { displayId: 42, scope: 'screen' }, 'completed', 'Captured display 42 screenshot'],
    ['mcp__codex_claw__computer_use_request_screen_recording', {}, 'completed', 'Requested macOS Screen Recording access for Computer Use'],
    ['codex_claw.create-worktree', { branchName: 'feature/tool-labels' }, 'error', 'Failed creating worktree feature/tool-labels'],
    ['codex_claw.celebrate', { kind: 'schoolPride' }, 'running', 'Celebrating with school pride'],
    ['codex_claw.celebrate', { kind: 'schoolPride' }, 'completed', 'Celebrated with school pride'],
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

  it('uses completed Computer Use result context without exposing entered text or values', () => {
    const typeText = context('mcp__codex_claw__computer_use_type_text', {
      pid: 74070,
      text: 'private draft text',
    }, 'completed');
    typeText.toolCall = {
      ...typeText.toolCall,
      result: { structuredContent: { app: { localizedName: 'Codex Claw' } } },
    };

    expect(presentClawToolTitle(typeText)).toBe('Entered text in Codex Claw');
    expect(presentClawToolTitle(typeText)).not.toContain('private draft text');

    expect(presentClawToolTitle(context(
      'mcp__codex_claw__computer_use_set_value',
      { app: 'TextEdit', element_index: 7, value: 'secret' },
      'completed',
    ))).toBe('Updated control #7 in TextEdit');
  });

  it('uses the resolved app name and never exposes a process id', () => {
    const inspection = context('mcp__codex_claw__computer_use_get_app_state', { pid: 74070 }, 'completed');
    inspection.toolCall = {
      ...inspection.toolCall,
      result: {
        structuredContent: {
          app: { localizedName: 'Electron', pid: 74070 },
          window: { title: 'Codex Claw' },
        },
      },
    };

    expect(presentClawToolTitle(inspection)).toBe('Inspected Electron');
    expect(presentClawToolTitle(inspection)).not.toContain('74070');
  });

  it('uses the completed celebration result when the renderer did not retain its arguments', () => {
    const celebration = context('codex_claw.celebrate', undefined, 'completed');
    celebration.toolCall = {
      ...celebration.toolCall,
      result: {
        structuredContent: {
          displayed: true,
          kind: 'schoolPride',
          message: 'Celebration started.',
          success: true,
        },
      },
    };

    expect(presentClawToolTitle(celebration)).toBe('Celebrated with school pride');
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
