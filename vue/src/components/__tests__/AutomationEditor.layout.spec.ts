import { describe, expect, it } from 'vitest';

import { automation, mountEditor } from './automation-editor-test-harness';

describe('AutomationEditor presentation', () => {
  it('asks the parent to load repositories and issues', () => {
    const wrapper = mountEditor({ repositories: [] });

    expect(wrapper.emitted('load-repositories')).toStrictEqual([[]]);
  });

  it('renders assignee options with Me for the connected account', () => {
    const wrapper = mountEditor();

    const assigneeSelect = wrapper.findAllComponents({ name: 'ElSelect' })[2];

    expect(assigneeSelect?.props('filterable')).toBe(true);
    expect(assigneeSelect?.props('clearable')).toBe(true);
    expect(wrapper.findAllComponents({ name: 'ElOption' }).map((option) => option.props('label'))).toContain('Me');
    expect(wrapper.findAllComponents({ name: 'ElOption' }).map((option) => option.props('label'))).toContain('alex');
  });

  it('preserves saved assignment and completion instructions', async () => {
    const wrapper = mountEditor({
      automation: automation({
        instructions: {
          assignment: 'Start with a failing test.',
          beforeCompletion: 'Remove the triage label manually.',
        },
      }),
    });

    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      instructions: {
        assignment: 'Start with a failing test.',
        beforeCompletion: 'Remove the triage label manually.',
      },
    });
  });

  it('keeps the header and actions outside the scrollable form body', () => {
    const wrapper = mountEditor();
    const form = wrapper.get('.automation-editor');
    const children = form.element.children;

    expect(children[0]).toBe(wrapper.get('.automation-editor__header').element);
    expect(children[1]).toBe(wrapper.get('.automation-editor__body').element);
    expect(children[2]).toBe(wrapper.get('.automation-editor__footer').element);
    expect(wrapper.get('.automation-editor__body').find('.automation-editor__footer').exists()).toBe(false);
  });
});
