import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { afterEach, expect, it } from 'vitest';
import type { AppSnapshot, AutomationLocation } from '@codex-claw/core/contracts';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import { configureClawClient } from '../../platform-api';
import { createClientApiMock } from '../../test/client-api-mock';
import { backlogConnectionsKey, useBacklogConnections, useBacklogProviders } from '../backlog-providers';

afterEach(() => configureClawClient());

it('uses the selected host connections and ignores a late response from the previous host', async () => {
  const { api } = createClientApiMock();
  configureClawClient({ platform: 'desktop', api });
  const location = ref<AutomationLocation>({ kind: 'local' });
  let resolveOld!: (snapshot: AppSnapshot) => void;
  const remote = createInitialSnapshot();
  remote.workBacklog.connections = [{ provider: 'linear', status: 'connected' }];
  api.getAutomationSnapshot.mockImplementation(async selected => selected?.kind === 'remote' && selected.remoteConnectionId === 'old'
    ? new Promise(resolve => { resolveOld = resolve; }) : remote);
  const Harness = defineComponent({ setup() {
    const { providers } = useBacklogProviders(useBacklogConnections(() => location.value));
    return () => h('output', providers.value.join(','));
  } });
  const wrapper = mount(Harness, { global: { provide: { [backlogConnectionsKey as symbol]: () => [{ provider: 'github', status: 'connected' }] } } });
  expect(wrapper.text()).toBe('github');
  location.value = { kind: 'remote', remoteConnectionId: 'old' };
  await flushPromises();
  expect(wrapper.text()).toBe('');
  location.value = { kind: 'remote', remoteConnectionId: 'new' };
  await flushPromises();
  expect(wrapper.text()).toBe('linear');
  resolveOld(createInitialSnapshot());
  await flushPromises();
  expect(wrapper.text()).toBe('linear');
  location.value = { kind: 'local' };
  await flushPromises();
  expect(wrapper.text()).toBe('github');
});
