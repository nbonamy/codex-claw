import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import type { WorkRepository } from '@codex-claw/core/contracts';
import RepositoryAcquireDialog from '../RepositoryAcquireDialog.vue';

const repositories: WorkRepository[] = [
  {
    provider: 'github',
    id: 'nbonamy/codex-claw',
    owner: 'nbonamy',
    name: 'codex-claw',
    fullName: 'nbonamy/codex-claw',
    url: 'https://github.com/nbonamy/codex-claw',
    isPrivate: true,
  },
  {
    provider: 'github',
    id: 'nbonamy/multi-llm-ts',
    owner: 'nbonamy',
    name: 'multi-llm-ts',
    fullName: 'nbonamy/multi-llm-ts',
    url: 'https://github.com/nbonamy/multi-llm-ts',
    isPrivate: false,
  },
];

describe('RepositoryAcquireDialog', () => {
  it('filters GitHub repositories and distinguishes local projects from clone targets', async () => {
    const wrapper = mount(RepositoryAcquireDialog, {
      props: {
        visible: true,
        mode: 'github',
        repositories,
        localRepositoryIdentities: ['github.com/nbonamy/codex-claw'],
      },
      global: { plugins: [ElementPlus] },
    });
    await flushPromises();

    expect(wrapper.get('.el-dialog').classes()).toContain('claw-dialog--compact');
    expect(wrapper.get('.repository-acquire-dialog__body').classes()).toContain('repository-acquire-dialog__scroll-region');
    expect(wrapper.text()).toContain('On this machine');
    expect(wrapper.text()).toContain('Open');
    expect(wrapper.text()).toContain('Clone');
    expect(wrapper.findComponent({ name: 'GitHubIcon' }).exists()).toBe(true);
    expect(wrapper.get('.repository-acquire-dialog__name').element.tagName).toBe('SPAN');
    expect(wrapper.get('.repository-acquire-dialog__name').text()).toBe('nbonamy/codex-claw');

    await wrapper.get('input').setValue('multi');
    expect(wrapper.findAll('.repository-acquire-dialog__row')).toHaveLength(1);

    await wrapper.get('.repository-acquire-dialog__row').trigger('click');
    expect(wrapper.emitted('select-repository')).toStrictEqual([[repositories[1]]]);
  });

  it('does not treat a same-named repository from another owner as local', async () => {
    const wrapper = mount(RepositoryAcquireDialog, {
      props: {
        visible: true,
        mode: 'github',
        repositories: [{ ...repositories[0]!, id: 'openai/codex-claw', owner: 'openai', fullName: 'openai/codex-claw', url: 'https://github.com/openai/codex-claw' }],
        localRepositoryIdentities: ['github.com/nbonamy/codex-claw'],
      },
      global: { plugins: [ElementPlus] },
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain('On this machine');
    expect(wrapper.text()).toContain('Clone');
  });

  it('validates and submits an explicit repository URL', async () => {
    const wrapper = mount(RepositoryAcquireDialog, {
      props: { visible: true, mode: 'url' },
      global: { plugins: [ElementPlus] },
    });
    await flushPromises();

    expect(wrapper.find('.repository-acquire-dialog__search').exists()).toBe(false);
    expect(wrapper.get('.claw-dialog__title').text()).toBe('Clone repository');
    expect(wrapper.get('.el-dialog').classes()).not.toContain('claw-dialog--compact');
    expect(wrapper.get('[aria-label="Repository URL"]').attributes('placeholder')).toBe('https://github.com/owner/repository.git');
    const submit = wrapper.findAll('button').find((button) => button.text() === 'Clone repository')!;
    expect(submit.attributes('disabled')).toBeDefined();

    await wrapper.get('[aria-label="Repository URL"]').setValue('git@github.com:nbonamy/codex-claw.git');
    await submit.trigger('click');

    expect(wrapper.emitted('clone-url')).toStrictEqual([['git@github.com:nbonamy/codex-claw.git']]);
  });
});
