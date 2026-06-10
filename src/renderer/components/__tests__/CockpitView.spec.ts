import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '../../../shared/snapshot';
import type { WorkItem } from '../../../shared/contracts';
import { workItemAssignmentKey } from '../../../shared/work-assignments';
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

  it('opens agent actions from cockpit card right click', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mountCockpit(snapshot);

    await wrapper.get('.cockpit-view__agent-card').trigger('contextmenu', {
      clientX: 42,
      clientY: 84,
    });

    const menu = wrapper.get('.agent-context-menu');
    expect(menu.attributes('style')).toContain('left: 42px');
    expect(menu.attributes('style')).toContain('top: 84px');
    expect(wrapper.text()).toContain('Edit Agent');

    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Duplicate Agent')?.trigger('click');

    expect(wrapper.emitted('duplicate-agent')).toStrictEqual([['agent-dina']]);
    expect(wrapper.find('.agent-context-menu').exists()).toBe(false);
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

  it('ignores blank cockpit prompt submissions and supports missing Bench prop', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(CockpitView, {
      props: {
        agents: snapshot.agents,
        teams: snapshot.teams,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    await wrapper.get('.cockpit-view__prompt').trigger('submit');

    expect(wrapper.text()).toContain('Cockpit');
    expect(wrapper.emitted('prompt-agent')).toBeUndefined();
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

  it('renders connected backlog issues and forwards repository actions', async () => {
    const snapshot = createInitialSnapshot();
    const item = workItem();
    const wrapper = mountCockpit(snapshot, {
      workBacklog: {
        assignments: {},
        connection: {
          provider: 'github',
          status: 'connected',
          accountLabel: 'nbonamy',
        },
        repositories: [{
          provider: 'github',
          id: 'nbonamy/codex-claw',
          owner: 'nbonamy',
          name: 'codex-claw',
          fullName: 'nbonamy/codex-claw',
          url: 'https://github.com/nbonamy/codex-claw',
          isPrivate: true,
        }],
        selectedRepositoryId: 'nbonamy/codex-claw',
        items: [item],
        status: 'loaded',
        error: null,
      },
    });

    expect(wrapper.text()).toContain('Backlog');
    expect(wrapper.text()).toContain('Fix cockpit drag target');

    await wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'nbonamy/codex-claw');
    await wrapper.get('[aria-label="Refresh backlog"]').trigger('click');

    expect(wrapper.emitted('select-work-repository')).toStrictEqual([['nbonamy/codex-claw']]);
    expect(wrapper.emitted('refresh-work-items')).toStrictEqual([['nbonamy/codex-claw']]);
  });

  it('opens assigned agents from backlog items', async () => {
    const snapshot = createInitialSnapshot();
    const item = workItem();
    snapshot.workBacklog.assignments = {
      [workItemAssignmentKey(item)]: {
        provider: item.provider,
        itemId: item.id,
        agentId: 'agent-dina',
        assignedAt: '2026-06-09T13:00:00.000Z',
        status: 'working',
      },
    };
    const wrapper = mountCockpit(snapshot, {
      workBacklog: {
        assignments: snapshot.workBacklog.assignments,
        connection: {
          provider: 'github',
          status: 'connected',
          accountLabel: 'nbonamy',
        },
        repositories: [],
        selectedRepositoryId: 'nbonamy/codex-claw',
        items: [item],
        status: 'loaded',
        error: null,
      },
    });

    await wrapper.get('.work-backlog-panel__item').trigger('click');

    expect(wrapper.emitted('select-agent')).toStrictEqual([[{
      agentId: 'agent-dina',
      teamId: 'team-codex-claw',
    }]]);
  });

  it('forwards backlog menu assignment intents', () => {
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
    const item = workItem();
    const wrapper = mountCockpit(snapshot, {
      workBacklog: {
        assignments: {},
        connection: {
          provider: 'github',
          status: 'connected',
          accountLabel: 'nbonamy',
        },
        repositories: [],
        selectedRepositoryId: 'nbonamy/codex-claw',
        items: [item],
        status: 'loaded',
        error: null,
      },
    });

    wrapper.findComponent({ name: 'WorkBacklogPanel' }).vm.$emit('assign-to-new-agent', item);
    wrapper.findComponent({ name: 'WorkBacklogPanel' }).vm.$emit('assign-to-bench-agent', item);
    wrapper.findComponent({ name: 'WorkBacklogPanel' }).vm.$emit('remove-assignment', item);

    expect(wrapper.emitted('assign-work-item-to-new-agent')).toStrictEqual([[{ item }]]);
    expect(wrapper.emitted('assign-work-item-to-bench-agent')).toStrictEqual([[{ item }]]);
    expect(wrapper.emitted('remove-work-item-assignment')).toStrictEqual([[item]]);
  });

  it('turns the add tile into split assignment targets while dragging work items', async () => {
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
    const item = workItem();
    const wrapper = mountCockpit(snapshot, {
      workBacklog: {
        assignments: {},
        connection: {
          provider: 'github',
          status: 'connected',
          accountLabel: 'nbonamy',
        },
        repositories: [],
        selectedRepositoryId: 'nbonamy/codex-claw',
        items: [item],
        status: 'loaded',
        error: null,
      },
    });

    wrapper.get('.work-backlog-panel__item').element.dispatchEvent(dragEvent('dragstart'));
    await nextTick();

    const dragEnter = dragEvent('dragenter');
    wrapper.get('.cockpit-view__add-card').element.dispatchEvent(dragEnter);
    await nextTick();

    expect(dragEnter.defaultPrevented).toBe(true);
    expect(wrapper.get('.cockpit-view__add-card').text()).toContain('Assign to New Agent');
    expect(wrapper.get('.cockpit-view__add-card').text()).toContain('Assign to Bench Agent');
    expect(wrapper.find('.cockpit-view__add-drop-target--active').exists()).toBe(false);

    const newAgentTarget = wrapper.get('[aria-label="Assign issue to a new agent in Codex Claw"]');
    newAgentTarget.element.dispatchEvent(dragEvent('dragover'));
    await nextTick();
    expect(newAgentTarget.classes()).toContain('cockpit-view__add-drop-target--active');
    expect(wrapper.get('[aria-label="Assign issue to a Bench agent in Codex Claw"]').classes()).not.toContain('cockpit-view__add-drop-target--active');

    newAgentTarget.element.dispatchEvent(dragEvent('drop'));
    await nextTick();

    expect(wrapper.emitted('assign-work-item-to-new-agent')).toStrictEqual([[{
      item,
      teamId: 'team-codex-claw',
    }]]);
    expect(wrapper.get('.cockpit-view__add-card').text()).toContain('Add Agent');

    wrapper.get('.work-backlog-panel__item').element.dispatchEvent(dragEvent('dragstart'));
    await nextTick();
    wrapper.get('.cockpit-view__add-card').element.dispatchEvent(dragEvent('dragenter'));
    await nextTick();
    wrapper.get('[aria-label="Assign issue to a Bench agent in Codex Claw"]').element.dispatchEvent(dragEvent('drop'));
    await nextTick();

    expect(wrapper.emitted('assign-work-item-to-bench-agent')).toStrictEqual([[{
      item,
      teamId: 'team-codex-claw',
    }]]);
  });

  it('assigns a dragged work item to an idle agent without selecting the card', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'idle' };
    const item = workItem();
    const wrapper = mountCockpit(snapshot, {
      workBacklog: {
        assignments: {},
        connection: {
          provider: 'github',
          status: 'connected',
          accountLabel: 'nbonamy',
        },
        repositories: [],
        selectedRepositoryId: 'nbonamy/codex-claw',
        items: [item],
        status: 'loaded',
        error: null,
      },
    });

    wrapper.get('.work-backlog-panel__item').element.dispatchEvent(dragEvent('dragstart'));
    await nextTick();
    wrapper.get('.cockpit-view__agent-card').element.dispatchEvent(dragEvent('drop'));
    await nextTick();

    expect(wrapper.emitted('assign-work-item')).toStrictEqual([[{
      agentId: 'agent-dina',
      item,
    }]]);
    expect(wrapper.emitted('select-agent')).toBeUndefined();
  });

  it('does not assign dropped work items to busy agents', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'working' };
    const wrapper = mountCockpit(snapshot, {
      workBacklog: {
        assignments: {},
        connection: {
          provider: 'github',
          status: 'connected',
        },
        repositories: [],
        selectedRepositoryId: 'nbonamy/codex-claw',
        items: [workItem()],
        status: 'loaded',
        error: null,
      },
    });

    wrapper.get('.work-backlog-panel__item').element.dispatchEvent(dragEvent('dragstart'));
    await nextTick();
    wrapper.get('.cockpit-view__agent-card').element.dispatchEvent(dragEvent('drop'));
    await nextTick();

    expect(wrapper.emitted('assign-work-item')).toBeUndefined();
  });

  it('shows and clears the agent drop target while dragging work items', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'idle' };
    const wrapper = mountCockpit(snapshot, {
      workBacklog: {
        assignments: {},
        connection: {
          provider: 'github',
          status: 'connected',
        },
        repositories: [],
        selectedRepositoryId: 'nbonamy/codex-claw',
        items: [workItem()],
        status: 'loaded',
        error: null,
      },
    });

    const card = wrapper.get('.cockpit-view__agent-card');
    const ignoredDragOver = dragEvent('dragover');
    card.element.dispatchEvent(ignoredDragOver);
    await nextTick();
    expect(ignoredDragOver.defaultPrevented).toBe(false);

    wrapper.get('.work-backlog-panel__item').element.dispatchEvent(dragEvent('dragstart'));
    await nextTick();

    const dragEnter = dragEvent('dragenter');
    card.element.dispatchEvent(dragEnter);
    await nextTick();
    expect(dragEnter.defaultPrevented).toBe(true);
    expect(card.classes()).toContain('cockpit-view__agent-card--drop-target');

    const dragOver = dragEvent('dragover');
    card.element.dispatchEvent(dragOver);
    expect(dragOver.defaultPrevented).toBe(true);
    expect(dragOver.dataTransfer?.dropEffect).toBe('copy');

    const cardChild = document.createElement('div');
    card.element.appendChild(cardChild);
    card.element.dispatchEvent(dragEvent('dragleave', { relatedTarget: cardChild }));
    await nextTick();
    expect(card.classes()).toContain('cockpit-view__agent-card--drop-target');

    card.element.dispatchEvent(dragEvent('dragleave'));
    await nextTick();
    expect(card.classes()).not.toContain('cockpit-view__agent-card--drop-target');

    card.element.dispatchEvent(dragEvent('dragenter'));
    await nextTick();
    wrapper.findAll('.cockpit-view__agent-card')[1].element.dispatchEvent(dragEvent('dragleave'));
    await nextTick();
    expect(card.classes()).toContain('cockpit-view__agent-card--drop-target');
  });

  it('observes cockpit grids and tolerates drag events without dataTransfer', async () => {
    const callbacks: ResizeObserverCallback[] = [];
    class FakeResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();

      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback);
      }
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'idle' };
    snapshot.agents[1].status = { type: 'working' };
    const wrapper = mountCockpit(snapshot, {
      workBacklog: {
        assignments: {},
        connection: {
          provider: 'github',
          status: 'connected',
        },
        repositories: [],
        selectedRepositoryId: 'nbonamy/codex-claw',
        items: [workItem()],
        status: 'loaded',
        error: null,
      },
    });

    expect(callbacks.length).toBeGreaterThan(0);
    callbacks.at(-1)?.([
      { target: wrapper.get('.cockpit-view__grid').element } as unknown as ResizeObserverEntry,
      { target: document.createElement('div') } as unknown as ResizeObserverEntry,
    ], {} as ResizeObserver);

    const card = wrapper.get('.cockpit-view__agent-card');
    wrapper.get('.work-backlog-panel__item').element.dispatchEvent(dragEvent('dragstart'));
    await nextTick();

    const dragOver = new Event('dragover', { bubbles: true, cancelable: true }) as DragEvent;
    card.element.dispatchEvent(dragOver);
    expect(dragOver.defaultPrevented).toBe(true);

    const ignoredDragEnter = dragEvent('dragenter');
    await wrapper.findAll('.cockpit-view__agent-card')[1].element.dispatchEvent(ignoredDragEnter);
    expect(wrapper.findAll('.cockpit-view__agent-card')[1].classes()).not.toContain('cockpit-view__agent-card--drop-target');
  });
});

