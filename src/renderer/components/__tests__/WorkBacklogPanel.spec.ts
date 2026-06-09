import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent, WorkItem, WorkRepository } from '../../../shared/contracts';
import { workItemAssignmentKey } from '../../../shared/work-assignments';
import WorkBacklogPanel from '../WorkBacklogPanel.vue';

describe('WorkBacklogPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading, error, select-repo, and empty issue states', () => {
    expect(mountPanel({ status: 'loading' }).text()).toContain('Loading issues...');
    expect(mountPanel({ error: 'GitHub is down', status: 'error' }).text()).toContain('GitHub is down');
    expect(mountPanel({ selectedRepositoryId: null }).text()).toContain('Select a repository');
    expect(mountPanel({ items: [], selectedRepositoryId: 'nbonamy/codex-claw' }).text()).toContain('No open issues');
  });

  it('emits repository selection, refresh, drag start, and drag end', async () => {
    const item = workItem();
    const wrapper = mountPanel({
      items: [item],
      repositories: [workRepository()],
      selectedRepositoryId: 'nbonamy/codex-claw',
    });

    await wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'nbonamy/codex-claw');
    await wrapper.get('[aria-label="Refresh backlog"]').trigger('click');
    wrapper.get('.work-backlog-panel__item').element.dispatchEvent(dragEvent('dragstart'));
    await wrapper.get('.work-backlog-panel__item').trigger('dragend');

    expect(wrapper.emitted('select-repository')).toStrictEqual([['nbonamy/codex-claw']]);
    expect(wrapper.emitted('refresh')).toStrictEqual([['nbonamy/codex-claw']]);
    expect(wrapper.emitted('work-item-drag-start')).toStrictEqual([[item]]);
    expect(wrapper.emitted('work-item-drag-end')).toStrictEqual([[]]);
  });

  it('emits null for non-string repository selections', async () => {
    const wrapper = mountPanel();

    await wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 42);

    expect(wrapper.emitted('select-repository')).toStrictEqual([[null]]);
  });

  it('does not repeat the selected repository name on issue cards', () => {
    const wrapper = mountPanel({
      items: [workItem()],
      repositories: [workRepository()],
      selectedRepositoryId: 'nbonamy/codex-claw',
    });

    const card = wrapper.get('.work-backlog-panel__item');
    expect(card.text()).toContain('#12');
    expect(card.text()).toContain('Fix cockpit drag target');
    expect(card.text()).toContain('bug');
    expect(card.text()).not.toContain('nbonamy/codex-claw');
  });

  it('renders assigned agent context instead of labels and opens the assigned agent on click', async () => {
    const item = workItem();
    const wrapper = mountPanel({
      assignedAgentsByWorkItemKey: {
        [workItemAssignmentKey(item)]: assignedAgent(),
      },
      items: [item],
    });

    const card = wrapper.get('.work-backlog-panel__item');
    expect(card.text()).toContain('Dina');
    expect(card.text()).toContain('Idle');
    expect(card.text()).not.toContain('bug');

    await card.trigger('click');

    expect(wrapper.emitted('select-assigned-agent')).toStrictEqual([['agent-dina']]);
  });

  it('opens issue actions and routes menu selections', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const wrapper = mountPanel({
      items: [workItem()],
    });

    await wrapper.get('[aria-label="Issue #12 actions"]').trigger('click');

    expect(wrapper.text()).toContain('Assign to New Agent');
    expect(wrapper.text()).toContain('Assign to Bench Agent');
    expect(wrapper.text()).not.toContain('Remove Assignment');
    expect(wrapper.text()).toContain('Open');

    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Assign to New Agent')?.trigger('click');
    await wrapper.get('[aria-label="Issue #12 actions"]').trigger('click');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Assign to Bench Agent')?.trigger('click');
    await wrapper.get('[aria-label="Issue #12 actions"]').trigger('click');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Open')?.trigger('click');

    expect(wrapper.emitted('assign-to-new-agent')).toStrictEqual([[workItem()]]);
    expect(wrapper.emitted('assign-to-bench-agent')).toStrictEqual([[workItem()]]);
    expect(open).toHaveBeenCalledWith('https://github.com/nbonamy/codex-claw/issues/12', '_blank', 'noreferrer');
  });

  it('routes remove assignment from assigned issue actions', async () => {
    const item = workItem();
    const wrapper = mountPanel({
      assignedAgentsByWorkItemKey: {
        [workItemAssignmentKey(item)]: assignedAgent(),
      },
      items: [item],
    });

    await wrapper.get('[aria-label="Issue #12 actions"]').trigger('click');

    expect(wrapper.text()).toContain('Remove Assignment');

    await wrapper.findAll('[role="menuitem"]').find((menuItem) => menuItem.text() === 'Remove Assignment')?.trigger('click');

    expect(wrapper.emitted('remove-assignment')).toStrictEqual([[item]]);
    expect(wrapper.emitted('select-assigned-agent')).toBeUndefined();
  });

  it('disables Bench assignment when there are no Bench agents', async () => {
    const wrapper = mountPanel({
      canAssignToBench: false,
      items: [workItem()],
    });

    await wrapper.get('[aria-label="Issue #12 actions"]').trigger('click');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Assign to Bench Agent')?.trigger('click');

    expect(wrapper.emitted('assign-to-bench-agent')).toBeUndefined();
  });
});

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(WorkBacklogPanel, {
    props: {
      connection: {
        provider: 'github',
        status: 'connected',
        accountLabel: 'nbonamy',
      },
      error: null,
      items: [workItem()],
      repositories: [workRepository()],
      selectedRepositoryId: 'nbonamy/codex-claw',
      status: 'loaded',
      ...props,
    },
    global: {
      plugins: [ElementPlus],
    },
  });
}

function workRepository(): WorkRepository {
  return {
    provider: 'github',
    id: 'nbonamy/codex-claw',
    owner: 'nbonamy',
    name: 'codex-claw',
    fullName: 'nbonamy/codex-claw',
    url: 'https://github.com/nbonamy/codex-claw',
    isPrivate: true,
  };
}

function assignedAgent(): Agent {
  return {
    id: 'agent-dina',
    teamId: 'team-codex-claw',
    name: 'Dina',
    avatar: 'DI',
    folder: '/Users/nbonamy/src/codex-claw',
    backend: 'codex',
    backendDefaults: { kind: 'codex' },
    status: { type: 'idle' },
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-09T13:00:00.000Z',
  };
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
    labels: [{ name: 'bug' }],
    createdAt: '2026-06-09T12:00:00.000Z',
    updatedAt: '2026-06-09T12:30:00.000Z',
  };
}

function dragEvent(type: string): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      setData: vi.fn(),
      setDragImage: vi.fn(),
    },
  });
  return event;
}
