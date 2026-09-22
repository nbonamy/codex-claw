import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot-construction';
import { createMission } from '@codex-claw/core/missions';
import { i18n } from '../../i18n';
import MissionReviewFindings from '../MissionReviewFindings.vue';

describe('MissionReviewFindings', () => {
  it('reuses the Review finding list while keeping Mission selection and remediation actions', async () => {
    const snapshot = createInitialSnapshot();
    const mission = createMission(snapshot, { outcome: 'Billing', workflowType: 'shapeAndShipFeature', teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id });
    mission.artifacts.review.findings = [
      {
        id: 'finding-open', priority: 'p1', title: 'Persist selection', body: 'Selection is lost on reload.', repositoryPath: '/repo',
        location: { file: 'src/review.ts', line: 42 }, selected: true, remediation: { state: 'open' }, createdAt: 'now', updatedAt: 'now',
      },
      {
        id: 'finding-fixed', priority: 'p2', title: 'Show evidence', body: 'Evidence was hidden.', repositoryPath: '/repo',
        selected: true, remediation: { state: 'fixed', completedAt: 'later', evidence: 'Mission tests pass.' }, createdAt: 'now', updatedAt: 'later',
      },
    ];
    const executeMission = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(MissionReviewFindings, { props: { mission, executeMission }, global: { plugins: [ElementPlus, i18n] } });

    expect(wrapper.findAll('.review-finding')).toHaveLength(2);
    expect(wrapper.findAll('.review-finding__quick-action')).toHaveLength(0);
    await wrapper.findAll('.review-finding__toggle')[1]!.trigger('click');
    expect(wrapper.text()).toContain('Mission tests pass.');
    await wrapper.findComponent({ name: 'ElSwitch' }).vm.$emit('change', false);
    await flushPromises();
    expect(executeMission).toHaveBeenCalledWith({ id: mission.id, revision: mission.revision, action: 'selectReviewFinding', findingId: 'finding-open', selected: false });
    await wrapper.findAll('button').find(button => button.text().includes('Fix 1 selected'))!.trigger('click');
    await flushPromises();
    expect(executeMission).toHaveBeenLastCalledWith({ id: mission.id, revision: mission.revision, action: 'fixSelectedReviewFindings' });
  });
});
