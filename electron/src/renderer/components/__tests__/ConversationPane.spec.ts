import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import {
  createCodexConversationPaneController,
  type CodexConversationPaneController,
  type CodexNativeAttachment,
} from '@codex-app-sdk/vue';
import { describe, expect, it } from 'vitest';
import type { Agent, RendererMessage, ThreadPlan } from '@codex-claw/core/contracts';
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
    expect(conversationPaneSource).toContain(':controller="controller"');
    expect(conversationPaneSource).not.toContain('createCodexConversationPaneController');
    expect(conversationPaneSource).toMatch(/\.conversation-pane\s*\{[\s\S]*background:\s*var\(--color-shell-main\);/);
    expect(conversationPaneSource).toMatch(/:deep\(\.chat-tool-call__title-target\[href\]:hover\)[\s\S]*text-decoration:\s*underline;/);
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

  it('keeps SDK sources hot-reloadable with a prebundled dist fallback', () => {
    expect(rendererViteConfig).toContain('optimizeDeps: useSdkSources ? {');
    expect(rendererViteConfig).toContain('exclude: Object.keys(sdkSourceAliases)');
    expect(rendererViteConfig).toMatch(/:\s*\{[\s\S]*force:\s*true/);
    expect(rendererViteConfig).not.toMatch(/exclude:\s*\[[^\]]*codex-app-sdk/);
  });

  it('renders app-owned messages supplied by the controller', () => {
    const wrapper = mountPane({ controller: controllerFor(messages), agent });

    expect(wrapper.text()).toContain('Find the failing test.');
    expect(wrapper.text()).toContain('Looking now.');
  });

  it('falls back to SDK translations for SDK actions Claw has not overridden', () => {
    const controller = createCodexConversationPaneController({
      state: {
        identity: {
          conversationKey: 'agent:agent-dina',
          messages,
        },
        policy: { canForkMessage: true },
      },
      actions: { forkMessage: () => undefined },
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

  it('offers annotation only for a single composer image attachment', async () => {
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

    const annotate = wrapper.get('[aria-label="Annotate"]');
    expect(annotate.find('.tabler-icon-circle-plus').exists()).toBe(true);
    await annotate.trigger('click');
    expect(wrapper.emitted('annotate-attachment')).toStrictEqual([[image]]);

    const fileWrapper = mountPane({
      controller: controllerWithAttachments([{ ...image, id: 'file-1', type: 'file', mimeType: 'text/plain' }]),
      agent,
    });
    expect(fileWrapper.find('[aria-label="Annotate"]').exists()).toBe(false);

    const multipleWrapper = mountPane({
      controller: controllerWithAttachments([image, { ...image, id: 'image-2' }]),
      agent,
    });
    expect(multipleWrapper.find('[aria-label="Annotate"]').exists()).toBe(false);
  });
});

function mountPane(props: {
  controller: CodexConversationPaneController;
  agent: Agent | null;
  plan?: ThreadPlan | null;
  planVisible?: boolean;
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
