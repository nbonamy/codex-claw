import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot-construction';
import { createMission, updateMission, type UpdateMissionInput } from '@codex-claw/core/missions';
import MissionWorkspace from '../MissionWorkspace.vue';

async function setup() {
  const snapshot = createInitialSnapshot();
  const mission = createMission(snapshot, { outcome: 'Add billing', workflowType: 'shapeAndShipFeature' });
  const save = vi.fn(async (input: UpdateMissionInput) => {
    updateMission(snapshot, input);
    await wrapper.setProps({ mission: structuredClone(mission) });
  });
  const wrapper = mount(MissionWorkspace, { props: { mission: structuredClone(mission), agents: snapshot.agents, updateMission: save }, global: { plugins: [ElementPlus] } });
  await flushPromises();
  const click = async (label: string) => { if (label === 'Save draft') await wrapper.get('form').trigger('submit'); else await wrapper.findAll('button').find(b => b.text() === label)!.trigger('click'); await flushPromises(); };
  return { wrapper, click, mission, save };
}
describe('MissionWorkspace', () => {
  it('saves requirements, moves to ticket planning and shows persistent workflow progress', async () => {
    const { wrapper, click, save } = await setup();
    await wrapper.setProps({ sidebarCollapsed: true });
    await click('Show mission navigation');
    expect(wrapper.emitted('expand-sidebar')).toStrictEqual([[]]);
    expect(wrapper.findAll('li')).toHaveLength(4);
    expect(wrapper.get('[aria-current="step"]').text()).toContain('Requirements');
    expect(wrapper.findAll('button').find(b => b.text() === 'Approve and continue')!.attributes('disabled')).toBeDefined();
    await wrapper.get('#mission-problem').setValue('Team checkout');
    await wrapper.get('#mission-acceptance').setValue('Owner can pay');
    await click('Save draft');
    expect(save.mock.lastCall?.[0]).toMatchObject({ action: 'save', artifacts: { requirements: { problem: 'Team checkout', acceptance: 'Owner can pay' } } });
    await click('Approve and continue');
    expect(wrapper.get('[aria-current="step"]').text()).toContain('Tickets');
    expect(wrapper.find('#mission-problem').exists()).toBe(false);
    await click('Add ticket');
    await wrapper.get('[aria-label="Ticket 1"]').setValue('Implement owner checkout');
    await click('Approve and continue');
    expect(wrapper.get('[aria-current="step"]').text()).toContain('Implementation');
    expect(wrapper.text()).toContain('Implement owner checkout');
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get('#mission-changes').setValue('checkout.ts; diff abc');
    await wrapper.get('#mission-tests').setValue('Checkout integration passes');
    await click('Approve and continue');
    await wrapper.get('#mission-review').setValue('Acceptance verified');
    await click('Complete mission');
    expect(wrapper.text()).toContain('Completed');
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined();
  });
  it('retains edits on a save failure and requires reload after a concurrent edit', async () => {
    const { wrapper, click, mission } = await setup();
    await wrapper.setProps({ updateMission: vi.fn().mockRejectedValue(new Error('Disk unavailable')) });
    await wrapper.get('#mission-problem').setValue('Keep this draft');
    await click('Save draft');
    expect(wrapper.get('[role="alert"]').text()).toBe('Disk unavailable');
    expect((wrapper.get('#mission-problem').element as HTMLTextAreaElement).value).toBe('Keep this draft');
    await wrapper.setProps({ mission: { ...structuredClone(mission), revision: 1 } });
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined();
    await click('Reload mission');
    expect((wrapper.get('#mission-problem').element as HTMLTextAreaElement).value).toBe('');
  });
  it('saves the stage agent association before opening its supporting conversation', async () => {
    const { wrapper, click, save } = await setup();
    await wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'agent-dina');
    await click('Open conversation');
    expect(save.mock.lastCall?.[0].stageAgentIds).toStrictEqual({ requirements: 'agent-dina' });
    expect(wrapper.emitted('open-conversation')).toStrictEqual([['agent-dina']]);
  });
});

it('refreshes accepted execution artifacts without a false edit conflict and keeps the run conversation local to the workflow', async () => {
  const { wrapper, mission, click } = await setup();
  const execute = vi.fn().mockResolvedValue(undefined);
  mission.execution = { teamId: 'team', repoPath: '/repo', memberIds: ['agent-dina'], runs: [] };
  mission.revision++;
  await wrapper.setProps({ mission: structuredClone(mission), executeMission: execute });
  for (const stage of ['requirements', 'tickets', 'implementation', 'review'] as const) {
    mission.stage = stage;
    mission.artifacts.requirements = { problem: 'Owners need billing', acceptance: 'Owner can pay' };
    mission.artifacts.tickets = [{ title: 'Owner checkout', done: true, reference: 'https://example.com/issue/1' }];
    mission.artifacts.implementation = { changes: 'owner.ts changed', tests: 'Owner test passed' };
    mission.artifacts.review = { summary: 'All acceptance checked', pullRequestUrl: '' };
    mission.stageAgentIds[stage] = 'agent-dina';
    mission.execution.runs = [{ id: `run-${stage}`, stage, memberId: 'agent-dina', workerId: 'agent-dina', status: 'accepted', skills: [], feedback: '', startedAt: 'now' }];
    mission.revision++;
    await wrapper.setProps({ mission: structuredClone(mission) });
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('[aria-label="Accepted artifact"]').text()).toContain(stage === 'requirements' ? 'Owners need billing' : stage === 'tickets' ? 'Owner checkout' : stage === 'implementation' ? 'Owner test passed' : 'All acceptance checked');
    await click('Open conversation');
    expect(wrapper.emitted('open-conversation')!.at(-1)).toEqual(['agent-dina']);
    expect(wrapper.text()).not.toContain('Unsaved changes');
  }
});
