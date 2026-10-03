import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import SettingsClaudeCodePanel from '../SettingsClaudeCodePanel.vue';
import { ElSwitch } from 'element-plus';

describe('SettingsClaudeCodePanel', () => {
  it('groups account, location, and enable in that order and keeps the enable toggle available', async () => {
    const setEnabled = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(SettingsClaudeCodePanel, { props: { setEnabled, home: { homePath: '/claw/claude-home', isolated: true, shareSkills: true } }, global: { components: { ElSwitch } } });
    expect(wrapper.findAll('.settings-section')).toHaveLength(1);
    expect(wrapper.findAll('.settings-row__copy strong').map(row => row.text())).toEqual(['Account', 'Location', 'Enable engine']);
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('connect')).toHaveLength(1);
    await wrapper.setProps({ connected: true, authentication: { kind: 'claude', connected: true, state: { loggedIn: true, account: { type: 'subscription', email: 'user@example.com', subscription: 'max' } } } });
    expect(wrapper.findAll('.settings-row')[0]!.text()).toContain('user@example.com · max');
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true');
    await wrapper.get('[role="switch"]').trigger('click');
    await flushPromises();
    expect(setEnabled).toHaveBeenCalledWith(false);
    await wrapper.setProps({ enabled: false });
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false');
    await wrapper.get('[role="switch"]').trigger('click');
    await flushPromises();
    expect(setEnabled).toHaveBeenLastCalledWith(true);
    await wrapper.findAll('button').find(button => button.text() === 'Disconnect')!.trigger('click');
    expect(wrapper.emitted('disconnect')).toEqual([[]]);
    expect(wrapper.emitted('connect')).toHaveLength(1);
    await wrapper.findAll('button').find(button => button.text() === 'Customize')!.trigger('click');
    expect(wrapper.emitted('customize')).toEqual([[]]);
  });
});
