import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SidePanel from '../SidePanel.vue';
import { i18n } from '../../i18n';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SidePanel', () => {
  it('renders markdown panel chrome and closes', async () => {
    const wrapper = mount(SidePanel, {
      props: {
        panel: {
          kind: 'markdown',
          title: 'architecture.md',
          subtitle: 'docs/architecture.md',
          content: '## Architecture',
          state: 'idle',
          error: null,
        },
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.text()).toContain('architecture.md');
    expect(wrapper.text()).toContain('docs/architecture.md');
    expect(wrapper.text()).toContain('Architecture');

    await wrapper.get('[aria-label="Close side panel"]').trigger('click');

    expect(wrapper.emitted('close')).toStrictEqual([[]]);
  });

  it('omits the subtitle row when markdown has no path', () => {
    const wrapper = mount(SidePanel, {
      props: {
        panel: {
          kind: 'markdown',
          title: 'Generated Plan',
          content: '# Plan',
          state: 'idle',
          error: null,
        },
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.get('h2').text()).toBe('Generated Plan');
    expect(wrapper.find('.side-panel__copy p').exists()).toBe(false);
  });

  it('renders plan review actions and emits confirm and cancel', async () => {
    const wrapper = mount(SidePanel, {
      props: {
        panel: {
          kind: 'markdown',
          purpose: 'plan',
          title: 'Plan',
          content: '# Plan',
          state: 'idle',
          error: null,
        },
      },
      global: {
        plugins: [i18n],
      },
    });

    await wrapper.get('button.plan-review-footer__button--primary').trigger('click');
    await wrapper.findAll('.plan-review-footer__button')[2].trigger('click');

    expect(wrapper.emitted('confirmPlan')).toStrictEqual([[]]);
    expect(wrapper.emitted('cancelPlan')).toStrictEqual([[]]);
  });

  it('explains comment mode before comments exist', async () => {
    const wrapper = mount(SidePanel, {
      props: {
        panel: {
          kind: 'markdown',
          purpose: 'plan',
          title: 'Plan',
          content: '# Plan',
          state: 'idle',
          error: null,
        },
      },
      global: {
        plugins: [i18n],
      },
    });

    await wrapper.findAll('.plan-review-footer__button')[1].trigger('click');

    expect(wrapper.text()).toContain('Select text in the plan to add an inline comment.');
    expect(wrapper.emitted('commentPlan')).toBeUndefined();
  });

  it('saves selected plan text as an inline comment and emits comments', async () => {
    const wrapper = mount(SidePanel, {
      props: {
        panel: {
          kind: 'markdown',
          purpose: 'plan',
          title: 'Plan',
          content: '# Plan\n\nShip this carefully.',
          state: 'idle',
          error: null,
        },
      },
      global: {
        plugins: [i18n],
      },
    });
    mockPlanSelection(wrapper, 'Ship this carefully.');

    await wrapper.get('.markdown-panel').trigger('mouseup');
    await wrapper.get('textarea').setValue('Make this safer.');
    await wrapper.get('form.side-panel__comment-box').trigger('submit');
    expect(wrapper.text()).toContain('1 comment');
    expect(wrapper.findAll('.plan-review-footer__comment-button svg')).toHaveLength(2);
    expect(wrapper.get('.plan-review-footer__comments').text()).not.toContain('Edit');
    expect(wrapper.get('.plan-review-footer__comments').text()).not.toContain('Delete');

    await wrapper.findAll('.plan-review-footer__button')[1].trigger('click');

    expect(wrapper.emitted('commentPlan')).toStrictEqual([[
      [
        {
          id: 'plan-comment-1',
          quote: 'Ship this carefully.',
          body: 'Make this safer.',
        },
      ],
    ]]);
    expect(wrapper.text()).not.toContain('1 comment');
  });

  it('edits and deletes saved plan comments', async () => {
    const wrapper = mount(SidePanel, {
      props: {
        panel: {
          kind: 'markdown',
          purpose: 'plan',
          title: 'Plan',
          content: '# Plan\n\nShip this carefully.',
          state: 'idle',
          error: null,
        },
      },
      global: {
        plugins: [i18n],
      },
    });
    mockPlanSelection(wrapper, 'Ship this carefully.');

    await wrapper.get('.markdown-panel').trigger('mouseup');
    await wrapper.get('textarea').setValue('Make this safer.');
    await wrapper.get('form.side-panel__comment-box').trigger('submit');

    await wrapper.get('[aria-label="Edit comment"]').trigger('click');
    await wrapper.get('textarea').setValue('Make this dramatically safer.');
    await wrapper.get('form.side-panel__comment-box').trigger('submit');

    expect(wrapper.text()).toContain('Make this dramatically safer.');
    expect(wrapper.text()).not.toContain('Make this safer.');

    await wrapper.get('[aria-label="Delete comment"]').trigger('click');

    expect(wrapper.text()).not.toContain('Make this dramatically safer.');
    expect(wrapper.text()).not.toContain('1 comment');
  });

  it('renders saved plan comments as one-line previews', async () => {
    const wrapper = mount(SidePanel, {
      props: {
        panel: {
          kind: 'markdown',
          purpose: 'plan',
          title: 'Plan',
          content: '# Plan\n\nShip this carefully.\nThen ship more.',
          state: 'idle',
          error: null,
        },
      },
      global: {
        plugins: [i18n],
      },
    });
    mockPlanSelection(wrapper, 'Ship this carefully.\nThen ship more.');

    await wrapper.get('.markdown-panel').trigger('mouseup');
    await wrapper.get('textarea').setValue('Make this safer.\nKeep the scope tight.');
    await wrapper.get('form.side-panel__comment-box').trigger('submit');

    expect(wrapper.get('.plan-review-footer__comment').attributes('title')).toBe(
      'Ship this carefully. Then ship more. - Make this safer. Keep the scope tight.',
    );
    expect(wrapper.get('.plan-review-footer__comment blockquote').text()).toBe('Ship this carefully. Then ship more.');
    expect(wrapper.get('.plan-review-footer__comment p').text()).toBe('Make this safer. Keep the scope tight.');
  });

  it('shows an updating overlay while a previewed plan is being refreshed', async () => {
    const wrapper = mount(SidePanel, {
      props: {
        panel: {
          kind: 'markdown',
          purpose: 'plan',
          title: 'Plan',
          content: '# Plan',
          state: 'idle',
          error: null,
        },
        planUpdating: true,
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.get('.side-panel__plan-overlay').text()).toBe('Updating plan...');
    expect(wrapper.find('.side-panel__plan-spinner').exists()).toBe(true);

    await (wrapper as unknown as { setProps: (props: { planUpdating: boolean }) => Promise<void> }).setProps({ planUpdating: false });

    expect(wrapper.find('.side-panel__plan-overlay').exists()).toBe(false);
  });
});

function mockPlanSelection(wrapper: ReturnType<typeof mount>, text: string): void {
  const markdownElement = wrapper.get('.markdown-panel').element;
  vi.spyOn(window, 'getSelection').mockReturnValue({
    rangeCount: 1,
    toString: () => text,
    getRangeAt: () => ({
      commonAncestorContainer: markdownElement,
      getBoundingClientRect: () => ({
        bottom: 80,
        left: 20,
        top: 60,
        right: 220,
        width: 200,
        height: 20,
        x: 20,
        y: 60,
        toJSON: () => undefined,
      } as DOMRect),
    } as unknown as Range),
    removeAllRanges: vi.fn(),
  } as unknown as Selection);
}
