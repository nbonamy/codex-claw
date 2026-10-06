import { flushPromises, mount } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import SettingsAntigravityPanel from '../SettingsAntigravityPanel.vue';
import { ElSwitch } from 'element-plus';

it('separates native login, cancellation, authentication and engine enablement', async () => {
  const setEnabled = vi.fn();
  const wrapper = mount(SettingsAntigravityPanel, { props: { connected: false, enabled: false, setEnabled }, global: { components: { ElSwitch } } });
  expect(wrapper.text()).toContain('Antigravity');
  await wrapper.findAll('button').find(button => button.text() === 'Connect')!.trigger('click');
  expect(wrapper.emitted('connect')).toEqual([[]]);
  await wrapper.setProps({ pending: true });
  await wrapper.findAll('button').find(button => button.text() === 'Cancel sign-in')!.trigger('click');
  expect(wrapper.emitted('cancel')).toEqual([[]]);
  await wrapper.setProps({ pending: false, connected: true, authentication: { kind: 'antigravity', connected: true, state: { loggedIn: true, homePath: '/private/native-home' } } });
  expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false');
  expect(setEnabled).not.toHaveBeenCalled();
  expect(wrapper.text()).not.toContain('/private/native-home');
  await wrapper.get('[role="switch"]').trigger('click'); await flushPromises();
  expect(setEnabled).toHaveBeenCalledWith(true);
  await wrapper.findAll('button').find(button => button.text() === 'Disconnect')!.trigger('click');
  expect(wrapper.emitted('disconnect')).toEqual([[]]);
});
