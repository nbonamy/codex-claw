import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@workspace/core/snapshot-construction';
import { createMission } from '@workspace/core/missions';
import MissionReviewChanges from '../MissionReviewChanges.vue';

describe('MissionReviewChanges', () => {
  it('does not show a stale diff after switching to a repository without an agent', async () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0]!;
    const mission = createMission(snapshot, {
      outcome: 'Review two repositories',
      workflowType: 'shapeAndShipFeature',
      teamId: snapshot.teams[0]!.id,
      orchestratorMemberId: agent.id,
    });
    mission.stage = 'review';
    mission.execution = {
      teamId: mission.teamId,
      memberIds: [agent.id],
      workspaces: [
        { repositoryPath: '/repo/api', path: '/mission/api', branch: 'mission/review' },
        { repositoryPath: '/repo/web', path: '/mission/web', branch: 'mission/review' },
      ],
      runs: [
        { id: 'run-api', stage: 'implementation', memberId: agent.id, workerId: agent.id, repositoryPath: '/repo/api', status: 'accepted', skills: [], feedback: '', startedAt: 'now' },
        { id: 'run-web', stage: 'implementation', memberId: agent.id, workerId: 'missing-worker', repositoryPath: '/repo/web', status: 'accepted', skills: [], feedback: '', startedAt: 'now' },
      ],
    };
    let resolveApiDiff!: (result: {
      diff: string;
      summary: { addedLines: number; removedLines: number; changedFiles: number };
      sections: never[];
      target: { type: 'branch' };
    }) => void;
    const getDiff = vi.fn().mockReturnValue(new Promise(resolve => { resolveApiDiff = resolve; }));
    const wrapper = mount(MissionReviewChanges, {
      props: { agent, agents: [agent], getDiff, mission },
    });
    await vi.waitFor(() => expect(getDiff).toHaveBeenCalledOnce());

    const repositorySelect = wrapper.findAllComponents({ name: 'ElSelect' })[0]!;
    repositorySelect.vm.$emit('update:modelValue', '/repo/web');
    await flushPromises();
    expect(wrapper.text()).toContain('The implementation agent for this repository is unavailable.');

    resolveApiDiff({
      diff: 'diff --git a/api.ts b/api.ts\n--- a/api.ts\n+++ b/api.ts\n@@ -1 +1 @@\n-old\n+stale',
      summary: { addedLines: 1, removedLines: 1, changedFiles: 1 },
      sections: [],
      target: { type: 'branch' },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('The implementation agent for this repository is unavailable.');
    expect(wrapper.text()).not.toContain('api.ts');
  });
});
