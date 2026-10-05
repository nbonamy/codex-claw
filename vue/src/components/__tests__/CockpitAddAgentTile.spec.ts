import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import type { WorkItem } from '@workspace/core/contracts';
import CockpitAddAgentTile from '../CockpitAddAgentTile.vue';

describe('CockpitAddAgentTile', () => {
  it('emits new-agent from the add tile and its button', async () => {
    const wrapper = mountTile();

    await wrapper.get('.cockpit-view__add-card').trigger('click');
    await wrapper.get('.new-agent-button__primary').trigger('click');

    expect(wrapper.emitted('new-agent')).toStrictEqual([
      ['team-app'],
      ['team-app'],
    ]);
  });

  it('turns into a single new-agent target while dragging work', async () => {
    const item = workItem();
    const wrapper = mountTile({ draggedWorkItem: item });
    const card = wrapper.get('.cockpit-view__add-card');
    const dragEnter = dragEvent('dragenter');

    card.element.dispatchEvent(dragEnter);
    await nextTick();

    expect(dragEnter.defaultPrevented).toBe(true);
    expect(wrapper.text()).toContain('Assign to New Agent');
    expect(card.classes()).toContain('cockpit-view__add-card--drop-active');

    card.element.dispatchEvent(dragEvent('drop'));
    await nextTick();
    expect(wrapper.emitted('assign-to-new-agent')).toStrictEqual([[{
      item,
      teamId: 'team-app',
    }]]);
  });

  it('ignores drag events without a work item and resets on leave', async () => {
    const wrapper = mountTile();
    const card = wrapper.get('.cockpit-view__add-card');
    const dragEnter = dragEvent('dragenter');
    card.element.dispatchEvent(dragEnter);
    await nextTick();
    expect(dragEnter.defaultPrevented).toBe(false);

    await wrapper.setProps({ draggedWorkItem: workItem() });
    card.element.dispatchEvent(dragEvent('dragenter'));
    card.element.dispatchEvent(dragEvent('dragleave'));
    await nextTick();
    expect(card.classes()).not.toContain('cockpit-view__add-card--drop-active');
  });
});

function mountTile(props: { draggedWorkItem?: WorkItem | null } = {}) {
  return mount(CockpitAddAgentTile, {
    props: {
      draggedWorkItem: null,
      teamId: 'team-app',
      ...props,
    },
  });
}

function workItem(): WorkItem {
  return {
    provider: 'github',
    id: 'nbonamy/agent-workspace#12',
    sourceId: 'nbonamy/agent-workspace',
    sourceName: 'nbonamy/agent-workspace',
    number: 12,
    title: 'Fix cockpit drag target',
    url: 'https://github.com/nbonamy/agent-workspace/issues/12',
    state: 'open',
    labels: [],
    createdAt: '2026-06-09T12:00:00.000Z',
    updatedAt: '2026-06-09T12:30:00.000Z',
  };
}

function dragEvent(type: string, relatedTarget?: EventTarget): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', { value: { dropEffect: 'copy' } });
  Object.defineProperty(event, 'relatedTarget', { value: relatedTarget ?? null });
  return event;
}
