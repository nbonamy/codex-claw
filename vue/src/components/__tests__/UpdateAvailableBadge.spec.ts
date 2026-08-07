/**
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import UpdateAvailableBadge from '../UpdateAvailableBadge.vue';

describe('UpdateAvailableBadge', () => {
  it('stays hidden when no update is ready', () => {
    const wrapper = mount(UpdateAvailableBadge, {
      props: { status: { state: 'idle' } },
    });

    expect(wrapper.find('button').exists()).toBe(false);
  });

  it('shows downloaded updates and emits install', async () => {
    const wrapper = mount(UpdateAvailableBadge, {
      props: { status: { state: 'downloaded', version: '0.4.0' } },
    });

    const button = wrapper.get('button');
    expect(button.text()).toBe('Update available');
    expect(button.attributes('title')).toBe('Update 0.4.0 available. Restart Codex Claw to install.');

    await button.trigger('click');

    expect(wrapper.emitted('install')).toHaveLength(1);
  });
});
