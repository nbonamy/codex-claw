import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import QuickOpenDialog from '../QuickOpenDialog.vue';

describe('QuickOpenDialog', () => {
  it('filters items and supports arrow, enter, escape, and backdrop dismissal', async () => {
    const wrapper = mount(QuickOpenDialog, {
      props: {
        dialogLabel: 'Open thing',
        emptyLabel: 'Nothing found',
        inputAriaLabel: 'Search things',
        items: [
          { id: 'one', label: 'One', detail: 'First team' },
          { id: 'two', label: 'Two', detail: 'Second team', searchText: 'special target' },
        ],
        placeholder: 'Search…',
      },
    });

    const input = wrapper.get('input');
    await input.setValue('special');
    expect(wrapper.findAll('.quick-open-dialog__item')).toHaveLength(1);
    await input.trigger('keydown.enter');
    expect(wrapper.emitted('select')).toStrictEqual([['two']]);
    expect(wrapper.emitted('close')).toHaveLength(1);

    await input.setValue('');
    await input.trigger('keydown.down');
    await input.trigger('keydown.enter');
    expect(wrapper.emitted('select')).toStrictEqual([['two'], ['two']]);

    await input.trigger('keydown.escape');
    await wrapper.get('.quick-open-dialog').trigger('mousedown');
    expect(wrapper.emitted('close')).toHaveLength(4);
  });

  it('shows its configured empty state', async () => {
    const wrapper = mount(QuickOpenDialog, {
      props: {
        dialogLabel: 'Open thing',
        emptyLabel: 'Nothing found',
        inputAriaLabel: 'Search things',
        items: [],
        placeholder: 'Search…',
      },
    });

    expect(wrapper.text()).toContain('Nothing found');
  });

  it('scrolls the keyboard-selected item into view', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const wrapper = mount(QuickOpenDialog, {
      props: {
        dialogLabel: 'Open thing',
        emptyLabel: 'Nothing found',
        inputAriaLabel: 'Search things',
        items: [
          { id: 'one', label: 'One' },
          { id: 'two', label: 'Two' },
        ],
        placeholder: 'Search…',
      },
    });

    await wrapper.get('input').trigger('keydown.down');

    expect(wrapper.findAll('.quick-open-dialog__item')[1]!.classes()).toContain('quick-open-dialog__item--selected');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  });
});
