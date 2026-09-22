import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '../../i18n/messages';
import { clearConfetti, useConfetti } from '../../shared/confetti/use-confetti';
import OnboardingCompleteLanding from '../OnboardingCompleteLanding.vue';

function mountLanding(props: Partial<InstanceType<typeof OnboardingCompleteLanding>['$props']> = {}) {
  return mount(OnboardingCompleteLanding, {
    props,
    global: {
      plugins: [
        createI18n({ legacy: false, locale: 'en', messages }),
      ],
    },
  });
}

describe('OnboardingCompleteLanding', () => {
  afterEach(() => {
    clearConfetti();
    vi.useRealTimers();
  });

  it('celebrates once and completes automatically', async () => {
    vi.useFakeTimers();
    const wrapper = mountLanding();

    expect(wrapper.text()).toContain("You're all set.");
    expect(wrapper.text()).toContain('Codex Claw is ready.');
    expect(useConfetti().bursts.value).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5000);

    expect(wrapper.emitted('complete')).toStrictEqual([[]]);
  });

  it('can finish immediately without celebrating', async () => {
    vi.useFakeTimers();
    const wrapper = mountLanding({ celebrate: false });

    expect(useConfetti().bursts.value).toHaveLength(0);
    await wrapper.get('.onboarding-complete__action').trigger('click');

    expect(wrapper.emitted('complete')).toStrictEqual([[]]);
  });
});
