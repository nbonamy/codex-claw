import { mount } from '@vue/test-utils';
import { ElCheckbox, ElRadio, ElRadioGroup } from 'element-plus';
import { describe, expect, it } from 'vitest';
import ProviderSetupDialog from '../ProviderSetupDialog.vue';
import { i18n } from '../../i18n';

describe('ProviderSetupDialog', () => {
  it('defaults a missing CLI to separate chats/shared skills and submits explicit installation', async () => {
    const wrapper = mount(ProviderSetupDialog, {
      attachTo: document.body,
      props: { setup: { backend: 'claude', installed: false, isolated: true, shareSkills: true, homePath: '/claw/claude-home', locked: false }, busy: false, error: null },
      global: { plugins: [i18n], components: { ElCheckbox, ElRadio, ElRadioGroup }, stubs: { teleport: true } },
    });
    expect(getComputedStyle(wrapper.getComponent(ElRadioGroup).element).flexDirection).toBe('column');
    expect(wrapper.getComponent(ElRadioGroup).findAll('input').map(input => input.attributes('type')))
      .toStrictEqual(['radio', 'checkbox', 'radio']);
    expect(wrapper.get('input[type="radio"]').element).toHaveProperty('checked', true);
    expect(wrapper.get('input[type="checkbox"]').element).toHaveProperty('checked', true);
    await wrapper.get('.claw-button--primary').trigger('click');
    expect(wrapper.emitted('save')).toStrictEqual([[{ isolated: true, shareSkills: true }]]);
    await wrapper.findAll('input[type="radio"]')[1]!.setValue();
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
    await wrapper.get('.claw-button--primary').trigger('click');
    expect(wrapper.emitted('save')?.[1]).toStrictEqual([{ isolated: false, shareSkills: true }]);
    await wrapper.setProps({ setup: { ...wrapper.props('setup')!, locked: true, installed: true } });
    expect(wrapper.get('.claw-button--primary').attributes('disabled')).toBeDefined();
  });
});
