import { describe, expect, it } from 'vitest';
import { createMission } from '@codex-claw/core/missions';
import { createInitialSnapshot } from '@codex-claw/core/snapshot-construction';
import { mountShell } from './app-shell-test-harness';

describe('AppShell missions', () => {
  it('replaces the agent workspace with a mission and returns to normal agent navigation', async () => {
    const snapshot = createInitialSnapshot();
    const mission = createMission(snapshot, { outcome: 'Add billing', workflowType: 'shapeAndShipFeature' });
    const wrapper = mountShell({ snapshot });
    await wrapper.findComponent({ name: 'AppShellNavigation' }).vm.$emit('select-mission', mission.id);
    expect(wrapper.find('.mission-workspace').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'AgentWorkspace' }).exists()).toBe(false);
    await wrapper.findComponent({ name: 'AppShellNavigation' }).vm.$emit('select-agent', snapshot.agents[0]!.id);
    expect(wrapper.find('.mission-workspace').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'AgentWorkspace' }).exists()).toBe(true);
  });
});
