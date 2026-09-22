import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import { messages } from '../../i18n/messages';
import GitHubOnboardingLanding from '../GitHubOnboardingLanding.vue';

function mountLanding(props: Partial<InstanceType<typeof GitHubOnboardingLanding>['$props']> = {}) {
  return mount(GitHubOnboardingLanding, {
    props,
    global: {
      plugins: [
        createI18n({ legacy: false, locale: 'en', messages }),
      ],
    },
  });
}

describe('GitHubOnboardingLanding', () => {
  it('offers a skippable GitHub connection', async () => {
    const wrapper = mountLanding();

    expect(wrapper.get('h1').text()).toContain('Connect GitHub.');
    expect(wrapper.text()).not.toContain('Optional');
    expect(wrapper.text()).toContain('Skip for now');

    const actions = wrapper.findAll('.github-onboarding__actions .el-button');
    await actions[0]!.trigger('click');
    await actions[1]!.trigger('click');

    expect(wrapper.emitted('connect')).toStrictEqual([[]]);
    expect(wrapper.emitted('skip')).toStrictEqual([[]]);
  });

  it('reuses the GitHub authorization steps during device authorization', async () => {
    const wrapper = mountLanding({
      authorization: {
        provider: 'github',
        userCode: 'ABCD-1234',
        verificationUri: 'https://github.com/login/device',
        expiresAt: '2026-09-01T12:00:00.000Z',
      },
    });

    wrapper.getComponent({ name: 'GitHubAuthorizationSteps' });
    expect(wrapper.text()).toContain('ABCD-1234');
    await wrapper.getComponent({ name: 'GitHubAuthorizationSteps' }).vm.$emit('open');
    expect(wrapper.emitted('openAuthorization')).toStrictEqual([[]]);
  });
});
