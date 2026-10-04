import type { AutomationLocation, WorkItem, WorkProviderKind, WorkRepository } from '@codex-claw/core/contracts';
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue';
import { useBacklogConnections, useBacklogProviders } from './backlog-providers';
import { codexClawApi } from '../platform-api';
import { AsyncCatalogCache } from '../async-catalog-cache';

/** Dialog-local Linear browsing. Code-repository selection remains with callers. */
export function useLinearBacklog(location: () => AutomationLocation | undefined) {
  const { provider, providers } = useBacklogProviders(useBacklogConnections(location));
  const sources = ref<WorkRepository[]>([]);
  const sourceId = ref<string | null>(null);
  const items = ref<WorkItem[]>([]);
  const status = ref<'notLoaded' | 'loading' | 'loaded' | 'error'>('notLoaded');
  const error = ref<string | null>(null);
  const catalogs = new AsyncCatalogCache<string, WorkRepository>();
  const issueCatalogs = new AsyncCatalogCache<string, WorkItem>();
  const locationKey = computed(() => JSON.stringify(location() ?? { kind: 'local' }));
  let revision = 0;
  onScopeDispose(() => { ++revision; });
  watch([provider, locationKey, () => providers.value.length > 0], () => { void loadProvider(); }, { immediate: true });

  async function selectProvider(next: WorkProviderKind): Promise<void> {
    provider.value = next;
    await nextTick();
  }

  async function loadProvider(): Promise<void> {
    const request = ++revision;
    sourceId.value = null;
    sources.value = [];
    items.value = [];
    error.value = null;
    status.value = 'notLoaded';
    if (provider.value !== 'linear' || !providers.value.includes('linear')) return;
    status.value = 'loading';
    const entry = catalogs.load(`linear:${locationKey.value}`, request, async () => {
      if (!codexClawApi?.listWorkRepositories) throw new Error('Backlog browsing is unavailable.');
      return codexClawApi.listWorkRepositories('linear', location());
    });
    await entry.promise;
    if (request !== revision) return;
    sources.value = entry.value;
    status.value = entry.status;
    error.value = entry.error;
    if (entry.status === 'loaded' && entry.value[0]) await selectSource(entry.value[0].id);
  }

  async function selectSource(id: string | null): Promise<void> {
    const request = ++revision;
    sourceId.value = id;
    items.value = [];
    error.value = null;
    status.value = id ? 'loading' : 'loaded';
    if (!id || provider.value !== 'linear') return;
    const entry = issueCatalogs.load(`linear:${locationKey.value}:${id}`, request, async () => {
      if (!codexClawApi?.listWorkItems) throw new Error('Backlog browsing is unavailable.');
      return codexClawApi.listWorkItems('linear', id, location(), { kind: 'issue', state: 'all' });
    });
    await entry.promise;
    if (request !== revision) return;
    items.value = entry.value;
    status.value = entry.status;
    error.value = entry.error;
  }
  return { provider, providers, sources, sourceId, items, status, error, selectProvider, selectSource,
    refresh: () => sourceId.value ? selectSource(sourceId.value) : loadProvider() };
}
