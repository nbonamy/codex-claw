import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { defineComponent, h, reactive } from 'vue';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import type { WorkItem } from '@codex-claw/core/contracts';
import { mockWorkProvider as provider, mockWorkSource, mockWorkItem, registerMockWorkProvider } from '@codex-claw/core/__tests__/fixtures/mock-work-provider';
import { configureClawClient } from '../../platform-api';
import { createClientApiMock } from '../../test/client-api-mock';
import { backlogConnectionsKey } from '../backlog-providers';
import RepositorySessionSourceDialog from '../RepositorySessionSourceDialog.vue';
import SettingsIntegrationsPanel from '../SettingsIntegrationsPanel.vue';
import BacklogView from '../BacklogView.vue';
import { useCockpitBacklog } from '../use-cockpit-backlog';

let unregister: (() => void) | undefined;
afterEach(() => { unregister?.(); configureClawClient(); });

it('connects, browses and selects a third provider without numeric issues or code repositories in its source model', async () => {
  unregister = registerMockWorkProvider();
  const settings = mount(SettingsIntegrationsPanel, { props: { connections: [] } });
  await settings.get('[aria-label="Connect Mock work source"]').trigger('click');
  expect(settings.emitted('connect')).toEqual([[provider]]);
  settings.unmount();

  const { api } = createClientApiMock();
  configureClawClient({ platform: 'desktop', api });
  api.listWorkSources.mockResolvedValue([mockWorkSource]);
  const item = mockWorkItem;
  api.listWorkItems.mockResolvedValue([item]);
  const picker = mount(RepositorySessionSourceDialog, {
    props: { visible: true, repositoryName: 'Current code repository' },
    global: { provide: { [backlogConnectionsKey as symbol]: () => [{ provider, status: 'connected' }] } },
  });
  await flushPromises();
  await picker.findAll('[role="tab"]')[2]!.trigger('click');
  await flushPromises();
  expect(api.listWorkItems).toHaveBeenCalledWith(provider, 'board:opaque', undefined, { kind: 'all', state: 'all' });
  expect(picker.text()).toContain('TASK-blue');
  expect(picker.text()).not.toContain('#undefined');
  await picker.get('.repository-session-source-dialog__result').trigger('click');
  expect(picker.get('.work-item-detail').text()).toContain(item.body!);
  expect(picker.get<HTMLInputElement>('input[aria-label="Branch"]').element.value).toBe('fix/task-blue');
  await picker.get('.work-item-assignment-picker .claw-button--primary').trigger('click');
  const selection = picker.emitted('start-work-item')![0]![0] as { item: WorkItem; isCurrent: () => boolean };
  expect(selection.item).toEqual(item);
  expect(selection.isCurrent()).toBe(true);
  await picker.setProps({ visible: false });
  expect(selection.isCurrent()).toBe(false);
  picker.unmount();
});

it('uses opaque continuations without totals, including an empty filtered page and cached back navigation', async () => {
  unregister = registerMockWorkProvider();
  const snapshot = reactive(createInitialSnapshot());
  snapshot.workBacklog.connections = [{ provider, status: 'connected' }];
  const loadGlobalWorkItems = vi.fn()
    .mockResolvedValueOnce({ items: [], nextCursor: 'native:after-blue' })
    .mockResolvedValueOnce({ items: [mockWorkItem] });
  const Harness = defineComponent({
    setup() {
      const state = useCockpitBacklog({
        getSnapshot: () => snapshot, configure: async () => {}, confirmLoadAll: async () => true,
        getWorkBacklogError: () => null, getWorkBacklogStatus: () => 'loaded',
        getWorkItemsByRepository: () => ({}), getWorkRepositories: () => [mockWorkSource],
        loadWorkRepositories: async () => {}, loadWorkItems: async () => {}, loadGlobalWorkItems,
      });
      void state.initialize();
      return () => h(BacklogView, {
        agents: [], teams: [], workProvider: state.provider.value, workProviders: state.providers.value,
        workBacklog: state.workBacklog.value, startWorkItemsAction: async () => {},
        onChangeWorkItemsPage: state.changePage,
      });
    },
  });
  const wrapper = mount(Harness);
  await flushPromises();
  expect(loadGlobalWorkItems).toHaveBeenCalledWith({ assignment: 'viewer', state: 'open', pageSize: 25 }, provider);
  expect(wrapper.get<HTMLButtonElement>('[aria-label="Next page"]').element.disabled).toBe(false);
  expect(wrapper.get('.cockpit-inbox__pagination').text()).not.toContain('total');
  await wrapper.get('[aria-label="Next page"]').trigger('click');
  await flushPromises();
  expect(loadGlobalWorkItems).toHaveBeenLastCalledWith({ assignment: 'viewer', state: 'open', pageSize: 25, cursor: 'native:after-blue' }, provider);
  expect(wrapper.text()).toContain('TASK-blue');
  expect(wrapper.get<HTMLButtonElement>('[aria-label="Next page"]').element.disabled).toBe(true);
  await wrapper.get('[aria-label="Previous page"]').trigger('click');
  await flushPromises();
  expect(loadGlobalWorkItems).toHaveBeenCalledTimes(2);
  expect(wrapper.get('.cockpit-inbox__pagination').text()).toContain('Page 1');
  wrapper.unmount();
});
