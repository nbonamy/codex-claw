import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ElInput, ElSelect, ElOption, ElSwitch, ElButton } from 'element-plus';
import { createInitialSnapshot } from '@workspace/core/snapshot';
import type { Automation } from '@workspace/core/contracts';
import AutomationEditor from '../AutomationEditor.vue';

const snapshot = createInitialSnapshot();
const agents = [...snapshot.agents, { ...snapshot.agents[0]!, id: 'quick', name: 'Daily notes', folder: null, sessionKind: 'quickChat' as const }];
function editor(automation?: Automation) {
  return mount(AutomationEditor, { attachTo: document.body,
    props: { mode: automation ? 'edit' : 'create', agents, teams: snapshot.teams, automation },
    global: { components: { ElInput, ElSelect, ElOption, ElSwitch, ElButton } } });
}
async function choose(wrapper: ReturnType<typeof editor>, label: string, option: string) {
  const control = wrapper.get(`[aria-label="${label}"]`);
  await control.trigger('click'); await flushPromises();
  const list = document.getElementById(control.attributes('aria-controls')!);
  const row = [...list!.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(row => row.textContent === option);
  expect(row).toBeDefined(); row!.click(); await flushPromises();
}
describe('AutomationEditor', () => {
  it('defaults to a new Quick Chat and saves one prompt without repository or backlog prerequisites', async () => {
    const wrapper = editor();
    await flushPromises();
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toBeUndefined();
    await wrapper.get('textarea').setValue('  Check my tasks.  ');
    await wrapper.get('[aria-label="Name"]').setValue('Morning');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')?.[0]?.[0]).toStrictEqual({
      name: 'Morning', enabled: true, prompt: 'Check my tasks.',
      target: { kind: 'newQuickChat', teamId: 'team-app', backend: 'codex' }, schedule: { rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    });
    expect(wrapper.findAll('textarea')).toHaveLength(1);
    expect(wrapper.find('[aria-label="Coding agent"]').exists()).toBe(true);
    const sections = wrapper.findAll('.settings-section');
    expect(sections).toHaveLength(4);
    expect(sections[0]!.findAll('strong').map(label => label.text())).toEqual(['Name', 'Prompt']);
    expect(wrapper.findAll('.settings-section h3').map(label => label.text())).toEqual(['Run in', 'Schedule', 'Model']);
    for (const section of wrapper.findAll('.automation-editor__body > *').slice(1)) {
      expect(getComputedStyle(section.element).marginTop).toBe('var(--space-12)');
    }
    expect(sections[1]!.findAll('strong').map(label => label.text())).toEqual(['Team', 'Conversation']);
    expect(wrapper.findAll('[role="combobox"]').slice(0, 2).map(control => control.attributes('aria-label'))).toEqual(['Automation target team', 'Run in']);
    expect(wrapper.text()).not.toContain('repository');
  });

  it('offers existing Quick Chats separately and omits fresh-chat model settings when reusing a conversation', async () => {
    const wrapper = editor();
    await wrapper.get('textarea').setValue('Update notes');
    await choose(wrapper, 'Run in', 'Existing Quick Chat');
    await choose(wrapper, 'Conversation', 'Daily notes');
    expect(wrapper.find('[aria-label="Model"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Coding agent"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Effort"]').exists()).toBe(false);
    expect(wrapper.findAll('.settings-section')).toHaveLength(3);
    expect(wrapper.findAll('.settings-section h3').map(label => label.text())).toEqual(['Run in', 'Schedule']);
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ target: { kind: 'quickChat', agentId: 'quick' } });
    await choose(wrapper, 'Run in', 'Existing agent');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toHaveLength(1);
    await choose(wrapper, 'Conversation', 'Dina @ agent-workspace');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')?.[1]?.[0]).toMatchObject({ target: { kind: 'agent', agentId: 'agent-dina' } });
    await wrapper.setProps({ agents: [] });
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toHaveLength(2);
  });

  it('retains configured model and effort on edit, and surfaces catalog and save errors', async () => {
    const automation: Automation = { id: 'auto', name: 'Check', enabled: true, prompt: 'Check tasks',
      target: { kind: 'newQuickChat', teamId: 'team-app', backend: 'codex', model: 'chosen', reasoningEffort: 'high' },
      schedule: { intervalMinutes: 90 }, executionLog: [], createdAt: '', updatedAt: '' };
    const wrapper = editor(automation);
    await wrapper.setProps({ listModels: vi.fn().mockRejectedValue(new Error('offline')), error: 'Could not save' });
    await flushPromises();
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ target: automation.target, schedule: automation.schedule });
    expect(wrapper.get('[role="alert"]').text()).toBe('Could not save');
    await wrapper.setProps({ saving: true });
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toHaveLength(1);
  });

  it('uses short effort names instead of provider descriptions', async () => {
    const withModels = mount(AutomationEditor, { attachTo: document.body,
      props: { mode: 'create', agents, teams: snapshot.teams, listModels: async () => [{ id: 'model', model: 'model', displayName: 'Model',
        supportedReasoningEfforts: [{ reasoningEffort: 'high', description: 'Greater reasoning depth for complex problems' }] }] },
      global: { components: { ElInput, ElSelect, ElOption, ElSwitch, ElButton } } });
    await flushPromises();
    await choose(withModels, 'Model', 'Model');
    await choose(withModels, 'Reasoning effort', 'high');
    await withModels.get('textarea').setValue('Check tasks');
    await withModels.get('form').trigger('submit');
    expect(withModels.emitted('submit')?.[0]?.[0]).toMatchObject({ target: { model: 'model', reasoningEffort: 'high' } });
  });

  it('initializes the selected conversation team and clears the conversation when changing teams', async () => {
    const automation: Automation = { id: 'auto', name: 'Check', enabled: true, prompt: 'Check tasks',
      target: { kind: 'agent', agentId: 'other-agent' }, schedule: { intervalMinutes: 60 }, executionLog: [], createdAt: '', updatedAt: '' };
    const wrapper = mount(AutomationEditor, { attachTo: document.body,
      props: { mode: 'edit', automation, teams: [...snapshot.teams, { id: 'other-team', name: 'Other team', agentIds: ['other-agent'] }],
        agents: [...agents, { ...agents[0]!, id: 'other-agent', teamId: 'other-team', name: 'Other worker' }] },
      global: { components: { ElInput, ElSelect, ElOption, ElSwitch, ElButton } } });
    await flushPromises();
    expect(wrapper.get('#automation-team').element.closest('.el-select')?.textContent).toContain('Other team');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ target: automation.target });
    await choose(wrapper, 'Automation target team', snapshot.teams[0]!.name);
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toHaveLength(1);
    await choose(wrapper, 'Conversation', 'Dina @ agent-workspace');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')?.[1]?.[0]).toMatchObject({ target: { kind: 'agent', agentId: 'agent-dina' } });
  });
});
