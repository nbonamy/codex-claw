import { describe, expect, it } from 'vitest';
import type { CodexToolPresentationContext } from 'codex-app-sdk/vue';
import {
  IconBrowser as BrowserIcon,
  IconDeviceDesktop as DeviceDesktopIcon,
  IconGitBranch as GitBranchIcon,
  IconMarkdown as MarkdownIcon,
  IconMessage as MessageIcon,
  IconSquareCheck as SquareCheck,
  IconUsers as UsersIcon,
} from '@tabler/icons-vue';
import { messages } from '../i18n/messages';
import { presentClawTool } from '../tool-presentation';

describe('Claw tool presentation', () => {
  it.each([
    ['browser-screenshot', BrowserIcon, 'Captured page screenshot'],
    ['computer-use-get-app-state', DeviceDesktopIcon, 'Inspected'],
    ['send-message', MessageIcon, 'Sent message to codex-app-sdk'],
    ['list-agents', UsersIcon, 'Listed agents'],
    ['create-worktree', GitBranchIcon, 'Created worktree feature/tool-icons'],
    ['display-markdown', MarkdownIcon, 'Displayed Review notes'],
    ['mark-work-item-completed', SquareCheck, 'Marked work item complete'],
  ])('presents %s with a semantic Claw icon and title', (tool, icon, title) => {
    const args = tool === 'send-message'
      ? { to: 'codex-app-sdk' }
      : tool === 'create-worktree'
        ? { branchName: 'feature/tool-icons' }
        : tool === 'display-markdown'
          ? { title: 'Review notes' }
          : {};

    expect(presentClawTool(context(tool, args), translate)).toStrictEqual({ icon, title });
  });

  it('normalizes underscored tool metadata from provider adapters', () => {
    expect(presentClawTool(context('computer_use_list_apps', {}), translate)).toStrictEqual({
      icon: DeviceDesktopIcon,
      title: 'Listed open apps',
    });
  });

  it('resolves recipient ids before send-message completes', () => {
    const running = context('send-message', { to: 'agent-sdk' });
    running.toolCall = { ...running.toolCall, done: false, state: 'running' };

    expect(presentClawTool(
      running,
      translate,
      (identifier) => identifier === 'agent-sdk' ? 'codex-app-sdk' : undefined,
    )).toStrictEqual({
      icon: MessageIcon,
      title: 'Sending message to codex-app-sdk',
    });
  });

  it('leaves unknown, non-MCP, and third-party tools to the SDK fallback', () => {
    expect(presentClawTool(context('future-tool', {}), translate)).toBeUndefined();
    expect(presentClawTool(context('browser-open', {}, 'github'), translate)).toBeUndefined();
    expect(presentClawTool({ ...context('browser-open', {}), kind: 'generic' }, translate)).toBeUndefined();
  });
});

function context(
  tool: string,
  args: unknown,
  server = 'codex_claw',
): CodexToolPresentationContext {
  return {
    kind: 'mcp',
    metadata: { server, tool },
    toolCall: {
      args,
      done: true,
      function: `mcp__${server}__${tool.replaceAll('-', '_')}`,
      id: 'tool-1',
      kind: 'mcp',
      metadata: { server, tool },
      result: undefined,
      state: 'completed',
    },
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
