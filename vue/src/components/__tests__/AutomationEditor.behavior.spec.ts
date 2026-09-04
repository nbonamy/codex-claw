import { describe, expect, it } from 'vitest';
import { mountEditor, sourceRepositories, workRepositories } from './automation-editor-test-harness';

describe('AutomationEditor behavior', () => {
  it('offers only GitHub repositories that have a configured local clone', () => {
    const wrapper = mountEditor({
      repositories: workRepositories(),
      sourceRepositories: sourceRepositories().slice(0, 1),
    });

    const repositoryOptions = wrapper.findAllComponents({ name: 'ElSelect' })[0]!.findAllComponents({ name: 'ElOption' });
    expect(repositoryOptions.map((option) => option.props('label'))).toStrictEqual(['nbonamy/codex-claw']);
  });

  it('does not submit without a repository selection', async () => {
    const wrapper = mountEditor();

    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.findComponent({ name: 'ElButton' }).findAll).toBeDefined();
  });

  it('disables repository selection when GitHub is disconnected', () => {
    const wrapper = mountEditor({
      connection: { provider: 'github', status: 'disconnected' },
    });

    expect(wrapper.findAllComponents({ name: 'ElSelect' })[0]!.props('disabled')).toBe(true);
    expect(wrapper.text()).toContain('Connect GitHub in Settings');
  });
});
