import { flushPromises, mount } from '@vue/test-utils';
import { computed, defineComponent, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n';

const voice = vi.hoisted(() => ({
  onTranscript: null as ((value: string) => void) | null,
  recording: null as { value: boolean } | null,
}));

vi.mock('@codex-app-sdk/vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@codex-app-sdk/vue')>();
  const recording = ref(false);
  voice.recording = recording;
  return {
    ...actual,
    CodexComposerVoiceButton: defineComponent({
      emits: ['toggle'],
      template: '<button type="button" aria-label="Record voice prompt" @click="$emit(\'toggle\')">Mic</button>',
    }),
    CodexComposerVoiceField: defineComponent({ template: '<div>Recording</div>' }),
    getCodexNativeRendererApi: () => ({ capabilities: { transcription: true } }),
    useCodexComposerVoice: (options: { onTranscript(value: string): void }) => {
      voice.onTranscript = options.onTranscript;
      return {
        buttonDisabled: computed(() => false),
        buttonLabel: computed(() => 'Record voice prompt'),
        buttonTitle: computed(() => 'Record voice prompt'),
        isRecording: recording,
        isTranscribing: ref(false),
        recorder: computed(() => null),
        stop: vi.fn().mockResolvedValue(true),
        toggle: vi.fn(async () => { recording.value = !recording.value; }),
        dispose: vi.fn(),
      };
    },
  };
});

import RepositoryIssueComposer from '../RepositoryIssueComposer.vue';

beforeEach(() => {
  if (voice.recording) voice.recording.value = false;
  voice.onTranscript = null;
});

describe('RepositoryIssueComposer', () => {
  it('creates an issue through the host action and shows passive confirmation', async () => {
    let resolveCreate!: (item: ReturnType<typeof workItem>) => void;
    const createAction = vi.fn(() => new Promise<ReturnType<typeof workItem>>((resolve) => {
      resolveCreate = resolve;
    }));
    const wrapper = mount(RepositoryIssueComposer, {
      props: { createAction, repositoryName: 'codex-claw' },
      global: { plugins: [i18n] },
    });

    await wrapper.get('textarea').setValue('  Reconnect after a backend restart.  ');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.text()).toContain('Drafting and creating issue');
    resolveCreate(workItem());
    await flushPromises();

    expect(createAction).toHaveBeenCalledWith('Reconnect after a backend restart.');
    expect(wrapper.text()).toContain('Issue #42 created');
  });

  it('inserts voice transcripts and keeps the editable prompt on errors', async () => {
    const createAction = vi.fn().mockRejectedValue(new Error('GitHub is unavailable.'));
    const wrapper = mount(RepositoryIssueComposer, {
      props: { createAction, repositoryName: 'codex-claw' },
      global: { plugins: [i18n] },
    });

    voice.onTranscript?.('Create a keyboard navigation issue');
    await flushPromises();
    expect(wrapper.get('textarea').element.value).toBe('Create a keyboard navigation issue');

    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.text()).toContain('GitHub is unavailable.');
    expect(wrapper.get('textarea').element.value).toBe('Create a keyboard navigation issue');
  });
});

function workItem() {
  return {
    provider: 'github' as const,
    id: 'nbonamy/codex-claw#42',
    kind: 'issue' as const,
    repositoryId: 'nbonamy/codex-claw',
    repositoryFullName: 'nbonamy/codex-claw',
    number: 42,
    title: 'Reconnect after restart',
    url: 'https://github.com/nbonamy/codex-claw/issues/42',
    state: 'open' as const,
    labels: [],
    createdAt: '2026-08-12T12:00:00.000Z',
    updatedAt: '2026-08-12T12:00:00.000Z',
  };
}
