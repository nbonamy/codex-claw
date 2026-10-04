import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { DelegatedTask } from '@codex-claw/core/delegated-task';
import { i18n } from '../../i18n';
import AgentTasks from '../AgentTasks.vue';

const task: DelegatedTask = {
  id: 'task-1', requestId: 'request', requestFingerprint: 'hash', parentAgentId: 'parent', workerAgentId: 'worker', backend: 'claude',
  assignment: { title: 'Repair routing', doneWhen: 'Cross-provider test passes' }, prompt: 'Repair routing', attemptId: 'attempt-1', state: 'running', createdAt: '', updatedAt: '', parentWakeBlocked: false,
  submission: { id: 'result', attemptId: 'attempt-1', turnId: 'turn', backendSession: { kind: 'claude', sessionId: 'session', transport: 'stdio' }, summary: 'Routing repaired', evidence: ['Contract test passed'], artifacts: ['backend/src/fix.ts'], caveats: ['Live execution not checked'] },
};
describe('AgentTasks', () => {
  it('makes provisional results inspectable and emits cancellation for their task identity', async () => {
    const wrapper = mount(AgentTasks, { props: { tasks: [task], error: '' }, global: { plugins: [i18n] } });
    expect(wrapper.text()).toContain('Repair routing');
    expect(wrapper.text()).toContain('awaiting successful turn completion');
    expect(wrapper.text()).toContain('Contract test passed');
    expect(wrapper.text()).toContain('backend/src/fix.ts');
    expect(wrapper.text()).toContain('Live execution not checked');
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('cancel')).toEqual([['task-1']]);
    await wrapper.setProps({ tasks: [{ ...task, state: 'completed', delivery: { id: 'delivery', state: 'uncertain' } }] });
    expect(wrapper.text()).not.toContain('awaiting successful turn completion');
    expect(wrapper.text()).toContain('Parent delivery: uncertain');
    expect(wrapper.find('button').exists()).toBe(false);
  });
  it('hides empty assignments and surfaces read failures instead of an empty success', async () => {
    const wrapper = mount(AgentTasks, { props: { tasks: [], error: '' }, global: { plugins: [i18n] } });
    expect(wrapper.find('details').exists()).toBe(false);
    await wrapper.setProps({ error: 'Cannot reach task owner' });
    expect(wrapper.get('[role="alert"]').text()).toBe('Cannot reach task owner');
  });
});
