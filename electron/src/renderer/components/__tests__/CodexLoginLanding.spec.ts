import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import { messages } from '../../i18n/messages';
import CodexLoginLanding from '../CodexLoginLanding.vue';

describe('CodexLoginLanding', () => {
  it('starts ChatGPT sign in from the signed-out landing screen', async () => {
    const wrapper = mount(CodexLoginLanding, {
      global: {
        plugins: [
          ElementPlus,
          createI18n({ legacy: false, locale: 'en', messages }),
        ],
      },
    });

    expect(wrapper.get('h1').text()).toBe('Welcome to Codex Claw');
    expect(wrapper.text()).toContain('Sign in with ChatGPT to get started.');
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('login')).toStrictEqual([[]]);
  });

  it('shows pending and error states', () => {
    const wrapper = mount(CodexLoginLanding, {
      props: { loading: true, error: 'Login failed' },
      global: {
        plugins: [
          ElementPlus,
          createI18n({ legacy: false, locale: 'en', messages }),
        ],
      },
    });

    expect(wrapper.text()).toContain('Waiting for sign in');
    expect(wrapper.get('[role="alert"]').text()).toBe('Login failed');
  });
});