function mountCockpit(snapshot: ReturnType<typeof createInitialSnapshot>, props: Record<string, unknown> = {}) {
  return mount(CockpitView, {
    props: {
      agents: snapshot.agents,
      bench: snapshot.bench,
      teams: snapshot.teams,
      ...props,
    },
    global: {
      plugins: [ElementPlus],
    },
  });
}

function workItem(): WorkItem {
  return {
    provider: 'github',
    id: 'nbonamy/codex-claw#12',
    repositoryId: 'nbonamy/codex-claw',
    repositoryFullName: 'nbonamy/codex-claw',
    number: 12,
    title: 'Fix cockpit drag target',
    url: 'https://github.com/nbonamy/codex-claw/issues/12',
    state: 'open',
    authorName: 'nbonamy',
    body: 'Make issue assignment feel obvious.',
    labels: [{ name: 'bug', color: 'ff0000' }],
    createdAt: '2026-06-09T12:00:00.000Z',
    updatedAt: '2026-06-09T12:30:00.000Z',
  };
}

function dragEvent(type: string, options: { relatedTarget?: EventTarget | null } = {}): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      dropEffect: 'copy',
      setData: vi.fn(),
      setDragImage: vi.fn(),
    },
  });
  if ('relatedTarget' in options) {
    Object.defineProperty(event, 'relatedTarget', {
      value: options.relatedTarget,
    });
  }
  return event;
}
