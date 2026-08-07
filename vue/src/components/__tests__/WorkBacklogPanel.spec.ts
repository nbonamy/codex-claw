import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent, WorkItem, WorkRepository } from '@codex-claw/core/contracts';
import { workItemAssignmentKey } from '@codex-claw/core/work-assignments';
import WorkBacklogPanel from '../WorkBacklogPanel.vue';

describe('WorkBacklogPanel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders loading, error, select-repo, and empty issue states', () => {
    expect(mountPanel({ status: 'loading' }).text()).toContain('Loading issues...');
    expect(mountPanel({ error: 'GitHub is down', status: 'error' }).text()).toContain('GitHub is down');
    expect(mountPanel({ selectedRepositoryId: null }).text()).toContain('Select a repository');
    expect(mountPanel({ items: [], selectedRepositoryId: 'nbonamy/codex-claw' }).text()).toContain('No open issues');
  });

  it('uses the shell sidebar background token', () => {
    expect(workBacklogPanelSource()).toContain('background: var(--color-shell-sidebar);');
  });

  it('emits repository selection, refresh, drag start, and drag end', async () => {
    const item = workItem({ assignees: ['nbonamy'] });
    const wrapper = mountPanel({
      items: [item],
      repositories: [workRepository()],
      selectedRepositoryId: 'nbonamy/codex-claw',
    });

    const selects = wrapper.findAllComponents({ name: 'ElSelect' });
    await selects[0]?.vm.$emit('update:modelValue', 'nbonamy/codex-claw');
    await selects[1]?.vm.$emit('update:modelValue', 'nbonamy');
    await selects[2]?.vm.$emit('update:modelValue', 'bug');
    await wrapper.get('[aria-label="Refresh backlog"]').trigger('click');
    wrapper.get('.work-backlog-panel__item').element.dispatchEvent(dragEvent('dragstart'));
    await wrapper.get('.work-backlog-panel__item').trigger('dragend');

    expect(wrapper.emitted('select-repository')).toStrictEqual([['nbonamy/codex-claw']]);
    expect(wrapper.emitted('select-assignee')).toStrictEqual([['nbonamy']]);
    expect(wrapper.emitted('select-tag')).toStrictEqual([['bug']]);
    expect(wrapper.emitted('refresh')).toStrictEqual([['nbonamy/codex-claw']]);
    expect(wrapper.emitted('work-item-drag-start')).toStrictEqual([[item]]);
    expect(wrapper.emitted('work-item-drag-end')).toStrictEqual([[]]);
  });

  it('emits null for non-string repository selections', async () => {
    const wrapper = mountPanel();

    await wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 42);

    expect(wrapper.emitted('select-repository')).toStrictEqual([[null]]);
  });

  it('renders the repository selector as searchable and sorted alphabetically', () => {
    const wrapper = mountPanel({
      items: [],
      repositories: [
        workRepository({ id: 'zeta/api', fullName: 'zeta/api', name: 'api', owner: 'zeta' }),
        workRepository({ id: 'alpha/web', fullName: 'alpha/web', name: 'web', owner: 'alpha' }),
        workRepository({ id: 'alpha/app', fullName: 'alpha/app', name: 'app', owner: 'alpha' }),
      ],
    });

    expect(wrapper.findAllComponents({ name: 'ElSelect' })[0]?.props('filterable')).toBe(true);
    expect(wrapper.findAllComponents({ name: 'ElOption' }).map((option) => option.props('label'))).toStrictEqual([
      'alpha/app',
      'alpha/web',
      'zeta/api',
    ]);
  });

  it('renders the tag selector as searchable, clearable, and sorted alphabetically', () => {
    const wrapper = mountPanel({
      items: [
        workItem({ labels: [{ name: 'zeta' }, { name: 'bug' }] }),
        workItem({ id: 'nbonamy/codex-claw#13', number: 13, title: 'Document filters', labels: [{ name: 'alpha' }, { name: 'bug' }] }),
      ],
      repositories: [],
    });
    const tagSelect = wrapper.findAllComponents({ name: 'ElSelect' })[2];

    expect(tagSelect?.props('filterable')).toBe(true);
    expect(tagSelect?.props('clearable')).toBe(true);
    expect(wrapper.findAllComponents({ name: 'ElOption' }).map((option) => option.props('label'))).toStrictEqual([
      'alpha',
      'bug',
      'zeta',
    ]);
  });

  it('renders a searchable assignee selector with a Me option', () => {
    const wrapper = mountPanel({
      items: [
        workItem({ assignees: ['zara', 'nbonamy'] }),
        workItem({ id: 'nbonamy/codex-claw#13', number: 13, title: 'Document filters', assignees: ['alex'] }),
      ],
    });
    const assigneeSelect = wrapper.findAllComponents({ name: 'ElSelect' })[1];

    expect(assigneeSelect?.props('filterable')).toBe(true);
    expect(assigneeSelect?.props('clearable')).toBe(true);
    expect(wrapper.findAllComponents({ name: 'ElOption' }).map((option) => option.props('label'))).toContain('Me');
    expect(wrapper.findAllComponents({ name: 'ElOption' }).map((option) => option.props('label'))).toContain('alex');
    expect(wrapper.findAllComponents({ name: 'ElOption' }).map((option) => option.props('label'))).toContain('zara');
  });

  it('filters issue cards by selected assignee and tag', () => {
    const wrapper = mountPanel({
      selectedAssigneeLogin: 'alex',
      selectedTagName: 'docs',
      items: [
        workItem({ labels: [{ name: 'docs' }], assignees: ['nbonamy'] }),
        workItem({ id: 'nbonamy/codex-claw#13', number: 13, title: 'Document backlog filters', labels: [{ name: 'docs' }], assignees: ['alex'] }),
        workItem({ id: 'nbonamy/codex-claw#14', number: 14, title: 'Alex bug', labels: [{ name: 'bug' }], assignees: ['alex'] }),
      ],
    });

    expect(wrapper.text()).toContain('Document backlog filters');
    expect(wrapper.text()).not.toContain('Fix cockpit drag target');
    expect(wrapper.text()).not.toContain('Alex bug');
  });

  it('filters issue cards by the selected tag', () => {
    const wrapper = mountPanel({
      selectedTagName: 'docs',
      items: [
        workItem({ labels: [{ name: 'bug' }] }),
        workItem({ id: 'nbonamy/codex-claw#13', number: 13, title: 'Document backlog filters', labels: [{ name: 'docs' }] }),
      ],
    });

    expect(wrapper.text()).toContain('Document backlog filters');
    expect(wrapper.text()).not.toContain('Fix cockpit drag target');
  });

  it('shows an empty filter state when the selected tag has no issues', () => {
    const wrapper = mountPanel({
      selectedTagName: 'docs',
      items: [workItem({ labels: [{ name: 'bug' }] })],
    });

    expect(wrapper.text()).toContain('No issues with these filters');
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
    expect(card.text()).toContain('Working');
    expect(card.text()).not.toContain('bug');

    await card.trigger('click');

    expect(wrapper.emitted('select-assigned-agent')).toStrictEqual([['agent-dina']]);
  });

  it('renders completed assignment state from the backlog mapping', () => {
    const item = workItem();
    const wrapper = mountPanel({
      assignedAgentsByWorkItemKey: {
        [workItemAssignmentKey(item)]: assignedAgent(),
      },
      assignments: {
        [workItemAssignmentKey(item)]: {
          provider: 'github',
          itemId: item.id,
          agentId: 'agent-dina',
          assignedAt: '2026-06-09T13:00:00.000Z',
          status: 'completed',
          completedAt: '2026-06-09T13:30:00.000Z',
        },
      },
      items: [item],
    });

    expect(wrapper.get('.work-backlog-panel__item').classes()).toContain('work-backlog-panel__item--completed');
    expect(wrapper.get('.work-backlog-panel__assignee-status').text()).toBe('Completed');
    expect(wrapper.get('.work-backlog-panel__assignee-status').attributes('data-status')).toBe('completed');
  });

  it('renders assignment status even when the assigned agent no longer exists', async () => {
    const item = workItem();
    const wrapper = mountPanel({
      assignments: {
        [workItemAssignmentKey(item)]: {
          provider: 'github',
          itemId: item.id,
          agentId: 'agent-closed',
          assignedAt: '2026-06-09T13:00:00.000Z',
          status: 'working',
        },
      },
      items: [item],
    });

    const card = wrapper.get('.work-backlog-panel__item');
    expect(card.classes()).toContain('work-backlog-panel__item--assigned');
    expect(card.text()).toContain('Working');
    expect(card.text()).not.toContain('bug');

    await wrapper.get('[aria-label="Issue #12 actions"]').trigger('click');
    await nextTick();

    expect(menuText()).toContain('Reset');

    await clickMenuItem('Reset');

    expect(wrapper.emitted('remove-assignment')).toStrictEqual([[item]]);
    expect(wrapper.emitted('select-assigned-agent')).toBeUndefined();
  });

  it('opens issue actions and routes menu selections', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const wrapper = mountPanel({
      items: [workItem()],
    });

    expect(wrapper.getComponent({ name: 'ElPopover' }).props('popperClass')).toBe('claw-popover work-backlog-panel__menu-popover');

    await wrapper.get('[aria-label="Issue #12 actions"]').trigger('click');
    await nextTick();

    expect(menuText()).toContain('Assign to New Agent');
    expect(menuText()).toContain('Assign to Bench Agent');
    expect(menuText()).not.toContain('Remove Assignment');
    expect(menuText()).not.toContain('Reset');
    expect(menuText()).toContain('View on GitHub');
    expect(menuTextIndex('Assign to New Agent')).toBeLessThan(menuTextIndex('Assign to Bench Agent'));
    expect(menuTextIndex('Assign to Bench Agent')).toBeLessThan(menuTextIndex('View on GitHub'));

    await clickMenuItem('Assign to New Agent');
    await wrapper.get('[aria-label="Issue #12 actions"]').trigger('click');
    await clickMenuItem('Assign to Bench Agent');
    await wrapper.get('[aria-label="Issue #12 actions"]').trigger('click');
    await clickMenuItem('View on GitHub');

    expect(wrapper.emitted('assign-to-new-agent')).toStrictEqual([[workItem()]]);
    expect(wrapper.emitted('assign-to-bench-agent')).toStrictEqual([[workItem()]]);
    expect(open).toHaveBeenCalledWith('https://github.com/nbonamy/codex-claw/issues/12', '_blank', 'noreferrer');
  });

  it('opens issue actions from the work item context menu', async () => {
    const item = workItem();
    const wrapper = mountPanel({
      items: [item],
    });

    await wrapper.get('.work-backlog-panel__item').trigger('contextmenu');
    await nextTick();

    expect(menuText()).toContain('Assign to New Agent');
    expect(menuText()).toContain('Assign to Bench Agent');

    await clickMenuItem('Assign to New Agent');

    expect(wrapper.emitted('assign-to-new-agent')).toStrictEqual([[item]]);
  });

  it('routes reset from assigned issue actions as a danger action', async () => {
    const item = workItem();
    const wrapper = mountPanel({
      assignedAgentsByWorkItemKey: {
        [workItemAssignmentKey(item)]: assignedAgent(),
      },
      items: [item],
    });

    await wrapper.get('[aria-label="Issue #12 actions"]').trigger('click');
    await nextTick();

    expect(menuText()).toContain('Reset');
    expect(document.body.querySelector('.app-menu__item--danger')?.textContent).toContain('Reset');
    expect(menuTextIndex('Assign to New Agent')).toBeLessThan(menuTextIndex('Assign to Bench Agent'));
    expect(menuTextIndex('Assign to Bench Agent')).toBeLessThan(menuTextIndex('View on GitHub'));
    expect(menuTextIndex('View on GitHub')).toBeLessThan(menuTextIndex('Reset'));

    await clickMenuItem('Reset');

    expect(wrapper.emitted('remove-assignment')).toStrictEqual([[item]]);
    expect(wrapper.emitted('select-assigned-agent')).toBeUndefined();
  });

  it('disables Bench assignment when there are no Bench agents', async () => {
    const wrapper = mountPanel({
      canAssignToBench: false,
      items: [workItem()],
    });

    await wrapper.get('[aria-label="Issue #12 actions"]').trigger('click');
    await clickMenuItem('Assign to Bench Agent');

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

function menuText(): string {
  return document.body.textContent ?? '';
}

function menuTextIndex(label: string): number {
  return menuText().indexOf(label);
}

async function clickMenuItem(label: string): Promise<void> {
  const item = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .find((element) => {
      const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      return text === label || text.startsWith(`${label} `);
    });
  expect(item).toBeTruthy();
  item?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await nextTick();
}

function workRepository(overrides: Partial<WorkRepository> = {}): WorkRepository {
  return {
    provider: 'github',
    id: 'nbonamy/codex-claw',
    owner: 'nbonamy',
    name: 'codex-claw',
    fullName: 'nbonamy/codex-claw',
    url: 'https://github.com/nbonamy/codex-claw',
    isPrivate: true,
    ...overrides,
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

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
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
    ...overrides,
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

function workBacklogPanelSource(): string {
  return readFileSync(resolve(process.cwd(), 'src/components/WorkBacklogPanel.vue'), 'utf8');
}
