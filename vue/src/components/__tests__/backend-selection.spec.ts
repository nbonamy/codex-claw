import { mount } from '@vue/test-utils';
import { defineComponent, h, reactive, ref } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { createEmptySnapshot } from '@codex-claw/core/snapshot';
import type { AgentBackend } from '@codex-claw/core/contracts';
import BackendSelector from '../BackendSelector.vue';
import { provideBackendChoices } from '../backend-selection';

afterEach(() => localStorage.removeItem('codexClaw:preferredEngines'));

describe('host-scoped manual engine selection', () => {
  it('remembers explicit choices per host, but not temporary availability fallback', async () => {
    const snapshot = reactive(createEmptySnapshot());
    snapshot.providerConnections = (['codex', 'claude'] as const).map(backend => ({ backend, installed: true, connected: true, checking: false }));
    snapshot.teams.push({ id: 'remote-team', name: 'Remote', agentIds: [], remoteConnectionId: 'remote' });
    snapshot.remoteConnections.connections = [{ id: 'remote', kind: 'ssh', host: 'box', name: 'Box', status: 'ready', createdAt: '', updatedAt: '', providerConnections: structuredClone(snapshot.providerConnections.map(engine => ({ ...engine }))) }];
    const team = ref(snapshot.activeTeamId);
    const model = ref<AgentBackend>();
    const wrapper = mount(defineComponent({
      setup() {
        provideBackendChoices(() => snapshot);
        return () => h(BackendSelector, { teamId: team.value, modelValue: model.value, 'onUpdate:modelValue': value => { model.value = value; } });
      },
    }));
    await wrapper.get('select').setValue('claude');
    expect(model.value).toBe('claude');
    team.value = 'remote-team';
    await wrapper.vm.$nextTick();
    expect(model.value).toBe('codex');
    team.value = snapshot.activeTeamId;
    await wrapper.vm.$nextTick();
    expect(model.value).toBe('claude');
    snapshot.providerConnections[1]!.connected = false;
    await wrapper.vm.$nextTick();
    expect(model.value).toBe('codex');
    expect(JSON.parse(localStorage.getItem('codexClaw:preferredEngines')!)).toEqual({ local: 'claude' });
    snapshot.providerConnections[1]!.connected = true;
    wrapper.unmount();
    model.value = undefined;
    const reloaded = mount(defineComponent({ setup() {
      provideBackendChoices(() => snapshot);
      return () => h(BackendSelector, { modelValue: model.value, 'onUpdate:modelValue': value => { model.value = value; } });
    } }));
    await reloaded.vm.$nextTick();
    expect(model.value).toBe('claude');
  });
});
