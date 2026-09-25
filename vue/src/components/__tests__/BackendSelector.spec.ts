import { mount } from '@vue/test-utils';
import { computed, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import type { AgentBackend } from '@codex-claw/core/contracts';
import BackendSelector from '../BackendSelector.vue';
import { backendChoicesKey } from '../backend-selection';

describe('BackendSelector', () => {
  it('hides single-backend choices, emits selections, and follows configuration changes', async () => {
    const choices = ref<AgentBackend[]>(['codex']);
    const wrapper = mount(BackendSelector, {
      props: { modelValue: 'codex', size: 'small' },
      global: { provide: { [backendChoicesKey as symbol]: computed(() => choices.value) } },
    });
    expect(wrapper.find('[aria-label="Coding agent"]').exists()).toBe(false);
    choices.value = ['codex', 'claude'];
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[aria-label="Coding agent"]').text()).toContain('Claude Code');
    await wrapper.get('select').setValue('claude');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toStrictEqual(['claude']);
    await wrapper.setProps({ modelValue: 'claude', disabled: true, size: 'large' });
    expect(wrapper.get('select').attributes('disabled')).toBeDefined();
    choices.value = ['codex'];
    await wrapper.vm.$nextTick();
    expect(wrapper.find('select').exists()).toBe(false);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toStrictEqual(['codex']);
  });
});
