import { flushPromises, mount } from '@vue/test-utils';
import { ElSelect, ElOption, ElInput } from 'element-plus';
import { expect, it, vi } from 'vitest';
import { defaultGeneralSettings } from '@workspace/core/settings';
import type { Agent, AgentGitWorkflow } from '@workspace/core/contracts';
import SettingsGitWorkflowSection from '../SettingsGitWorkflowSection.vue';
import { stubElectronTestWindow } from '../../test/client';

async function choose(wrapper: ReturnType<typeof mount>, label: string, text: string) {
  const control = wrapper.get(`[aria-label="${label}"]`);
  await control.trigger('click'); await flushPromises();
  const list = document.getElementById(control.attributes('aria-controls')!);
  const option = [...list!.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(item => item.textContent === text);
  expect(option).toBeDefined(); option!.click(); await flushPromises();
}
const global = { components: { ElSelect, ElOption, ElInput } };

it('saves independent app defaults only after an explicit save', async () => {
  const updateSettings = vi.fn().mockResolvedValue(undefined);
  const wrapper = mount(SettingsGitWorkflowSection, { attachTo: document.body, global, props: { settings: defaultGeneralSettings, updateSettings } });
  await flushPromises();
  expect(wrapper.text()).toContain('App defaults');
  await choose(wrapper, 'Pull strategy', 'Rebase');
  await choose(wrapper, 'Integrate into base', 'Fast-forward only');
  expect(updateSettings).not.toHaveBeenCalled();
  await wrapper.get('button').trigger('click'); await flushPromises();
  expect(updateSettings).toHaveBeenCalledExactlyOnceWith({ general: { git: { defaults: { pull: 'rebase', update: 'merge', integration: 'ff-only' } } } });
  expect(wrapper.text()).toContain('Defaults saved');
});

it('loads owning-repository overrides, saves a base override, and resets choices to inheritance', async () => {
  const agent = { id: 'agent-1', name: 'Worker', folder: '/repo', teamId: 'team', workspace: { kind: 'git', primaryWorktreeRoot: '/repo' } } as Agent;
  const workflow = { repository: 'repo', preferences: { repositoryKey: '/repo/.git', defaults: { pull: 'merge', update: 'merge', integration: 'merge' }, overrides: { pull: 'rebase' }, effective: { pull: 'rebase', update: 'merge', integration: 'merge' } } } as AgentGitWorkflow;
  const updateAgentGitPreferences = vi.fn().mockResolvedValue(workflow);
  stubElectronTestWindow({ app: { getAgentGitWorkflow: vi.fn().mockResolvedValue(workflow), updateAgentGitPreferences } });
  const wrapper = mount(SettingsGitWorkflowSection, { attachTo: document.body, global, props: { settings: defaultGeneralSettings, agents: [agent] } });
  await flushPromises(); await choose(wrapper, 'Repository', '/repo');
  await choose(wrapper, 'Pull strategy', 'Inherit (Merge)');
  expect(wrapper.get('[aria-label="Pull strategy"]').element.closest('.el-select')?.textContent).toContain('Inherit (Merge)');
  await wrapper.get('input[aria-label="Base branch"]').setValue('release');
  expect(updateAgentGitPreferences).not.toHaveBeenCalled();
  await wrapper.get('button').trigger('click'); await flushPromises();
  expect(updateAgentGitPreferences).toHaveBeenCalledExactlyOnceWith(agent.id, { baseBranch: 'release' });
});
