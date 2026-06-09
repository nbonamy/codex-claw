import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '../../../shared/snapshot';
import type { Agent, WorkItem } from '../../../shared/contracts';
import CockpitAgentCard from '../CockpitAgentCard.vue';

type CockpitAgentCardProps = {
  agent: Agent;
  draggedWorkItem: WorkItem | null;
  dropTarget: boolean;
};

describe('CockpitAgentCard', () => {
  it('submits prompts for idle agents and clears the draft', async () => {
    const agent = idleAgent();
    const wrapper = mountCard({ agent });

    const input = wrapper.get<HTMLInputElement>('[aria-label="Prompt Dina"]');
    await input.setValue('  inspect this  ');
    await wrapper.get('.cockpit-view__prompt').trigger('submit');

    expect(wrapper.emitted('prompt')).toStrictEqual([[{
      agentId: 'agent-dina',
      prompt: 'inspect this',
    }]]);
    expect(input.element.value).toBe('');
  });

  it('emits assignment and clear intents when an idle agent receives a dropped work item', async () => {
    const item = workItem();
    const wrapper = mountCard({
      agent: idleAgent(),
      draggedWorkItem: item,
    });

    const dragEnter = dragEvent('dragenter');
    wrapper.get('.cockpit-view__agent-card').element.dispatchEvent(dragEnter);
    wrapper.get('.cockpit-view__agent-card').element.dispatchEvent(dragEvent('drop'));

    expect(dragEnter.defaultPrevented).toBe(true);
    expect(wrapper.emitted('drop-target-enter')).toStrictEqual([['agent-dina']]);
    expect(wrapper.emitted('assign-work-item')).toStrictEqual([[{
      agentId: 'agent-dina',
      item,
    }]]);
    expect(wrapper.emitted('clear-dragged-work-item')).toStrictEqual([[]]);
  });

  it('does not accept prompts or drops while the agent is busy', async () => {
    const agent = idleAgent();
    agent.status = { type: 'working' };
    const wrapper = mountCard({
      agent,
      draggedWorkItem: workItem(),
    });

    expect(wrapper.get<HTMLInputElement>('[aria-label="Prompt Dina"]').element.disabled).toBe(true);

    const dragEnter = dragEvent('dragenter');
    wrapper.get('.cockpit-view__agent-card').element.dispatchEvent(dragEnter);
    wrapper.get('.cockpit-view__agent-card').element.dispatchEvent(dragEvent('drop'));

    expect(dragEnter.defaultPrevented).toBe(false);
    expect(wrapper.emitted('assign-work-item')).toBeUndefined();
  });
});

function mountCard(props: Partial<CockpitAgentCardProps> = {}) {
  return mount(CockpitAgentCard, {
    props: {
      agent: idleAgent(),
      draggedWorkItem: null,
      dropTarget: false,
      ...props,
    },
  });
}

function idleAgent(): Agent {
  const agent = { ...createInitialSnapshot().agents[0] };
  agent.status = { type: 'idle' };
  return agent;
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
