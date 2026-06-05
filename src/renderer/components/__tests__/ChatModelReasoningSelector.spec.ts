import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import ChatModelReasoningSelector from '../ChatModelReasoningSelector.vue';
import type { CodexModelOption, ReasoningEffort } from '../../../shared/contracts';

type SelectorProps = {
  disabled?: boolean;
  modelCatalogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  modelId?: string | null;
  models?: CodexModelOption[];
  reasoningEffort?: ReasoningEffort | null;
};

const models: CodexModelOption[] = [
  {
    id: 'codex-fast',
    model: 'gpt-5.1-codex-fast',
    displayName: 'GPT-5.1 Codex Fast',
    description: 'Fast implementation work',
    hidden: false,
    supportedReasoningEfforts: [
      { reasoningEffort: 'low', description: 'Quick' },
      { reasoningEffort: 'medium', description: 'Balanced' },
    ],
    defaultReasoningEffort: 'medium',
    isDefault: false,
  },
  {
    id: 'codex-max',
    model: 'gpt-5.1-codex-max',
    displayName: 'GPT-5.1 Codex Max',
    description: 'Deep implementation work',
    hidden: false,
    supportedReasoningEfforts: [
      { reasoningEffort: 'medium', description: 'Balanced' },
      { reasoningEffort: 'high', description: 'Deep reasoning' },
      { reasoningEffort: 'xhigh', description: 'Maximum reasoning' },
    ],
    defaultReasoningEffort: 'high',
    isDefault: true,
  },
];

describe('ChatModelReasoningSelector', () => {
  it('shows the selected model and reasoning effort labels', () => {
    const wrapper = mountSelector({
      modelId: 'codex-max',
      reasoningEffort: 'xhigh',
    });

    expect(wrapper.get('.chat-model-selector__button').text()).toContain('5.1 Codex Max Extra High');
  });

  it('falls back to the default catalog model and its default reasoning effort', () => {
    const wrapper = mountSelector();

    expect(wrapper.get('.chat-model-selector__button').text()).toContain('5.1 Codex Max High');
  });

  it('emits model and reasoning changes from dropdown commands', async () => {
    const wrapper = mountSelector();
    const dropdowns = wrapper.findAllComponents({ name: 'ElDropdown' });

    expect(dropdowns).toHaveLength(1);
    await dropdowns[0].vm.$emit('command', { kind: 'model', value: 'codex-fast' });
    await dropdowns[0].vm.$emit('command', { kind: 'reasoning', value: 'medium' });

    expect(wrapper.emitted('update:modelId')).toStrictEqual([['codex-fast']]);
    expect(wrapper.emitted('update:reasoningEffort')).toStrictEqual([['medium']]);
  });

  it('keeps disabled controls inert when the model catalog has not loaded', () => {
    const wrapper = mountSelector({
      models: [],
      modelCatalogStatus: 'loading',
    });

    expect(wrapper.text()).toContain('Loading models');
    expect(wrapper.text()).toContain('Loading');
    for (const button of wrapper.findAll('button')) {
      expect(button.attributes()).toHaveProperty('disabled');
    }
  });

  it('does not show model descriptions inside the popover', () => {
    const wrapper = mountSelector();

    expect(wrapper.find('.chat-model-selector__menu').text()).not.toContain('Deep implementation work');
    expect(wrapper.find('.chat-model-selector__menu').text()).not.toContain('Fast implementation work');
  });

  it('groups reasoning and model choices in one menu', () => {
    const wrapper = mountSelector();

    expect(wrapper.findAll('.chat-model-selector__section-label').map((label) => label.text())).toStrictEqual([
      'Reasoning',
      'Model',
    ]);
    expect(wrapper.findAllComponents({ name: 'ElDropdown' })).toHaveLength(1);
  });
});

function mountSelector(overrides: Partial<SelectorProps> = {}) {
  return mount(ChatModelReasoningSelector, {
    props: {
      models,
      ...overrides,
    },
    global: {
      plugins: [ElementPlus],
    },
  });
}
