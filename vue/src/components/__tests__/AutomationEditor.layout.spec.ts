import { describe, expect, it } from 'vitest';
import { mountEditor } from './automation-editor-test-harness';

describe('AutomationEditor presentation', () => {
  it('asks the parent to load repositories', () => {
    const wrapper = mountEditor({ repositories: [] });

    expect(wrapper.emitted('load-repositories')).toStrictEqual([[]]);
  });

  it('uses one repository multi-select and two guided prompts', () => {
    const wrapper = mountEditor();
    const repositories = wrapper.findAllComponents({ name: 'ElSelect' })[0]!;

    expect(repositories.props('multiple')).toBe(true);
    expect(wrapper.findAll('textarea')).toHaveLength(2);
    expect(wrapper.text()).toContain('What should be picked up?');
    expect(wrapper.text()).toContain('What should each agent do?');
    expect(wrapper.text()).not.toContain('Before completion');
  });

  it('keeps the header and actions outside the scrollable form body', () => {
    const wrapper = mountEditor();
    const form = wrapper.get('.automation-editor');
    const children = form.element.children;

    expect(children[0]).toBe(wrapper.get('.automation-editor__header').element);
    expect(children[1]).toBe(wrapper.get('.automation-editor__body').element);
    expect(children[2]).toBe(wrapper.get('.automation-editor__footer').element);
  });
});
