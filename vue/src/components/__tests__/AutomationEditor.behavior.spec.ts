import { describe, expect, it } from 'vitest';
import { mountEditor, sourceRepositories, workRepositories } from './automation-editor-test-harness';
import { flushPromises } from '@vue/test-utils';

describe('AutomationEditor behavior', () => {
  it('uses the supplied current code repository for Linear and refuses a repository that disappears', async () => {
    const wrapper = mountEditor({ connections: [{ provider: 'linear', status: 'connected' }], currentRepositoryPath: sourceRepositories()[0]!.path,
      repositories: [{ ...workRepositories()[0]!, provider: 'linear', id: 'linear:eng', fullName: 'Engineering' }] });
    await wrapper.get('[aria-label="Backlog provider"]').trigger('click'); await flushPromises();
    [...document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(el => el.textContent === 'Linear')!.click(); await flushPromises();
    await wrapper.get('[aria-label="Team / project"]').trigger('click'); await flushPromises();
    [...document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(el => el.textContent === 'Engineering')!.click(); await flushPromises();
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ repositories: [{ provider: 'linear', repositoryId: 'linear:eng', sourceRepositoryPath: sourceRepositories()[0]!.path }] });
    await wrapper.setProps({ sourceRepositories: [] });
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toHaveLength(1);
  });
  it('offers only GitHub repositories that have a configured local clone', () => {
    const wrapper = mountEditor({
      repositories: workRepositories(),
      sourceRepositories: sourceRepositories().slice(0, 1),
    });

    const repositoryOptions = wrapper.findAllComponents({ name: 'ElSelect' })[1]!.findAllComponents({ name: 'ElOption' });
    expect(repositoryOptions.map((option) => option.props('label'))).toStrictEqual(['nbonamy/codex-claw']);
  });

  it('does not submit without a repository selection', async () => {
    const wrapper = mountEditor();

    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  it('disables repository selection when GitHub is disconnected', () => {
    const wrapper = mountEditor({
      connection: { provider: 'github', status: 'disconnected' },
    });

    expect(wrapper.findAllComponents({ name: 'ElSelect' })[1]!.props('disabled')).toBe(true);
    expect(wrapper.text()).toContain('Connect GitHub in Settings');
  });
});
