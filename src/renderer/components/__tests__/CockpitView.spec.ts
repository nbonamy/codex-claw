import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import { createInitialSnapshot } from '../../../shared/snapshot';
import CockpitView from '../CockpitView.vue';

describe('CockpitView', () => {
  it('renders team sections, agents, summaries, and per-team add cards', () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-empty',
      name: 'Empty Team',
      color: '#7C3AED',
      agentIds: [],
    });
    snapshot.agents[0].status = { type: 'working' };
    snapshot.agents[0].statusText = 'Running tests';
    snapshot.agents[1].status = { type: 'idle' };

    const wrapper = mountCockpit(snapshot);

    expect(wrapper.text()).toContain('Cockpit');
    expect(wrapper.text()).not.toContain('Command Center');
    expect(wrapper.text()).toContain('Codex Claw');
    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.text()).toContain('Jesse');
    expect(wrapper.text()).toContain('1 Working');
    expect(wrapper.text()).toContain('1 Idle');
    expect(wrapper.text()).toContain('Empty Team');
    expect(wrapper.text()).toContain('No agents');
    expect(wrapper.findAll('.cockpit-view__add-card')).toHaveLength(2);
  });

  it('emits navigation and add-agent intents with team context', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mountCockpit(snapshot);

    await wrapper.get('.cockpit-view__team-title').trigger('click');
    await wrapper.get('.cockpit-view__agent-card').trigger('click');
    await wrapper.get('.cockpit-view__add-card .new-agent-button__primary').trigger('click');

    expect(wrapper.emitted('select-team')).toStrictEqual([['team-codex-claw']]);
    expect(wrapper.emitted('select-agent')).toStrictEqual([[{
      agentId: 'agent-dina',
      teamId: 'team-codex-claw',
    }]]);
    expect(wrapper.emitted('add-agent')).toStrictEqual([['team-codex-claw']]);
  });

  it('shows the add tile when the final row has space', () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mountCockpit(snapshot);

    expect(wrapper.find('.cockpit-view__add-card').exists()).toBe(true);
    expect(wrapper.find('.cockpit-view__header-add').exists()).toBe(false);
  });

  it('moves the add action to the team header when the final row is full', () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams[0].agentIds.push('agent-abby');
    snapshot.agents.push({
      id: 'agent-abby',
      teamId: 'team-codex-claw',
      name: 'Abby',
      avatar: 'AB',
      folder: '/Users/nbonamy/src/skwad',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: '2026-06-05T09:00:00.000Z',
      updatedAt: '2026-06-05T12:00:00.000Z',
    });
    const wrapper = mountCockpit(snapshot);

    expect(wrapper.find('.cockpit-view__add-card').exists()).toBe(false);
    expect(wrapper.find('.cockpit-view__header-add').exists()).toBe(true);
  });

  it('emits add-agent from the header button when the final row is full', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams[0].agentIds.push('agent-abby');
    snapshot.agents.push({
      id: 'agent-abby',
      teamId: 'team-codex-claw',
      name: 'Abby',
      avatar: 'AB',
      folder: '/Users/nbonamy/src/skwad',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: '2026-06-05T09:00:00.000Z',
      updatedAt: '2026-06-05T12:00:00.000Z',
    });
    const wrapper = mountCockpit(snapshot);

    await wrapper.get('.cockpit-view__header-add .new-agent-button__primary').trigger('click');

    expect(wrapper.emitted('add-agent')).toStrictEqual([['team-codex-claw']]);
  });

  it('sends prompts for idle agents and clears the draft', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'idle' };
    const wrapper = mountCockpit(snapshot);

    const input = wrapper.get<HTMLInputElement>('[aria-label="Prompt Dina"]');
    await input.setValue('  inspect this  ');
    await wrapper.get('.cockpit-view__prompt').trigger('submit');

    expect(wrapper.emitted('prompt-agent')).toStrictEqual([[{
      agentId: 'agent-dina',
      prompt: 'inspect this',
    }]]);
    expect(input.element.value).toBe('');
  });

  it('disables prompt entry for busy agents', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'working' };
    const wrapper = mountCockpit(snapshot);

    expect(wrapper.get<HTMLInputElement>('[aria-label="Prompt Dina"]').element.disabled).toBe(true);
    expect(wrapper.get<HTMLButtonElement>('[aria-label="Send prompt to Dina"]').element.disabled).toBe(true);
  });

  it('keeps the Bench dropdown in add controls and deploys templates into that team', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.bench.push({
      id: 'bench-dina',
      name: 'Dina',
      avatar: 'DI',
      folder: '/Users/nbonamy/src/id8',
      backend: 'codex',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });
    const wrapper = mountCockpit(snapshot);

    await wrapper.get('.cockpit-view__add-card [aria-label="Open Bench"]').trigger('click');
    await wrapper.findAll('.new-agent-menu__template').find((row) => row.text().includes('Dina'))?.trigger('click');

    expect(wrapper.emitted('deploy-bench-template')).toStrictEqual([[{
      templateId: 'bench-dina',
      teamId: 'team-codex-claw',
    }]]);
  });
});

function mountCockpit(snapshot: ReturnType<typeof createInitialSnapshot>) {
  return mount(CockpitView, {
    props: {
      agents: snapshot.agents,
      bench: snapshot.bench,
      teams: snapshot.teams,
    },
    global: {
      plugins: [ElementPlus],
    },
  });
}
