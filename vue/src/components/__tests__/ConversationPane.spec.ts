import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import {
  createCodexConversationPaneController,
  type CodexConversationPaneController,
  type CodexMessageTextSelection,
  type CodexNativeAttachment,
} from '@codex-app-sdk/vue';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import type { Agent, RendererMessage, ThreadPlan } from '@codex-claw/core/contracts';
import ConversationPane from '../ConversationPane.vue';
import type { ChatTextAnnotation } from '../use-chat-text-annotations';
import { i18n } from '../../i18n';

const agent: Agent = {
  id: 'agent-dina',
  name: 'Dina',
  avatar: 'DI',
  folder: '~/src/id8',
  backend: 'codex',
  backendDefaults: { kind: 'codex' },
  status: { type: 'idle' },
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
};

const messages: RendererMessage[] = [
  {
    id: 'message-user',
    agentId: agent.id,
    role: 'user',
    status: 'complete',
    turnId: 'turn-1',
    createdAt: '2026-06-05T00:00:00.000Z',
    parts: [{ type: 'text', text: 'Find the failing test.' }],
  },
  {
    id: 'message-assistant',
    agentId: agent.id,
    role: 'assistant',
    status: 'complete',
    turnId: 'turn-1',
    createdAt: '2026-06-05T00:00:01.000Z',
    parts: [{ type: 'text', text: 'Looking now.' }],
  },
];

