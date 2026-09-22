import { describe, expect, it } from 'vitest';
import type { CodexToolPresentationContext } from '@codex-app-sdk/vue';
import {
  IconBrowser as BrowserIcon,
  IconDeviceDesktop as DeviceDesktopIcon,
  IconGitBranch as GitBranchIcon,
  IconMarkdown as MarkdownIcon,
  IconMessage as MessageIcon,
  IconMessageReport as MessageReportIcon,
  IconSparkles as SparklesIcon,
  IconSquareCheck as SquareCheck,
  IconTargetArrow as TargetArrowIcon,
  IconUsers as UsersIcon,
  IconVolume as VolumeIcon,
} from '@tabler/icons-vue';
import { messages } from '../i18n/messages';
import { presentClawTool } from '../tool-presentation';

describe('Claw tool presentation', () => {
  it.each([
    ['browser-screenshot', BrowserIcon, 'Captured page screenshot'],
    ['computer-use-get-app-state', DeviceDesktopIcon, 'Inspected Codex Claw'],
    ['computer-use-guide', DeviceDesktopIcon, 'Loaded Computer Use guide'],
    ['computer-use-list-windows', DeviceDesktopIcon, 'Listed Safari windows'],
    ['computer-use-dismiss', DeviceDesktopIcon, 'Dismissed native menu'],
    ['computer-use-press-key', DeviceDesktopIcon, 'Pressed Return in Safari'],
    ['computer-use-paste', DeviceDesktopIcon, 'Pasted content in Safari'],
    ['computer-use-select-text', DeviceDesktopIcon, 'Selected text in control #7 in Safari'],
    ['computer-use-drag', DeviceDesktopIcon, 'Dragged in Safari'],
    ['computer-use-perform-secondary-action', DeviceDesktopIcon, 'Performed secondary action on control #7 in Safari'],
    ['computer-use-screenshot', DeviceDesktopIcon, 'Captured main display screenshot'],
    ['computer-use-request-screen-recording', DeviceDesktopIcon, 'Requested macOS Screen Recording access for Computer Use'],
    ['send-message', MessageIcon, 'Sent message to codex-app-sdk'],
    ['report-finding', MessageReportIcon, 'Reported finding'],
    ['list-agents', UsersIcon, 'Listed agents'],
    ['finish_turn', UsersIcon, 'Finished turn'],
    ['toggle_thread_flag', UsersIcon, 'Updated thread flag'],
    ['create-worktree', GitBranchIcon, 'Created worktree feature/tool-icons'],
    ['display-markdown', MarkdownIcon, 'Displayed Review notes'],
    ['set-mission-title', TargetArrowIcon, 'Named mission'],
    ['attach-mission-repository', GitBranchIcon, 'Attached mission repository'],
    ['list-mission-artifacts', MarkdownIcon, 'Checked mission artifacts'],
    ['read-mission-artifact', MarkdownIcon, 'Read mission artifact'],
    ['write-mission-artifact', SquareCheck, 'Saved mission artifact'],
    ['submit-mission-result', SquareCheck, 'Mission artifact ready for review'],
    ['upsert-mission-ticket', SquareCheck, 'Drafted mission ticket'],
    ['update-work-item', SquareCheck, 'Updated work item'],
    ['celebrate', SparklesIcon, 'Celebrated with stars'],
    ['announce', VolumeIcon, 'Acknowledged start'],
  ])('presents %s with a semantic Claw icon and title', (tool, icon, title) => {
    const args = tool === 'send-message'
      ? { to: 'codex-app-sdk' }
      : tool === 'create-worktree'
        ? { branchName: 'feature/tool-icons' }
        : tool === 'display-markdown'
          ? { title: 'Review notes' }
          : tool === 'computer-use-get-app-state'
            ? { app: 'Codex Claw' }
            : tool === 'computer-use-list-windows'
              ? { app: 'Safari' }
              : tool === 'computer-use-press-key'
                ? { app: 'Safari', key: 'Return' }
              : tool === 'computer-use-paste' || tool === 'computer-use-drag'
                ? { app: 'Safari' }
                : tool === 'computer-use-select-text' || tool === 'computer-use-perform-secondary-action'
                  ? { app: 'Safari', element_index: 7 }
                  : tool === 'computer-use-screenshot'
                    ? { scope: 'screen' }
                    : tool === 'celebrate'
                      ? { kind: 'stars' }
                      : tool === 'announce'
                        ? { phase: 'start', text: 'private phrase' }
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
