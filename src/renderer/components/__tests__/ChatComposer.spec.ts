import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChatComposer from '../ChatComposer.vue';
import { i18n } from '../../i18n';
import type { AgentContextUsage, CodexModelOption, CodexSkillSummary } from '../../../shared/contracts';

vi.mock('fix-webm-duration', () => ({
  default: vi.fn(async (blob: Blob) => blob),
}));

vi.mock('webm-to-wav-converter', () => ({
  getWaveBlob: vi.fn(async (blob: Blob) => new Blob([blob], { type: 'audio/wav' })),
}));

type ChatComposerProps = {
  disabled: boolean;
  isSending: boolean;
  placeholder: string;
};

const models: CodexModelOption[] = [
  {
    id: 'codex-max',
    model: 'gpt-5.1-codex-max',
    displayName: 'GPT-5.1 Codex Max',
    description: 'Deep coding work',
    hidden: false,
    supportedReasoningEfforts: [
      { reasoningEffort: 'medium', description: 'Balanced' },
      { reasoningEffort: 'high', description: 'Deep reasoning' },
    ],
    defaultReasoningEffort: 'high',
    isDefault: true,
  },
];

const skills: CodexSkillSummary[] = [
  {
    name: 'frontend-design',
    displayName: 'Frontend Design',
    description: 'Design polished frontend pages and UI.',
    shortDescription: 'Design polished UI.',
    path: '/Users/nbonamy/.codex/skills/frontend-design/SKILL.md',
    scope: 'project',
    enabled: true,
  },
  {
    name: 'skill-creator',
    description: 'Create or update Codex skills.',
    path: '/Users/nbonamy/.codex/skills/skill-creator/SKILL.md',
    scope: 'user',
    enabled: true,
  },
];

