import { product } from '@workspace/core/product';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ElMessageBox, ElSwitch } from 'element-plus';
import SettingsEngineConnectionRow from '../SettingsEngineConnectionRow.vue';

describe('SettingsEngineConnectionRow', () => {
  afterEach(async () => {
    ElMessageBox.close();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  });

  it.each([
    ["Error invoking remote method 'provider:enabled:set': Error: Cannot disable the last engine. Enable another one first.", 'To turn this engine off, first connect or enable another one.', `${product.name} needs an active engine`],
    ["Error invoking remote method 'provider:enabled:set': Error: transport unavailable", 'Could not update engine status. Please try again.', 'Engine status unchanged'],
  ])('shows a clean dismissible dialog for %s and keeps the engine enabled', async (error, message, title) => {
    const wrapper = mount(SettingsEngineConnectionRow, { global: { components: { ElSwitch }, stubs: { transition: false } }, props: { connected: true, enabled: true, setEnabled: vi.fn().mockRejectedValue(new Error(error)) } });
    await wrapper.get('[role="switch"]').trigger('click');
    await flushPromises();
    const dialog = new DOMWrapper(document.body).get('[role="dialog"]');
    expect(dialog.attributes('aria-label')).toBe(title);
    expect(dialog.get('.el-message-box__message').text()).toBe(message);
    expect(dialog.text()).not.toContain('Error invoking remote method');
    expect(wrapper.find('.form-row__error').exists()).toBe(false);
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true');
    await dialog.get('.el-message-box__btns button').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true');
  });

  it('replaces Connect with a cancellable sign-in action in the control area', async () => {
    const wrapper = mount(SettingsEngineConnectionRow, { props: { pending: true } });
    expect(wrapper.get('.form-row__copy').text()).toBe('Account');
    expect(wrapper.findAll('button')).toHaveLength(1);
    const cancel = wrapper.get('.form-row__control button');
    expect(cancel.text()).toBe('Cancel sign-in');
    await cancel.trigger('click');
    expect(wrapper.emitted('cancel')).toEqual([[]]);
    await wrapper.setProps({ pending: false });
    expect(wrapper.get('.form-row__control button').text()).toBe('Connect');
  });
});
