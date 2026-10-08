import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import 'element-plus/theme-chalk/el-icon.css';
import ProviderInstallActions from '../ProviderInstallActions.vue';

describe('ProviderInstallActions', () => {
  it('uses a small refresh icon that rotates only while busy and prevents duplicate checks', async () => {
    const wrapper = mount(ProviderInstallActions, { props: { backend: 'codex' }, attachTo: document.body });
    // jsdom preserves custom-property references in computed spacing.
    expect(getComputedStyle(wrapper.element).gap).toBe('var(--space-4)');
    const button = wrapper.get('button[aria-label="Check again"]');
    const icon = wrapper.get('.el-icon');
    expect(getComputedStyle(icon.element).fontSize).toBe('12px');
    expect(getComputedStyle(icon.element).animation).not.toContain('rotating');
    await button.trigger('click');
    expect(wrapper.emitted('refresh')).toEqual([[]]);
    await wrapper.setProps({ busy: true });
    expect(button.attributes('aria-busy')).toBe('true');
    expect(button.attributes('disabled')).toBeDefined();
    expect(getComputedStyle(icon.element).animation).toContain('rotating');
    await button.trigger('click');
    expect(wrapper.emitted('refresh')).toHaveLength(1);
    await wrapper.setProps({ busy: false });
    expect(getComputedStyle(icon.element).animation).not.toContain('rotating');
    expect(button.attributes('disabled')).toBeUndefined();
  });
});
