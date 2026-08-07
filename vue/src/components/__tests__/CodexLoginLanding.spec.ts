import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import { messages } from '../../i18n/messages';
import CodexLoginLanding from '../CodexLoginLanding.vue';

const landingSource = readFileSync(resolve(process.cwd(), 'src/components/CodexLoginLanding.vue'), 'utf8');

describe('CodexLoginLanding', () => {
  it('gives the app mark and sign-in action deliberate landing-page spacing', () => {
    expect(landingSource).toMatch(/\.codex-login__content\s*\{[\s\S]*transform:\s*translateY\(calc\(-1 \* var\(--space-12\)\)\);/);
    expect(landingSource).toMatch(/\.codex-login__mark\s*\{[\s\S]*width:\s*128px;[\s\S]*height:\s*128px;/);
    expect(landingSource).toMatch(/\.codex-login h1\s*\{[\s\S]*font-size:\s*var\(--font-size-28\);/);
    expect(landingSource).toMatch(/\.codex-login \.el-button\s*\{\s*margin-top:\s*var\(--space-16\);/);
  });

  it('keeps the landing background draggable without swallowing button clicks', () => {
    expect(landingSource).toMatch(/\.codex-login\s*\{[\s\S]*-webkit-app-region:\s*drag;/);
    expect(landingSource).toMatch(/\.codex-login \.el-button\s*\{[\s\S]*-webkit-app-region:\s*no-drag;/);
  });

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
    expect(wrapper.get('.codex-login__mark img').attributes('alt')).toBe('Codex Claw');
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

  it('reserves space for cancellation before sign-in becomes pending', async () => {
    const wrapper = mount(CodexLoginLanding, {
      props: { cancellable: false },
      global: {
        plugins: [
          ElementPlus,
          createI18n({ legacy: false, locale: 'en', messages }),
        ],
      },
    });
    const cancel = wrapper.get('.codex-login__cancel');

    expect(cancel.classes()).toContain('codex-login__cancel--hidden');
    expect(cancel.attributes('aria-hidden')).toBe('true');
    expect(cancel.attributes('tabindex')).toBe('-1');

    const cancellableWrapper = mount(CodexLoginLanding, {
      props: { cancellable: true },
      global: {
        plugins: [
          ElementPlus,
          createI18n({ legacy: false, locale: 'en', messages }),
        ],
      },
    });
    const visibleCancel = cancellableWrapper.get('.codex-login__cancel');

    expect(visibleCancel.classes()).not.toContain('codex-login__cancel--hidden');
    expect(visibleCancel.attributes('aria-hidden')).toBe('false');
    expect(visibleCancel.attributes('tabindex')).toBe('0');
    await visibleCancel.trigger('click');
    expect(cancellableWrapper.emitted('cancel')).toStrictEqual([[]]);
  });
});
