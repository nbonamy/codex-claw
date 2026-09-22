import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import { messages } from '../../i18n/messages';
import CodexLoginLanding from '../CodexLoginLanding.vue';

function mountLanding(props: InstanceType<typeof CodexLoginLanding>['$props'] = {}) {
  return mount(CodexLoginLanding, {
    props,
    global: {
      plugins: [
        createI18n({ legacy: false, locale: 'en', messages }),
      ],
    },
  });
}

describe('CodexLoginLanding', () => {
  it('starts ChatGPT sign in from the actionable onboarding screen', async () => {
    const wrapper = mountLanding();

    expect(wrapper.classes()).toContain('codex-login--sign-in');
    expect(wrapper.get('h1').text()).toContain('Codex Claw,');
    expect(wrapper.get('h1').text()).toContain('a home for your coding agents.');
    expect(wrapper.get('h1').find('br').exists()).toBe(true);
    expect(wrapper.text()).toContain('Sign in to start your first session.');
    expect(wrapper.get('.codex-login__mark img').attributes('alt')).toBe('Codex Claw');
    await wrapper.get('.el-button').trigger('click');
    expect(wrapper.emitted('login')).toStrictEqual([[]]);
  });

  it('renders initial authentication discovery as passive standalone progress', () => {
    const wrapper = mountLanding({ variant: 'connecting' });

    expect(wrapper.classes()).toContain('codex-login--connecting');
    expect(wrapper.get('h1').text()).toBe('Getting your workspace ready.');
    expect(wrapper.get('[role="progressbar"]').attributes('aria-label')).toBe('Connecting to ChatGPT…');
    expect(wrapper.get('[role="status"]').text()).toBe('Connecting to ChatGPT…');
    expect(wrapper.find('button').exists()).toBe(false);
  });

  it('shows pending sign-in and errors on the actionable screen', () => {
    const wrapper = mountLanding({ loading: true, error: 'Login failed' });

    expect(wrapper.text()).toContain('Waiting for sign in');
    expect(wrapper.get('[role="alert"]').text()).toBe('Login failed');
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);
  });

  it('replaces the sign-in helper with cancellation while sign-in is pending', async () => {
    const wrapper = mountLanding({ cancellable: false });

    expect(wrapper.text()).toContain('Sign in to start your first session.');
    expect(wrapper.find('.codex-login__cancel').exists()).toBe(false);

    await wrapper.setProps({ cancellable: true });

    expect(wrapper.text()).not.toContain('Sign in to start your first session.');
    const cancel = wrapper.get('.codex-login__cancel');
    await cancel.trigger('click');
    expect(wrapper.emitted('cancel')).toStrictEqual([[]]);
  });
});
