import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import {
  CodexConversationPane,
  type CodexComposerState,
  type CodexNativeAttachment,
} from 'codex-app-sdk/vue';
import { nextTick, type Component, type DefineComponent } from 'vue';
import { describe, expect, it } from 'vitest';
import type { Agent, BackendApprovalRequest, BackendCapabilities, RendererMessage, ThreadPlan } from '@codex-claw/shared/contracts';
import ConversationPane from '../ConversationPane.vue';
import { i18n } from '../../i18n';

const conversationPaneSource = readFileSync(resolve(process.cwd(), 'src/renderer/components/ConversationPane.vue'), 'utf8');
const rendererViteConfig = readFileSync(resolve(process.cwd(), 'vite.renderer.config.ts'), 'utf8');

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
    createdAt: '2026-06-05T00:00:00.000Z',
    parts: [{ type: 'text', text: 'Find the failing test.' }],
  },
  {
    id: 'message-assistant',
    agentId: agent.id,
    role: 'assistant',
    status: 'complete',
    createdAt: '2026-06-05T00:00:01.000Z',
    parts: [{ type: 'text', text: 'Looking now.' }],
  },
];

describe('ConversationPane', () => {
  it('uses the message surface for the empty conversation background', () => {
    expect(conversationPaneSource).toMatch(/\.conversation-pane\s*\{[\s\S]*background:\s*var\(--color-shell-main\);/);
  });

  it('floats active plan progress without passing a sticky turn diff to the SDK composer', () => {
    const plan: ThreadPlan = {
      threadId: 'thread-plan',
      turnId: 'turn-plan',
      explanation: 'Current execution plan',
      steps: [{ step: 'Implement the fix', status: 'inProgress' }],
      markdown: 'Current execution plan\n- [ ] Implement the fix',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    const wrapper = mountPane({ agent, messages, isSending: true, plan });

    expect(wrapper.get('.conversation-plan').text()).toContain('Implement the fix');
    const sdkProps = wrapper.getComponent(CodexConversationPane as unknown as Component).props() as Record<string, unknown>;
    expect(sdkProps.turnGitDiff).toBeUndefined();
  });

  it('keeps SDK sources hot-reloadable with a prebundled dist fallback', () => {
    expect(rendererViteConfig).toContain('optimizeDeps: useSdkSources ? {');
    expect(rendererViteConfig).toContain('exclude: Object.keys(sdkSourceAliases)');
    expect(rendererViteConfig).toMatch(/:\s*\{[\s\S]*force:\s*true/);
    expect(rendererViteConfig).not.toMatch(/exclude:\s*\[[^\]]*codex-app-sdk/);
  });

  it('adapts app-owned messages and prompt submission to the SDK pane', async () => {
    const wrapper = mountPane({ agent, messages, isSending: false });

    expect(wrapper.text()).toContain('Find the failing test.');
    expect(wrapper.text()).toContain('Looking now.');
    expect(wrapper.get('[role="textbox"][contenteditable]').attributes('data-placeholder')).toBe('Ask for follow-up changes');

    await nextTick();
    await setComposerValue(wrapper, '  hello codex  ');
    expect(wrapper.emitted('update:composerState')).toContainEqual([
      expect.objectContaining({
        agentId: 'agent-dina',
        state: expect.objectContaining({ text: '  hello codex  ' }),
      }),
    ]);
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('sendPrompt')).toStrictEqual([['hello codex']]);
  });

  it('renders teammate envelopes as labeled messages containing only their content', () => {
    const wrapper = mountPane({
      agent,
      messages: [{
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
      }],
      isSending: false,
    });

    expect(wrapper.get('.conversation-pane__message-header').text()).toBe('Message from codex-app-sdk');
    expect(wrapper.get('.chat-user-text').text()).toBe('The SDK hooks are ready.');
    expect(wrapper.text()).not.toContain('You received a message from');
    expect(wrapper.text()).not.toContain('Update your status');
    expect(wrapper.find('[aria-label="Copy"]').exists()).toBe(true);
  });

  it('renders Claw tool activity with translated user-facing titles', () => {
    const wrapper = mountPane({
      agent,
      messages: [{
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
      }],
      isSending: false,
    });

    expect(wrapper.text()).toContain('Updated status');
    expect(wrapper.text()).not.toContain('chat.tool.mcp.codexClaw');
    expect(wrapper.text()).not.toContain('codex_claw.set-status');
    expect(wrapper.find('.tabler-icon-users').exists()).toBe(true);
  });

  it('forwards SDK attachment descriptors without leaking SDK-selected model options', async () => {
    const wrapper = mountPane({ agent, messages, isSending: false });
    const sdkPane = wrapper.getComponent(CodexConversationPane as unknown as Component);

    sdkPane.vm.$emit('submit', 'review these files', {
      attachments: [
        {
          type: 'image',
          path: '/tmp/screenshot.png',
          detail: 'original',
          name: 'screenshot.png',
          mimeType: 'image/png',
          previewUrl: 'data:image/png;base64,cG5n',
        },
        { type: 'file', path: '/tmp/report.txt', name: 'report.txt', mimeType: 'text/plain' },
      ],
      model: 'sdk-owned-model-selection-must-not-cross-the-adapter',
    });
    await nextTick();

    expect(wrapper.emitted('sendPrompt')).toStrictEqual([[
      'review these files',
      {
        attachments: [
          {
            type: 'image',
            path: '/tmp/screenshot.png',
            detail: 'original',
            name: 'screenshot.png',
            mimeType: 'image/png',
            previewUrl: 'data:image/png;base64,cG5n',
          },
          { type: 'file', path: '/tmp/report.txt', name: 'report.txt', mimeType: 'text/plain' },
        ],
      },
    ]]);
  });

  it('restores selected attachments and forwards attachment-aware steering for the owning agent', async () => {
    const attachments: readonly CodexNativeAttachment[] = [
      {
        id: 'attachment-context', type: 'file', path: '/tmp/context.txt', name: 'context.txt',
        mimeType: 'text/plain', size: 12,
      },
    ];
    const wrapper = mountPane({ agent, messages, isSending: true, attachments });
    const sdkPane = wrapper.getComponent(CodexConversationPane as unknown as Component);

    expect((sdkPane.props() as Record<string, unknown>).attachments).toStrictEqual(attachments);
    sdkPane.vm.$emit('attachmentsChange', [
      {
        id: 'attachment-screenshot', type: 'image', path: '/tmp/screenshot.png', name: 'screenshot.png',
        mimeType: 'image/png', size: 24,
      },
    ]);
    sdkPane.vm.$emit('steer', 'use this screenshot', {
      attachments: [
        { type: 'image', path: '/tmp/screenshot.png', detail: 'high', name: 'screenshot.png' },
      ],
    });
    await nextTick();

    expect(wrapper.emitted('update:composerAttachments')).toStrictEqual([[
      {
        agentId: 'agent-dina',
        attachments: [
          {
            id: 'attachment-screenshot', type: 'image', path: '/tmp/screenshot.png', name: 'screenshot.png',
            mimeType: 'image/png', size: 24,
          },
        ],
      },
    ]]);
    expect(wrapper.emitted('steerPrompt')).toStrictEqual([[
      'use this screenshot',
      {
        attachments: [
          { type: 'image', path: '/tmp/screenshot.png', detail: 'high', name: 'screenshot.png' },
        ],
      },
    ]]);
  });

  it('preserves structured attachment parts through the thin SDK adapter', () => {
    const attachmentMessages: RendererMessage[] = [{
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
    }];
    const wrapper = mountPane({ agent, messages: attachmentMessages, isSending: false });
    const sdkProps = wrapper.getComponent(CodexConversationPane as unknown as Component).props() as {
      messages: Array<{ content: string; parts: unknown[] }>;
    };

    expect(sdkProps.messages).toStrictEqual([expect.objectContaining({
      content: 'Review both',
      parts: [
        { type: 'text', content: 'Review both' },
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
    })]);
    expect(wrapper.get('.chat-attachment-block__preview').attributes('src'))
      .toBe('data:image/png;base64,cG5n');
    expect(wrapper.get('a.chat-attachment-block--chip').attributes('href')).toBe('/tmp/report.txt');
  });

  it('maps provider capabilities and conversation identity without forking SDK UI', () => {
    const capabilities: BackendCapabilities = {
      attachments: false,
      approvals: false,
      editMessage: false,
      goals: false,
      history: true,
      interrupt: true,
      models: true,
      planMode: 'prompted',
      reasoningEffort: false,
      retryMessage: false,
      rollback: false,
      skills: false,
      steerPrompt: false,
      thinkingBudget: true,
    };
    const wrapper = mountPane({
      agent: {
        ...agent,
        backend: 'claude',
        backendDefaults: { kind: 'claude' },
        backendSession: {
          kind: 'claude',
          sessionId: 'session-claude',
          transport: 'stdio',
        },
      },
      backendCapabilities: capabilities,
      messages,
      isSending: false,
    });

    const sdkPane = wrapper.getComponent(CodexConversationPane as unknown as Component);
    const sdkProps = sdkPane.props() as Record<string, unknown>;
    expect(sdkProps.conversationKey).toBe('claude:session-claude');
    expect(sdkProps.capabilities).toStrictEqual({
      approvals: false,
      approvalPresets: [],
      editMessage: false,
      goals: false,
      history: true,
      interrupt: true,
      models: true,
      planMode: true,
      reasoningEffort: false,
      retryMessage: false,
      rollback: false,
      skills: false,
      steerPrompt: false,
    });
    expect(sdkProps.canDeleteMessage).toBe(false);
    expect(sdkProps.canEditMessage).toBe(false);
    expect(sdkProps.canRetryMessage).toBe(false);
    expect(sdkProps.attachEnabled).toBe(false);
  });

  it('passes detailed provider-neutral approvals into the SDK and forwards decisions', async () => {
    const approvals: BackendApprovalRequest[] = [{
      id: 'approval-native-1',
      kind: 'permissions',
      conversationId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'item-1',
      title: 'Allow workspace access',
      description: 'A tool needs to update the project.',
      cwd: '/tmp/project',
      requestedPermissions: [{ kind: 'filesystem', access: 'write', path: '/tmp/project' }],
      allowedScopes: ['once', 'session'],
      canDeny: true,
    }];
    const wrapper = mountPane({ agent, approvals, messages, isSending: false });
    const sdkPane = wrapper.getComponent(CodexConversationPane as unknown as Component);

    expect((sdkPane.props() as Record<string, unknown>).approvals).toStrictEqual(approvals);
    sdkPane.vm.$emit('resolveApproval', 'approval-native-1', 'approve', 'session');
    await nextTick();

    expect(wrapper.emitted('resolve-approval')).toStrictEqual([[
      'approval-native-1', 'approve', 'session',
    ]]);
  });

  it('shows SDK history loading for a persisted conversation', () => {
    const wrapper = mountPane({
      agent: {
        ...agent,
        backendSession: { kind: 'codex', threadId: 'thread-persisted' },
      },
      messages: [],
      isLoading: true,
      isSending: false,
    });

    expect(wrapper.find('[aria-label="Loading conversation"]').exists()).toBe(true);
    expect(wrapper.find('[role="textbox"][contenteditable]').exists()).toBe(false);
    const sdkProps = wrapper.getComponent(CodexConversationPane as unknown as Component).props() as Record<string, unknown>;
    expect(sdkProps.conversationKey).toBe('codex:thread-persisted');
  });

  it('routes SDK file links to the Claw side-panel seam', async () => {
    const wrapper = mountPane({
      agent,
      messages: [{
        id: 'message-links',
        agentId: agent.id,
        role: 'assistant',
        status: 'complete',
        createdAt: '2026-06-05T00:00:01.000Z',
        parts: [{ type: 'text', text: '[Guide](docs/guide.md#intro) [Remote](https://example.com)' }],
      }],
      isSending: false,
    });

    await wrapper.get('a[href="docs/guide.md#intro"]').trigger('click');
    await wrapper.get('a[href="https://example.com"]').trigger('click');

    expect(wrapper.emitted('open-file')).toStrictEqual([['docs/guide.md']]);
  });

  it('restores controlled composer state and tags updates with the owning agent', async () => {
    const dinaState = { text: 'draft for Dina', selectionStart: 4, selectionEnd: 9 };
    const wrapper = mountPane({ agent, messages, isSending: false, composerState: dinaState });
    await nextTick();

    expect(wrapper.get('[role="textbox"][contenteditable]').text()).toBe('draft for Dina');
    const sdkPane = wrapper.getComponent(CodexConversationPane as unknown as Component);
    sdkPane.vm.$emit('update:composerState', {
      text: 'updated Dina draft', selectionStart: 7, selectionEnd: 7,
    });
    await nextTick();
    expect(wrapper.emitted('update:composerState')).toStrictEqual([[
      {
        agentId: 'agent-dina',
        state: { text: 'updated Dina draft', selectionStart: 7, selectionEnd: 7 },
      },
    ]]);

    await wrapper.setProps({
      agent: {
        ...agent,
        id: 'agent-jesse',
        name: 'Jesse',
      },
      composerState: { text: '', selectionStart: 0, selectionEnd: 0 },
    });
    await nextTick();

    expect(wrapper.get('[role="textbox"][contenteditable]').text()).toBe('');
    await wrapper.setProps({ agent, composerState: dinaState });
    await nextTick();

    expect(wrapper.get('[role="textbox"][contenteditable]').text()).toBe('draft for Dina');
    const sdkProps = sdkPane.props() as Record<string, unknown>;
    expect(sdkProps.composerState).toStrictEqual(dinaState);
    expect(sdkProps.conversationKey).toBe('agent:agent-dina');
  });

  it('uses provider-specific working copy while preserving SDK queue behavior', async () => {
    const wrapper = mountPane({
      agent: {
        ...agent,
        backend: 'claude',
        backendDefaults: { kind: 'claude' },
      },
      messages: [],
      isSending: true,
    });

    expect(wrapper.get('[role="textbox"][contenteditable]').attributes('data-placeholder')).toBe('Claude is working...');
    await setComposerValue(wrapper, 'queue this next');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('sendPrompt')).toStrictEqual([['queue this next']]);
  });
});

function mountPane(props: {
  messages: RendererMessage[];
  agent: Agent | null;
  isSending: boolean;
  backendCapabilities?: BackendCapabilities;
  approvals?: BackendApprovalRequest[];
  plan?: ThreadPlan | null;
  isLoading?: boolean;
  composerState?: CodexComposerState;
  attachments?: readonly CodexNativeAttachment[];
}) {
  type TestConversationPaneProps = typeof props & { isLoading: boolean };
  return mount(ConversationPane as unknown as DefineComponent<TestConversationPaneProps>, {
    props: {
      isLoading: false,
      ...props,
    },
    global: {
      plugins: [ElementPlus, i18n],
    },
  });
}

async function setComposerValue(wrapper: ReturnType<typeof mountPane>, value: string): Promise<void> {
  const editor = wrapper.get('[role="textbox"][contenteditable]');
  editor.element.textContent = value;
  await editor.trigger('input');
  await nextTick();
}
