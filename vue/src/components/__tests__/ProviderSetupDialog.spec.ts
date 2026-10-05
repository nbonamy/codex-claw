import { mount } from '@vue/test-utils';
import { ElCheckbox, ElRadio, ElRadioGroup } from 'element-plus';
import { describe, expect, it } from 'vitest';
import ProviderSetupDialog from '../ProviderSetupDialog.vue';
import { i18n } from '../../i18n';

describe('ProviderSetupDialog', () => {
  it('lets Settings change skills reuse for existing chats without requesting roster removal', async () => {
    const setup = { backend: 'codex' as const, installed: true, isolated: true, shareSkills: true, homePath: '/app/codex-home', locked: true, affectedAgentIds: ['agent-one'] };
    const wrapper = mount(ProviderSetupDialog, {
      props: { setup, allowReset: true, busy: false, error: null },
      global: { components: { ElCheckbox, ElRadio, ElRadioGroup }, stubs: { teleport: true } },
    });
    const checkbox = wrapper.get('input[type="checkbox"]');
    expect(checkbox.attributes('disabled')).toBeUndefined();
    await checkbox.setValue(false);
    expect(wrapper.get('.app-button--primary').attributes('disabled')).toBeUndefined();
    await wrapper.get('.app-button--primary').trigger('click');
    expect(wrapper.emitted('save')).toStrictEqual([[{ isolated: true, shareSkills: false }]]);
    expect(wrapper.find('.provider-setup__acknowledgment').exists()).toBe(false);
  });
  it('requires a separate acknowledgment before removing the exact displayed roster, and Cancel makes no change', async () => {
    const setup = { backend: 'codex' as const, installed: true, isolated: true, shareSkills: true, homePath: '/app/codex-home', locked: true, affectedAgentIds: ['agent-one', 'quick-chat'] };
    const wrapper = mount(ProviderSetupDialog, {
      props: { setup, allowReset: true, busy: false, error: null },
      global: { components: { ElCheckbox, ElRadio, ElRadioGroup }, stubs: { teleport: true } },
    });
    await wrapper.findAll('input[type="radio"]')[1]!.setValue();
    await wrapper.get('.app-button--primary').trigger('click');
    expect(wrapper.emitted('save')).toBeUndefined();
    expect(wrapper.text()).toContain('all 2 local Codex agents');
    expect(wrapper.get('.app-button--primary').attributes('disabled')).toBeDefined();
    await wrapper.get('.app-button--tertiary').trigger('click');
    expect(wrapper.emitted('close')).toEqual([[]]);
    expect(wrapper.emitted('save')).toBeUndefined();
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get('.app-button--primary').trigger('click');
    expect(wrapper.emitted('save')).toEqual([[{ isolated: false, shareSkills: true, removeAgentIds: ['agent-one', 'quick-chat'] }]]);
    await wrapper.setProps({ setup: { ...setup } });
    await wrapper.findAll('input[type="radio"]')[1]!.setValue();
    await wrapper.get('.app-button--primary').trigger('click');
    expect(wrapper.get('input[type="checkbox"]').element).toHaveProperty('checked', false);
  });
  it('defaults a missing CLI to separate chats/shared skills and submits explicit installation', async () => {
    const wrapper = mount(ProviderSetupDialog, {
      attachTo: document.body,
      props: { setup: { backend: 'claude', installed: false, isolated: true, shareSkills: true, homePath: '/app/claude-home', locked: false }, busy: false, error: null },
      global: { plugins: [i18n], components: { ElCheckbox, ElRadio, ElRadioGroup }, stubs: { teleport: true } },
    });
    expect(getComputedStyle(wrapper.getComponent(ElRadioGroup).element).flexDirection).toBe('column');
    expect(wrapper.getComponent(ElRadioGroup).findAll('input').map(input => input.attributes('type')))
      .toStrictEqual(['radio', 'checkbox', 'radio']);
    expect(wrapper.get('input[type="radio"]').element).toHaveProperty('checked', true);
    expect(wrapper.get('input[type="checkbox"]').element).toHaveProperty('checked', true);
    await wrapper.get('.app-button--primary').trigger('click');
    expect(wrapper.emitted('save')).toStrictEqual([[{ isolated: true, shareSkills: true }]]);
    await wrapper.findAll('input[type="radio"]')[1]!.setValue();
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
    await wrapper.get('.app-button--primary').trigger('click');
    expect(wrapper.emitted('save')?.[1]).toStrictEqual([{ isolated: false, shareSkills: true }]);
    await wrapper.setProps({ setup: { ...wrapper.props('setup')!, locked: true, installed: true } });
    expect(wrapper.get('.app-button--primary').attributes('disabled')).toBeDefined();
  });
});
