import { describe, expect, it } from 'vitest';
import type { CodexToolTitlePresenterContext } from '@codex-app-sdk/vue';
import { messages } from '../i18n/messages';
import { presentClawToolTitle } from '../tool-title-presenter';

describe('Claw tool title presenter', () => {
  it.each([
    ['codex_claw.suggest-visualizations', { suggestions: [] }, 'completed', 'Suggested diagrams'],
    ['codex_claw.add-visualization', { title: 'System map' }, 'completed', 'Created diagram'],
    ['codex_claw.read-visualization-canvas', {}, 'completed', 'Read canvas selection'],
    ['codex_claw.edit-visualization-canvas', {}, 'running', 'Editing canvas'],
    ['codex_claw.edit-visualization-canvas', {}, 'error', 'Could not edit canvas'],
    ['codex_claw.view-visualization-canvas', {}, 'completed', 'Viewed canvas'],
    ['codex_claw.get-visualization', { visualizationId: 'diagram-1' }, 'completed', 'Read diagram'],
    ['codex_claw.list-visualizations', {}, 'completed', 'Listed diagrams'],
    ['codex_claw.delete-visualization', { visualizationId: 'diagram-1' }, 'completed', 'Deleted diagram'],
    ['codex_claw.replace-visualization', { visualizationId: 'diagram-1' }, 'completed', 'Updated diagram'],
    ['codex_claw.set-mission-title', { title: 'Add team billing' }, 'running', 'Naming mission'],
    ['codex_claw.set-mission-title', { title: 'Add team billing' }, 'completed', 'Named mission'],
    ['codex_claw.set-mission-title', { title: 'Add team billing' }, 'error', 'Could not name mission'],
    ['codex_claw.attach-mission-repository', { repoPath: '/repo' }, 'completed', 'Attached mission repository'],
    ['codex_claw.list-mission-artifacts', {}, 'completed', 'Checked mission artifacts'],
    ['codex_claw.read-mission-artifact', { stage: 'requirements' }, 'completed', 'Read mission artifact'],
    ['codex_claw.write-mission-artifact', { stage: 'requirements' }, 'completed', 'Saved mission artifact'],
    ['codex_claw.submit-mission-result', {}, 'running', 'Submitting mission artifact'],
    ['codex_claw.submit-mission-result', {}, 'completed', 'Mission artifact ready for review'],
    ['codex_claw.submit-mission-result', {}, 'error', 'Could not submit mission artifact'],
    ['codex_claw.upsert-mission-ticket', { title: 'Add checkout' }, 'running', 'Drafting mission ticket'],
    ['codex_claw.upsert-mission-ticket', { title: 'Add checkout' }, 'completed', 'Drafted mission ticket'],
    ['codex_claw.upsert-mission-ticket', { title: 'Add checkout' }, 'error', 'Could not draft mission ticket'],
    ['codex_claw.toggle_thread_flag', { id: 'delegate_to_worktree', value: true }, 'completed', 'Updated thread flag'],
    ['codex_claw.send-message', { to: 'computer-use' }, 'completed', 'Sent message to computer-use'],
    ['codex_claw.list-agents', {}, 'completed', 'Listed agents'],
    ['codex_claw.report_finding', { title: 'Keep tool copy product-facing' }, 'running', 'Reporting finding'],
    ['codex_claw.report-mission-review-finding', { title: 'Persist selection' }, 'completed', 'Reported Mission finding'],
    ['codex_claw.update-mission-review-finding', { findingId: 'finding-1' }, 'completed', 'Updated Mission finding'],
    ['codex_claw.report_finding', { title: 'Keep tool copy product-facing' }, 'completed', 'Reported finding'],
    ['codex_claw.update_finding', { findingId: 'finding-1' }, 'completed', 'Updated finding'],
    ['codex_claw.delete_finding', { findingId: 'finding-1' }, 'running', 'Deleting finding'],
    ['codex_claw.delete_finding', { findingId: 'finding-1' }, 'completed', 'Deleted finding'],
    ['codex_claw.mark_finding_complete', { findingId: 'finding-1' }, 'completed', 'Verified finding fix'],
    ['codex_claw.browser-screenshot', {}, 'running', 'Capturing page screenshot'],
    ['codex_claw.browser-open', { url: 'https://example.com' }, 'completed', 'Opened https://example.com'],
    ['mcp__codex_claw__computer_use_launch_app', { path: '/Applications/Codex Claw.app' }, 'completed', 'Launched Codex Claw'],
    ['mcp__codex_claw__computer_use_list_windows', { app: 'Safari' }, 'completed', 'Listed Safari windows'],
    ['mcp__codex_claw__computer_use_get_app_state', { app: 'Codex Claw' }, 'completed', 'Inspected Codex Claw'],
    ['mcp__codex_claw__computer_use_guide', {}, 'running', 'Loading Computer Use guide'],
    ['mcp__codex_claw__computer_use_guide', {}, 'completed', 'Loaded Computer Use guide'],
    ['mcp__codex_claw__computer_use_dismiss', { pid: 74070, accessibilityScope: 'menu_bar' }, 'completed', 'Dismissed native menu'],
    ['mcp__codex_claw__computer_use_click', { pid: 74070, x: 33, y: 236 }, 'error', 'Failed clicking target app at (33, 236)'],
    ['mcp__codex_claw__computer_use_scroll', { app: 'Safari', direction: 'down' }, 'completed', 'Scrolled down in Safari'],
    ['mcp__codex_claw__computer_use_press_key', { app: 'Safari', key: 'Super_L+l' }, 'completed', 'Pressed Super_L+l in Safari'],
    ['mcp__codex_claw__computer_use_paste', { app: 'Safari', text: 'private text' }, 'completed', 'Pasted content in Safari'],
    ['mcp__codex_claw__computer_use_select_text', { app: 'Safari', element_index: 7, text: 'private text' }, 'completed', 'Selected text in control #7 in Safari'],
    ['mcp__codex_claw__computer_use_drag', { app: 'Safari', from_x: 1, from_y: 2, to_x: 3, to_y: 4 }, 'completed', 'Dragged in Safari'],
    ['mcp__codex_claw__computer_use_perform_secondary_action', { app: 'Safari', element_index: 7, action: 'AXShowMenu' }, 'completed', 'Performed secondary action on control #7 in Safari'],
    ['mcp__codex_claw__computer_use_screenshot', { displayId: 42, scope: 'screen' }, 'completed', 'Captured display 42 screenshot'],
    ['mcp__codex_claw__computer_use_request_screen_recording', {}, 'completed', 'Requested macOS Screen Recording access for Computer Use'],
    ['codex_claw.create-worktree', { branchName: 'feature/tool-labels' }, 'error', 'Failed creating worktree feature/tool-labels'],
    ['codex_claw.create-project', { name: 'new-product' }, 'running', 'Creating project new-product'],
    ['codex_claw.create-project', { name: 'new-product' }, 'completed', 'Created project new-product'],
    ['codex_claw.create-project', { name: 'new-product' }, 'error', 'Failed creating project new-product'],
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

  it('uses the created agent name after delegation completes', () => {
    const creation = context('codex_claw.create-agent', {
      repoPath: '/src/codex-app-sdk',
      branchName: 'feature/contracts',
    }, 'completed');
    creation.toolCall = {
      ...creation.toolCall,
      result: { agentName: 'feature/contracts' },
    };

    expect(presentClawToolTitle(creation)).toBe('Created agent feature/contracts');
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
