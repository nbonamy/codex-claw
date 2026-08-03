import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PlanReviewFooter from '../PlanReviewFooter.vue';
import { i18n } from '../../i18n';

describe('PlanReviewFooter', () => {
  it('renders saved comments as compact one-line highlighted targets', () => {
    const wrapper = mount(PlanReviewFooter, {
      props: {
        comments: [{
          id: 'comment-1',
          quote: 'Preserve the existing conversation behavior.',
          body: 'Keep this scoped.',
        }],
      },
      global: { plugins: [i18n] },
    });

    const row = wrapper.get('.plan-review-footer__comment');
    expect(row.get('.plan-review-footer__comment-copy span').text()).toBe('about');
    expect(row.get('strong').text()).toBe('Preserve the existing conversation behavior.');
    expect(row.text()).not.toContain('Keep this scoped.');
    expect(row.attributes('title')).toBe(
      'Preserve the existing conversation behavior. - Keep this scoped.',
    );
    expect(wrapper.get('[aria-label="Send 1 comment"]').text()).toBe('Send 1');
    expect(wrapper.findAll('.plan-review-footer__button').map((button) => button.text())).toStrictEqual(['Clear', 'Cancel']);
    expect(wrapper.find('.plan-review-footer__button--primary').exists()).toBe(false);
  });

  it('shows initial actions and disables every action while comments are being sent', async () => {
    const wrapper = mount(PlanReviewFooter, {
      props: { comments: [] },
      global: { plugins: [i18n] },
    });

    expect(wrapper.get('.plan-review-footer__help').text()).toBe(
      'Select text in the plan to add an inline comment.',
    );
    expect(wrapper.find('.plan-review-footer__help svg').exists()).toBe(true);
    expect(wrapper.findAll('.plan-review-footer__button').map((button) => button.text())).toStrictEqual(['Confirm', 'Cancel']);

    await (wrapper as unknown as { setProps: (props: Record<string, unknown>) => Promise<void> }).setProps({
      comments: [{ id: 'comment-1', quote: 'Build it.', body: 'Split it up.' }],
      disabled: true,
    });

    expect(wrapper.findAll('button').every((button) => button.attributes('disabled') !== undefined)).toBe(true);
  });
});