const executionPlan: ThreadPlan = {
  threadId: 'thread-plan',
  turnId: 'turn-plan',
  kind: 'execution',
  status: 'inProgress',
  explanation: 'Current execution plan',
  steps: [{ step: 'Implement the fix', status: 'inProgress' }],
  markdown: 'Current execution plan\n- [ ] Implement the fix',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

describe('ConversationPane', () => {
  it('stays a thin presentation wrapper around an AppShell-owned controller', () => {
    const controller = controllerFor(messages);
    const wrapper = mountPane({ controller, agent });

    expect(wrapper.getComponent({ name: 'CodexConversationPane' }).props('controller')).toStrictEqual(controller);
  });

  it('floats active plan progress independently of controller state', () => {
    const controller = controllerFor(messages);
    const wrapper = mountPane({ controller, agent, plan: executionPlan });

    expect(wrapper.get('.conversation-plan').text()).toContain('Implement the fix');
    expect(resolveControllerState(controller).thread?.turnGitDiff).toBeUndefined();
  });

  it('forwards execution-plan dismissal and can hide the overlay', async () => {
    const wrapper = mountPane({
      controller: controllerFor(messages),
      agent,
      plan: executionPlan,
      planVisible: true,
    });

    await wrapper.get('[aria-label="Close task list"]').trigger('click');

    expect(wrapper.emitted('close-plan')).toStrictEqual([[]]);
    await wrapper.setProps({ planVisible: false } as Record<string, unknown>);
    expect(wrapper.find('.conversation-plan').exists()).toBe(false);
  });

  it('renders app-owned messages supplied by the controller', () => {
    const wrapper = mountPane({ controller: controllerFor(messages), agent });

    expect(wrapper.text()).toContain('Find the failing test.');
    expect(wrapper.text()).toContain('Looking now.');
  });

  it('turns SDK text selections into removable composer annotations', async () => {
    const wrapper = mountPane({ controller: controllerFor(messages), agent });
    const sdkPane = wrapper.getComponent({ name: 'CodexConversationPane' });
    const selection: CodexMessageTextSelection = {
      text: 'Looking now.',
      messageId: 'message-assistant',
      turnId: 'turn-1',
      messageIndex: 1,
      role: 'assistant',
      anchor: { x: 40, y: 80, width: 100, height: 20 },
    };

    expect(sdkPane.props('messageTextSelection')).toBe(true);
    expect(sdkPane.props('hasComposerContext')).toBe(false);
    sdkPane.vm.$emit('messageTextSelectionChange', selection);
    await nextTick();
    await wrapper.get('.chat-text-selection-annotation__add').trigger('click');
    const input = document.querySelector<HTMLInputElement>('.annotation-popup__input');
    const form = document.querySelector<HTMLFormElement>('form.annotation-popup');
    if (!input || !form) throw new Error('Annotation popup was not rendered.');
    input.value = 'Explain what you found.';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await nextTick();

    expect(wrapper.emitted('add-text-annotation')).toStrictEqual([[
      { selection, comment: 'Explain what you found.' },
    ]]);

    const annotation: ChatTextAnnotation = {
      id: 'annotation-1',
      text: selection.text,
      comment: 'Explain what you found.',
      messageId: selection.messageId,
      turnId: selection.turnId,
      messageIndex: selection.messageIndex,
      role: selection.role,
    };
    await wrapper.setProps({ textAnnotations: [annotation] });
    expect(sdkPane.props('hasComposerContext')).toBe(true);
    expect(wrapper.get('.chat-text-annotation-cards__card').text()).toBe('Annotation');
    expect(wrapper.text()).not.toContain('Explain what you found.');
    await wrapper.get('[aria-label="Remove chat annotation"]').trigger('click');
    expect(wrapper.emitted('remove-text-annotation')).toStrictEqual([['annotation-1']]);
  });

  it('renders delegate_to_worktree in composer context and emits its actions', async () => {
    const wrapper = mountPane({
      controller: controllerFor(messages),
      agent: { ...agent, threadFlags: { delegate_to_worktree: true } },
    });
    const sdkPane = wrapper.getComponent({ name: 'CodexConversationPane' });

    expect(sdkPane.props('hasComposerContext')).toBe(true);
    expect(wrapper.get('.thread-flag-affordance').text()).toContain('Ready to delegate');
    await wrapper.get('.thread-flag-affordance__action').trigger('click');
    await wrapper.get('.thread-flag-affordance__dismiss').trigger('click');
    expect(wrapper.emitted('thread-flag')).toStrictEqual([['execute'], ['dismiss']]);

    await wrapper.setProps({ threadFlagBusy: true });
    expect(wrapper.get('.thread-flag-affordance__action').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.thread-flag-affordance__dismiss').attributes('aria-label'))
      .toBe('Dismiss worktree delegation');
  });

  it('replaces only an empty transcript with the history load recovery state', async () => {
    const wrapper = mountPane({
      controller: controllerFor([]),
      agent,
      historyLoadFailed: true,
      historyLoading: false,
    });

    expect(wrapper.text()).toContain('Conversation couldn’t be loaded.');
    expect(wrapper.text()).not.toContain('Chat with Dina');
    expect(wrapper.find('[aria-label="Prompt composer"]').exists()).toBe(false);
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('retry-history')).toStrictEqual([[]]);

    await wrapper.setProps({ historyLoadFailed: false });
    expect(wrapper.find('[aria-label="Prompt composer"]').exists()).toBe(true);
  });

  it('preserves visible messages when a later history hydration fails', () => {
    const wrapper = mountPane({
      controller: controllerFor(messages),
      agent,
      historyLoadFailed: true,
      hasVisibleMessages: true,
    });

    expect(wrapper.text()).toContain('Find the failing test.');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('renders Codex phased work while leaving unphased backend output flat', () => {
    const wrapper = mountPane({
      controller: controllerFor([
        {
          id: 'message-codex-phased', agentId: agent.id, role: 'assistant', status: 'complete',
          createdAt: '2026-09-04T00:00:00.000Z',
          parts: [
            {
              type: 'reasoning', summary: 'Checked the adapter',
              itemId: 'reasoning-1', summaryIndex: 0,
            },
            {
              type: 'text', text: 'Still working',
              itemId: 'commentary-1', phase: 'commentary',
            },
            {
              type: 'text', text: 'Finished cleanly',
              itemId: 'answer-1', phase: 'final_answer',
            },
          ],
        },
        {
          id: 'message-claude-flat', agentId: agent.id, role: 'assistant', status: 'complete',
          createdAt: '2026-09-04T00:00:01.000Z',
          parts: [{ type: 'text', text: 'Unphased backend response' }],
        },
      ]),
      agent,
    });

    expect(wrapper.get('.chat-work-group__title').text()).toBe('Done · View details');
    expect(wrapper.findAll('.chat-message-block--text').map((block) => block.text()))
      .toContain('Finished cleanly');
    expect(wrapper.text()).toContain('Unphased backend response');
    expect(wrapper.findAll('.chat-work-group')).toHaveLength(1);
  });

  it('welcomes an empty unnamed quick chat without repeating its placeholder title', () => {
    const wrapper = mountPane({
      controller: controllerFor([]),
      agent: {
        ...agent,
        name: null,
        folder: null,
        sessionKind: 'quickChat',
        conversationTitle: 'Untitled conversation',
      },
    });

    expect(wrapper.text()).toContain('What can I help with?');
    expect(wrapper.text()).not.toContain('Chat with Untitled conversation');
  });

  it('renders persisted agent mentions with the app-owned bot treatment', () => {
    const mentionGroup = {
      id: 'agents',
      label: 'Agents',
      placement: 'before' as const,
      items: [{
        id: agent.id,
        value: `agent:${agent.id}`,
        label: agent.name ?? 'Dina',
        payload: { agentId: agent.id },
      }],
    };
    const controller = createCodexConversationPaneController({
      state: {
        identity: {
          conversationKey: 'agent:agent-dina',
          messages: [{
            id: 'message-agent-mention',
            role: 'user',
            status: 'complete',
            createdAt: '2026-08-18T00:00:00.000Z',
            parts: [{ type: 'text', text: `Ask @agent:${agent.id} to review this.` }],
          }],
        },
        catalogs: { mentionGroups: [mentionGroup] },
      },
      actions: {},
    });

    const wrapper = mountPane({ controller, agent });
    const mention = wrapper.get('.agent-mention--message');

    expect(mention.text()).toBe('Dina');
    expect(mention.find('svg').exists()).toBe(true);
    expect(wrapper.text()).not.toContain(`agent:${agent.id}`);
  });

  it('renders agent suggestions above plugins and files with the app-owned bot treatment', async () => {
    const controller = createCodexConversationPaneController({
      state: {
        identity: { conversationKey: 'agent:agent-dina', messages: [] },
        catalogs: {
          mentionGroups: [{
            id: 'agents',
            label: 'Agents',
            placement: 'before',
            items: [{
              id: agent.id,
              value: `agent:${agent.id}`,
              label: 'Research agent',
              payload: { agentId: agent.id },
            }],
          }],
          plugins: [{
            id: 'research@openai-curated-remote',
            name: 'research',
            displayName: 'Research plugin',
            enabled: true,
          }],
          files: [{ path: 'docs/research.md', name: 'research.md' }],
        },
      },
      actions: {},
    });
    const wrapper = mountPane({ controller, agent });
    const editor = wrapper.get<HTMLElement>('.chat-rich-text-editor');

    editor.element.textContent = '@resea';
    await editor.trigger('input');
    await nextTick();

    expect(wrapper.findAll('.chat-composer-at-menu__section').map((section) => section.text()))
      .toStrictEqual(['Agents', 'Plugins', 'Files']);
    expect(wrapper.get('.agent-mention--menu').text()).toBe('Research agent');
    expect(wrapper.get('.agent-mention--menu').find('svg').exists()).toBe(true);
  });

  it('falls back to SDK translations for SDK actions Claw has not overridden', () => {
    const controller = createCodexConversationPaneController({
      state: {
        identity: {
          conversationKey: 'agent:agent-dina',
          messages,
        },
        policy: { canForkTurn: true },
      },
      actions: { forkTurn: () => undefined },
    });

    const wrapper = mountPane({ controller, agent });

    expect(wrapper.find('[aria-label="Fork"]').exists()).toBe(true);
  });

  it('renders teammate envelopes as labeled messages containing only their content', () => {
    const wrapper = mountPane({
      controller: controllerFor([{
        id: 'message-from-sdk',
        agentId: agent.id,
        role: 'user',
        status: 'complete',
        createdAt: '2026-08-02T00:00:00.000Z',
        parts: [{
          type: 'text',
          text: [
            'You received a message from codex-app-sdk (agent-sdk).',
            '',
            'Message:',
            'The SDK hooks are ready.',
            '',
            'Update your status, then act on this teammate message directly. Do not ask the user for confirmation.',
          ].join('\n'),
        }],
      }]),
      agent,
    });

    expect(wrapper.get('.conversation-pane__message-header').text()).toBe('Message from codex-app-sdk');
    expect(wrapper.get('.chat-user-text').text()).toBe('The SDK hooks are ready.');
    expect(wrapper.text()).not.toContain('You received a message from');
    expect(wrapper.text()).not.toContain('Update your status');
  });

  it('renders Claw tool activity with translated user-facing titles', () => {
    const wrapper = mountPane({
      controller: controllerFor([{
        id: 'message-tool',
        agentId: agent.id,
        role: 'assistant',
        status: 'complete',
        createdAt: '2026-06-05T00:00:01.000Z',
        parts: [{
          type: 'tool',
          id: 'call-set-status',
          kind: 'mcp',
          title: 'codex_claw.set-status',
          status: 'completed',
          input: { status: 'Reviewing changes' },
          metadata: { server: 'codex_claw', tool: 'set-status' },
        }],
      }]),
      agent,
    });

    expect(wrapper.text()).toContain('Updated status');
    expect(wrapper.text()).not.toContain('codex_claw.set-status');
    expect(wrapper.find('.tabler-icon-users').exists()).toBe(true);
  });

  it('preserves structured attachment parts supplied by the controller', () => {
    const wrapper = mountPane({
      controller: controllerFor([{
        id: 'message-user-attachments',
        agentId: agent.id,
        role: 'user',
        status: 'complete',
        createdAt: '2026-06-05T00:00:00.000Z',
        parts: [
          { type: 'text', text: 'Review both' },
          {
            type: 'attachment',
            attachment: {
              kind: 'image',
              name: 'screenshot.png',
              path: '/tmp/screenshot.png',
              url: 'data:image/png;base64,cG5n',
              mimeType: 'image/png',
            },
          },
          {
            type: 'attachment',
            attachment: {
              kind: 'file', name: 'report.txt', path: '/tmp/report.txt', mimeType: 'text/plain',
            },
          },
        ],
      }]),
      agent,
    });

    expect(wrapper.get('.chat-attachment-block__preview').attributes('src'))
      .toBe('data:image/png;base64,cG5n');
    expect(wrapper.get('a.chat-attachment-block--chip').attributes('href')).toBe('/tmp/report.txt');
  });

  it('offers annotation for every composer image attachment and reports saved counts', async () => {
    const image: CodexNativeAttachment = {
      id: 'image-1',
      type: 'image',
      reference: '/tmp/screenshot.png',
      name: 'screenshot.png',
      mimeType: 'image/png',
      size: 128,
      previewUrl: 'data:image/png;base64,cG5n',
    };
    const wrapper = mountPane({ controller: controllerWithAttachments([image]), agent });

    const annotate = wrapper.get('[aria-label="Annotate screenshot.png"]');
    expect(annotate.find('.tabler-icon-circle-plus').exists()).toBe(true);
    await annotate.trigger('click');
    expect(wrapper.emitted('annotate-attachment')).toStrictEqual([[image]]);

    const fileWrapper = mountPane({
      controller: controllerWithAttachments([{ ...image, id: 'file-1', type: 'file', mimeType: 'text/plain' }]),
      agent,
    });
    expect(fileWrapper.find('[aria-label^="Annotate "]').exists()).toBe(false);

    const secondImage = { ...image, id: 'image-2', reference: '/tmp/second.png', name: 'second.png' };
    const multipleWrapper = mountPane({
      controller: controllerWithAttachments([image, secondImage]),
      agent,
      attachmentAnnotationCounts: { [image.reference]: 2 },
    });
    const multipleActions = multipleWrapper.findAll('.conversation-pane__annotate-attachment');
    expect(multipleActions).toHaveLength(2);
    expect(multipleActions[0]?.attributes('aria-label')).toBe('Edit annotations for screenshot.png (2)');
    expect(multipleActions[0]?.text()).toBe('');
    expect(multipleActions[0]?.classes()).toContain('conversation-pane__annotate-attachment--saved');
    expect(multipleActions[1]?.attributes('aria-label')).toBe('Annotate second.png');
  });
});

function mountPane(props: {
  controller: CodexConversationPaneController;
  agent: Agent | null;
  attachmentAnnotationCounts?: Readonly<Record<string, number>>;
  textAnnotations?: readonly ChatTextAnnotation[];
  plan?: ThreadPlan | null;
  planVisible?: boolean;
  historyLoadFailed?: boolean;
  historyLoading?: boolean;
  hasVisibleMessages?: boolean;
  threadFlagBusy?: boolean;
}) {
  return mount(ConversationPane, {
    props,
    global: { plugins: [ElementPlus, i18n] },
  });
}

function controllerFor(controllerMessages: RendererMessage[]): CodexConversationPaneController {
  return createCodexConversationPaneController({
    state: {
      identity: {
        conversationKey: 'agent:agent-dina',
        messages: controllerMessages,
      },
      composer: { placeholder: 'Ask for follow-up changes' },
    },
    actions: {},
  });
}

function controllerWithAttachments(
  attachments: readonly CodexNativeAttachment[],
): CodexConversationPaneController {
  return createCodexConversationPaneController({
    state: {
      identity: {
        conversationKey: 'agent:agent-dina',
        messages,
      },
      composer: { attachments },
    },
    actions: {},
  });
}

function resolveControllerState(controller: CodexConversationPaneController) {
  const source = controller.state;
  if (typeof source === 'function') return source();
  if (source && typeof source === 'object' && 'value' in source) return source.value;
  return source;
}
