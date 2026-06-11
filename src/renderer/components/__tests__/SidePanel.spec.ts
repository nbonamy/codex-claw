import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
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

  it('routes source panels to the read-only source preview', () => {
    const wrapper = mount(SidePanel, {
      props: {
        panel: {
          kind: 'source',
          title: 'main.ts',
          subtitle: 'src/main.ts',
          content: 'const value: number = 1;',
          language: 'typescript',
          state: 'idle',
          error: null,
        },
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.find('.source-preview-panel').exists()).toBe(true);
    expect(wrapper.find('.markdown-panel').exists()).toBe(false);
    expect(wrapper.text()).toContain('src/main.ts');
    expect(wrapper.html()).toContain('shiki');
    expect(wrapper.text()).toContain('value');
  });

  it('routes git diff panels to the read-only diff preview', () => {
    const wrapper = mount(SidePanel, {
      props: {
        panel: {
          kind: 'gitDiff',
          title: 'Git Diff',
          subtitle: 'Current turn',
          diff: [
            'diff --git a/src/main.ts b/src/main.ts',
            '--- a/src/main.ts',
            '+++ b/src/main.ts',
            '@@ -1,2 +1,2 @@',
            '-const oldValue = 1;',
            '+const newValue = 2;',
          ].join('\n'),
          state: 'idle',
          error: null,
        },
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.find('.git-diff-preview-panel').exists()).toBe(true);
    expect(wrapper.text()).toContain('src/main.ts');
    expect(wrapper.text()).toContain('modified');
    expect(wrapper.text()).toContain('oldValue');
    expect(wrapper.text()).toContain('newValue');
  });

  it('resizes the side panel from the left edge handle', async () => {
    const wrapper = mount(SidePanel, {
      props: {
        panel: {
          kind: 'source',
          title: 'main.ts',
          subtitle: 'src/main.ts',
          content: 'const value = 1;',
          language: 'typescript',
          state: 'idle',
          error: null,
        },
      },
      global: {
        plugins: [i18n],
      },
    });
    vi.spyOn(wrapper.get('.side-panel').element, 'getBoundingClientRect').mockReturnValue({
      width: 420,
      height: 600,
      top: 0,
      left: 0,
      bottom: 600,
      right: 420,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    } as DOMRect);
    const handle = wrapper.get('.side-panel__resize-handle');

    dispatchPointerEvent(handle.element, 'pointerdown', { clientX: 500, pointerId: 1 });
    dispatchPointerEvent(handle.element, 'pointermove', { clientX: 440, pointerId: 1 });
    await nextTick();

    expect(wrapper.get('.side-panel').attributes('style')).toContain('--side-panel-width: 480px');
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

function dispatchPointerEvent(element: Element, type: string, input: { clientX: number; pointerId: number }): void {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'clientX', { value: input.clientX });
  Object.defineProperty(event, 'pointerId', { value: input.pointerId });
  element.dispatchEvent(event);
}
