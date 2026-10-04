import type { AutomationLocation, WorkItem, WorkProviderKind, WorkRepository } from '@codex-claw/core/contracts';
import { computed, onScopeDispose, ref, watch } from 'vue';
import { codexClawApi } from '../platform-api';
import { AsyncCatalogCache } from '../async-catalog-cache';

/** Dialog-local Linear browsing. Code-repository selection remains with callers. */
export function useLinearBacklog(location: () => AutomationLocation | undefined) {
  const provider = ref<WorkProviderKind>('github');
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
  watch(locationKey, () => { void selectProvider(provider.value); });

  async function selectProvider(next: WorkProviderKind): Promise<void> {
    const request = ++revision;
    provider.value = next;
    sourceId.value = null;
    sources.value = [];
    items.value = [];
    error.value = null;
    status.value = 'notLoaded';
    if (next !== 'linear') return;
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
  return { provider, sources, sourceId, items, status, error, selectProvider, selectSource,
    refresh: () => sourceId.value ? selectSource(sourceId.value) : selectProvider(provider.value) };
}
