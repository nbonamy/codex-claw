import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { BenchTemplate, WorkItem } from '../../../shared/contracts';
import CockpitAddAgentTile from '../CockpitAddAgentTile.vue';

type CockpitAddAgentTileProps = {
  bench: BenchTemplate[];
  draggedWorkItem: WorkItem | null;
  teamId: string;
  teamName: string;
};

describe('CockpitAddAgentTile', () => {
  it('emits new-agent from the normal add control', async () => {
    const wrapper = mountTile();

    await wrapper.get('.new-agent-button__primary').trigger('click');

    expect(wrapper.emitted('new-agent')).toStrictEqual([['team-codex-claw']]);
  });

  it('shows split assignment targets while a work item is dragged over the tile', async () => {
    const item = workItem();
    const wrapper = mountTile({
      bench: [benchTemplate()],
      draggedWorkItem: item,
    });

    const dragEnter = dragEvent('dragenter');
    wrapper.get('.cockpit-view__add-card').element.dispatchEvent(dragEnter);
    await nextTick();

    expect(dragEnter.defaultPrevented).toBe(true);
    expect(wrapper.text()).toContain('Assign to New Agent');
    expect(wrapper.text()).toContain('Assign to Bench Agent');
    expect(wrapper.find('.cockpit-view__add-drop-target--active').exists()).toBe(false);

    const newAgentTarget = wrapper.get('[aria-label="Assign issue to a new agent in Codex Claw"]');
    newAgentTarget.element.dispatchEvent(dragEvent('dragover'));
    await nextTick();
    expect(newAgentTarget.classes()).toContain('cockpit-view__add-drop-target--active');
    expect(wrapper.get('[aria-label="Assign issue to a Bench agent in Codex Claw"]').classes()).not.toContain('cockpit-view__add-drop-target--active');

    newAgentTarget.element.dispatchEvent(dragEvent('drop'));
    await nextTick();

    expect(wrapper.emitted('assign-to-new-agent')).toStrictEqual([[{
      item,
      teamId: 'team-codex-claw',
    }]]);
  });

  it('emits bench assignment only when bench agents exist', async () => {
    const item = workItem();
    const wrapper = mountTile({
      bench: [benchTemplate()],
      draggedWorkItem: item,
    });

    wrapper.get('.cockpit-view__add-card').element.dispatchEvent(dragEvent('dragenter'));
    await nextTick();
    wrapper.get('[aria-label="Assign issue to a Bench agent in Codex Claw"]').element.dispatchEvent(dragEvent('drop'));
    await nextTick();

    expect(wrapper.emitted('assign-to-bench-agent')).toStrictEqual([[{
      item,
      teamId: 'team-codex-claw',
    }]]);
  });

  it('disables the bench target when there are no bench agents', async () => {
    const wrapper = mountTile({ draggedWorkItem: workItem() });

    wrapper.get('.cockpit-view__add-card').element.dispatchEvent(dragEvent('dragenter'));
    await nextTick();

    expect(wrapper.get<HTMLButtonElement>('[aria-label="Assign issue to a Bench agent in Codex Claw"]').element.disabled).toBe(true);
  });
});

function mountTile(props: Partial<CockpitAddAgentTileProps> = {}) {
  return mount(CockpitAddAgentTile, {
    props: {
      bench: [],
      draggedWorkItem: null,
      teamId: 'team-codex-claw',
      teamName: 'Codex Claw',
      ...props,
    },
    global: {
      plugins: [ElementPlus],
    },
  });
}

function benchTemplate(): BenchTemplate {
  return {
    id: 'bench-dina',
    name: 'Dina',
    avatar: 'DI',
    folder: '/Users/nbonamy/src/id8',
    backend: 'codex',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
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
    authorName: 'nbonamy',
    body: 'Make issue assignment feel obvious.',
    labels: [],
    createdAt: '2026-06-09T12:00:00.000Z',
    updatedAt: '2026-06-09T12:30:00.000Z',
  };
}

function dragEvent(type: string): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      dropEffect: 'copy',
    },
  });
  return event;
}