describe('ChatComposer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete window.codexClaw;
  });

  it('emits a trimmed prompt and clears the textarea', async () => {
    const wrapper = mountComposer();

    await wrapper.get('textarea').setValue('  ship the ui  ');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('send')).toStrictEqual([['ship the ui']]);
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('');
  });

  it('sends from the shared send button', async () => {
    const wrapper = mountComposer();

    await wrapper.get('textarea').setValue('ship it');
    await wrapper.get('.chat-composer__send').trigger('click');

    expect(wrapper.emitted('send')).toStrictEqual([['ship it']]);
  });

  it('submits with Enter and preserves Shift Enter for multiline drafts', async () => {
    const wrapper = mountComposer();

    await wrapper.get('textarea').setValue('first line');
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter', shiftKey: true });
    expect(wrapper.emitted('send')).toBeUndefined();

    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('send')).toStrictEqual([['first line']]);
  });

  it('steers with Command Enter', async () => {
    const wrapper = mountComposer({ isSending: true });

    await wrapper.get('textarea').setValue('switch to the smaller fix');
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter', metaKey: true });

    expect(wrapper.emitted('steer')).toStrictEqual([['switch to the smaller fix']]);
    expect(wrapper.emitted('send')).toBeUndefined();
  });

  it('opens the composer action menu and toggles modes', async () => {
    const wrapper = mountComposer();

    await wrapper.get('.chat-composer-action-menu__button').trigger('click');

    expect(wrapper.find('.chat-composer-action-menu').exists()).toBe(true);
    await wrapper.findAll('.chat-composer-action-menu__item')[1]?.trigger('click');
    await wrapper.findAll('.chat-composer-action-menu__item')[2]?.trigger('click');

    expect(wrapper.emitted('update:planMode')).toStrictEqual([[true]]);
    expect(wrapper.emitted('update:goalMode')).toStrictEqual([[true]]);
  });

  it('toggles plan mode with Shift Tab and renders active mode chips', async () => {
    const wrapper = mountComposer({
      goalMode: true,
      planMode: true,
    });

    expect(wrapper.text()).toContain('Plan');
    expect(wrapper.text()).toContain('Goal');

    await wrapper.get('textarea').trigger('keydown', { key: 'Tab', shiftKey: true });

    expect(wrapper.emitted('update:planMode')).toStrictEqual([[false]]);
  });

  it('disables sending without text or without an agent but keeps busy drafts submittable', async () => {
    const empty = mountComposer();
    expect(empty.get('.chat-composer__send').attributes()).toHaveProperty('disabled');

    const disabled = mountComposer({ disabled: true });
    await disabled.get('textarea').setValue('hello');
    expect(disabled.get('.chat-composer__send').attributes()).toHaveProperty('disabled');

    const sending = mountComposer({ isSending: true });
    await sending.get('textarea').setValue('hello');
    expect(sending.get('.chat-composer__send').attributes()).not.toHaveProperty('disabled');
    await sending.get('form').trigger('submit');
    expect(sending.emitted('send')).toStrictEqual([['hello']]);
  });

  it('renders selected Codex model and reasoning controls', () => {
    const wrapper = mountComposer({
      models,
      selectedModelId: 'codex-max',
      selectedReasoningEffort: 'high',
    });

    expect(wrapper.text()).toContain('GPT-5.1 Codex Max');
    expect(wrapper.text()).toContain('High');
  });

  it('shows context utilization when Codex reports token usage', () => {
    const wrapper = mountComposer({
      contextUsage: {
        totalTokens: 397_740,
        inputTokens: 40_000,
        cachedInputTokens: 10_000,
        outputTokens: 8_000,
        reasoningOutputTokens: 2_000,
        lastTotalTokens: 50_000,
        modelContextWindow: 200_000,
        usedPercent: 25,
      },
    });

    expect(wrapper.find('.chat-context-usage').exists()).toBe(true);
    expect(wrapper.find('.chat-context-usage').attributes('title')).toBeUndefined();
    expect(wrapper.find('.chat-context-usage__popover').text()).toContain('25% used (75% left)');
  });

  it('opens a slash skill menu, filters skills, and inserts the selected skill', async () => {
    const wrapper = mountComposer({ skills });

    await wrapper.get('textarea').setValue('/front');
    await wrapper.get('textarea').trigger('keyup');

    expect(wrapper.find('.chat-composer-skill-menu').exists()).toBe(true);
    expect(wrapper.text()).toContain('Frontend Design');
    expect(wrapper.text()).not.toContain('skill-creator');

    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' });

    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('/frontend-design ');
  });

  it('navigates slash skills with arrow keys and inserts with enter', async () => {
    const wrapper = mountComposer({ skills });

    await wrapper.get('textarea').setValue('/');
    await wrapper.get('textarea').trigger('keyup');
    await wrapper.get('textarea').trigger('keydown', { key: 'ArrowDown' });
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' });

    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('/skill-creator ');
  });

  it('records audio and inserts the Apple speech transcript at the caret', async () => {
    installAudioRecordingMocks();
    const transcribeAppleSpeech = vi.fn(async () => ({ text: 'dictated change' }));
    window.codexClaw = {
      transcribeAppleSpeech,
    } as unknown as typeof window.codexClaw;
    const wrapper = mountComposer();

    await wrapper.get('textarea').setValue('please');
    const textarea = wrapper.get('textarea').element as HTMLTextAreaElement;
    textarea.setSelectionRange(6, 6);
    await wrapper.get('textarea').trigger('select');
    await wrapper.get('.chat-composer__voice').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.get('.chat-composer__voice').attributes('aria-pressed')).toBe('true');
    });
    expect(wrapper.find('.chat-composer-waveform').exists()).toBe(true);

    await wrapper.get('.chat-composer__voice').trigger('click');
    await vi.waitFor(() => {
      expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('please dictated change');
    });

    expect(transcribeAppleSpeech).toHaveBeenCalledWith(expect.any(ArrayBuffer), {
      locale: navigator.language,
    });
  });
});

function mountComposer(overrides: Partial<ChatComposerProps & {
  contextUsage: AgentContextUsage;
  goalMode: boolean;
  models: CodexModelOption[];
  planMode: boolean;
  selectedModelId: string;
  selectedReasoningEffort: string;
  skills: CodexSkillSummary[];
}> = {}) {
  return mount(ChatComposer, {
    props: {
      disabled: false,
      isSending: false,
      placeholder: 'Ask for follow-up changes',
      ...overrides,
    },
    global: {
      plugins: [ElementPlus, i18n],
    },
  });
}

function installAudioRecordingMocks(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
  }) as unknown as CanvasRenderingContext2D);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    color: 'rgb(10, 20, 30)',
  } as CSSStyleDeclaration);
  const analyser = {
    disconnect: vi.fn(),
    fftSize: 0,
    frequencyBinCount: 4,
    getByteTimeDomainData: vi.fn((target: Uint8Array) => {
      target.fill(128);
    }),
  };
  const source = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  class FakeAudioContext {
    close = vi.fn(async () => undefined);
    createAnalyser = vi.fn(() => analyser);
    createMediaStreamSource = vi.fn(() => source);
    resume = vi.fn(async () => undefined);
  }

  vi.stubGlobal('AudioContext', FakeAudioContext);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }],
      })),
    },
  });

  class FakeMediaRecorder {
    static isTypeSupported = vi.fn(() => true);

    mimeType = 'audio/webm;codecs=opus';
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    onstop: (() => void) | null = null;
    state: RecordingState = 'inactive';

    start(): void {
      this.state = 'recording';
    }

    stop(): void {
      this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) } as BlobEvent);
      this.state = 'inactive';
      this.onstop?.();
    }
  }

  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
}
