import type {
  AppSnapshot,
  GlobalWorkItemQuery,
  WorkBacklogConfigurationInput,
  WorkItem,
  WorkItemPage,
  WorkRepository,
  WorkProviderKind,
} from '@codex-claw/core/contracts';
import { computed, nextTick, reactive, ref, watch } from 'vue';

type CockpitBacklogConfiguration = {
  assigneeLogin: string | null;
  repositoryId: string | null;
  tagName: string | null;
};
type GlobalScope = 'assignedToMe' | 'all';
type GlobalFeed = {
  error: string | null;
  page: number;
  pages: Record<number, WorkItem[]>;
  pageSize: number;
  pendingPage: number | null;
  status: 'notLoaded' | 'loading' | 'loaded' | 'error';
  totalItems: number;
};

const globalPageSize = 25;

export function useCockpitBacklog(options: {
  configure: (input: WorkBacklogConfigurationInput) => Promise<void>;
  confirmLoadAll: () => Promise<boolean>;
  getSnapshot: () => AppSnapshot;
  getWorkBacklogError: () => string | null;
  getWorkBacklogStatus: () => 'notLoaded' | 'loading' | 'loaded' | 'error';
  getWorkItemsByRepository: () => Record<string, WorkItem[]>;
  getWorkRepositories: (provider: WorkProviderKind) => WorkRepository[];
  loadGlobalWorkItems: (query: GlobalWorkItemQuery, provider: WorkProviderKind) => Promise<WorkItemPage>;
  loadWorkItems: (repositoryId: string, provider: WorkProviderKind) => Promise<void>;
  loadWorkRepositories: (provider: WorkProviderKind) => Promise<void>;
}) {
  const provider = ref<WorkProviderKind>(rememberedProvider());
  let contextRevision = 0;
  const pendingConfiguration = ref<CockpitBacklogConfiguration | null>(null);
  const globalScope = ref<GlobalScope | null>(null);
  const feeds = reactive<Record<GlobalScope, GlobalFeed>>({
    assignedToMe: emptyFeed(),
    all: emptyFeed(),
  });

  const savedConfiguration = computed<CockpitBacklogConfiguration>(() => {
    const configuration = options.getSnapshot().workBacklog.providerConfigurations[provider.value] ?? {};
    return normalize({
      repositoryId: configuration.repositoryId ?? null,
      assigneeLogin: configuration.assigneeLogin ?? null,
      tagName: configuration.tagName ?? null,
    });
  });
  const effectiveConfiguration = computed(() => pendingConfiguration.value ?? savedConfiguration.value);
  const workBacklog = computed(() => {
    const snapshot = options.getSnapshot();
    const connection = snapshot.workBacklog.connections.find((candidate) => candidate.provider === provider.value);
    if (!connection || connection.status !== 'connected') return null;
    const configuration = effectiveConfiguration.value;
    const selectedRepositoryId = configuration.repositoryId;
    const feed = globalScope.value ? feeds[globalScope.value] : null;
    const items = selectedRepositoryId
      ? options.getWorkItemsByRepository()[`${provider.value}:${selectedRepositoryId}`] ?? []
      : feed?.pages[feed.page] ?? [];
    return {
      assignments: snapshot.workBacklog.assignments,
      connection,
      globalScope: globalScope.value,
      page: feed?.page ?? 1,
      pageSize: feed?.pageSize ?? items.length,
      pageLoading: feed?.pendingPage !== null,
      repositories: options.getWorkRepositories(provider.value),
      selectedAssigneeLogin: globalScope.value === 'assignedToMe' && provider.value === 'github'
        ? connection.accountLabel ?? configuration.assigneeLogin
        : configuration.assigneeLogin,
      selectedRepositoryId,
      selectedTagName: configuration.tagName,
      items,
      status: selectedRepositoryId ? options.getWorkBacklogStatus() : feed?.status ?? options.getWorkBacklogStatus(),
      error: selectedRepositoryId ? options.getWorkBacklogError() : feed?.error ?? options.getWorkBacklogError(),
      totalItems: feed?.totalItems ?? items.length,
    };
  });

  watch(savedConfiguration, (configuration) => {
    if (pendingConfiguration.value && sameConfiguration(pendingConfiguration.value, configuration)) {
      pendingConfiguration.value = null;
    }
  });

  async function initialize(): Promise<void> {
    const revision = contextRevision;
    globalScope.value = null;
    if (options.getWorkRepositories(provider.value).length === 0) {
      await options.loadWorkRepositories(provider.value);
      await nextTick();
    }
    if (revision !== contextRevision) return;
    pendingConfiguration.value = { repositoryId: null, assigneeLogin: null, tagName: null };
    const scope = rememberedGlobalScope(provider.value) === 'all' ? 'all' : 'assignedToMe';
    globalScope.value = scope;
    await ensureGlobalItems(scope);
  }

  async function selectRepository(repositoryId: string | null): Promise<void> {
    const selectedProvider = provider.value;
    const revision = ++contextRevision;
    feeds.all = emptyFeed();
    feeds.assignedToMe = emptyFeed();
    globalScope.value = repositoryId ? null : 'assignedToMe';
    await configure({ repositoryId, assigneeLogin: null, tagName: null });
    if (revision !== contextRevision) return;
    if (repositoryId) await options.loadWorkItems(repositoryId, selectedProvider);
    else await ensureGlobalItems('assignedToMe');
  }

  async function selectAssignee(assigneeLogin: string | null): Promise<void> {
    if (globalScope.value === 'assignedToMe' && !assigneeLogin) {
      globalScope.value = 'all';
      await ensureGlobalItems('all');
    }
    await configure({
      repositoryId: workBacklog.value?.selectedRepositoryId ?? null,
      assigneeLogin,
      tagName: workBacklog.value?.selectedTagName ?? null,
    });
  }

  async function selectTag(tagName: string | null): Promise<void> {
    await configure({
      repositoryId: workBacklog.value?.selectedRepositoryId ?? null,
      assigneeLogin: workBacklog.value?.selectedAssigneeLogin ?? null,
      tagName,
    });
  }

  async function refresh(repositoryId: string | null): Promise<void> {
    if (options.getWorkRepositories(provider.value).length === 0) await options.loadWorkRepositories(provider.value);
    if (repositoryId) await options.loadWorkItems(repositoryId, provider.value);
    else if (globalScope.value) await loadGlobalItems(globalScope.value, 1, true);
  }

  async function selectGlobalScope(scope: GlobalScope): Promise<void> {
    const revision = contextRevision;
    if (scope === 'all' && !await options.confirmLoadAll()) return;
    if (revision !== contextRevision) return;
    await configure({ repositoryId: null, assigneeLogin: null, tagName: null });
    if (revision !== contextRevision) return;
    globalScope.value = scope;
    if (scope === 'all') rememberGlobalScope(provider.value);
    await ensureGlobalItems(scope);
  }

  async function changePage(page: number): Promise<void> {
    const scope = globalScope.value;
    if (!scope) return;
    const feed = feeds[scope];
    const totalPages = Math.max(1, Math.ceil(feed.totalItems / feed.pageSize));
    if (!Number.isInteger(page) || page < 1 || page > totalPages || page === feed.page) return;
    await loadGlobalItems(scope, page);
  }

  async function configure(configuration: CockpitBacklogConfiguration): Promise<void> {
    const normalized = normalize(configuration);
    pendingConfiguration.value = normalized;
    try {
      await options.configure({ provider: provider.value, configuration: normalized });
    } catch (error) {
      if (pendingConfiguration.value && sameConfiguration(pendingConfiguration.value, normalized)) {
        pendingConfiguration.value = null;
      }
      throw error;
    }
  }

  async function ensureGlobalItems(scope: GlobalScope): Promise<void> {
    if (feeds[scope].status === 'notLoaded') await loadGlobalItems(scope, 1);
  }

  async function loadGlobalItems(scope: GlobalScope, page: number, force = false): Promise<void> {
    const feed = feeds[scope];
    if (feed.pendingPage !== null) return;
    if (!force && feed.pages[page]) {
      feed.page = page;
      feed.error = null;
      return;
    }
    feed.pendingPage = page;
    if (Object.keys(feed.pages).length === 0) feed.status = 'loading';
    feed.error = null;
    const revision = contextRevision;
    try {
      const result = await options.loadGlobalWorkItems({
        assignment: scope === 'assignedToMe' ? 'viewer' : 'all',
        state: 'open',
        page,
        pageSize: globalPageSize,
      }, provider.value);
      if (revision !== contextRevision) return;
      feed.pages[result.page] = result.items;
      feed.page = result.page;
      feed.pageSize = result.pageSize;
      feed.totalItems = result.totalItems;
      feed.status = 'loaded';
    } catch (error) {
      if (revision !== contextRevision) return;
      feed.error = error instanceof Error ? error.message : String(error);
      if (Object.keys(feed.pages).length === 0) feed.status = 'error';
    } finally {
      feed.pendingPage = null;
    }
  }

  return {
    provider,
    async selectProvider(next: WorkProviderKind): Promise<void> {
      ++contextRevision;
      provider.value = next;
      try { window.localStorage.setItem('cockpitBacklogProvider', next); } catch { /* Optional renderer preference. */ }
      pendingConfiguration.value = null;
      feeds.all = emptyFeed();
      feeds.assignedToMe = emptyFeed();
      await initialize();
    },
    changePage,
    initialize,
    refresh,
    selectAssignee,
    selectGlobalScope,
    selectRepository,
    selectTag,
    workBacklog,
  };
}

function emptyFeed(): GlobalFeed {
  return {
    error: null,
    page: 1,
    pages: {},
    pageSize: globalPageSize,
    pendingPage: null,
    status: 'notLoaded',
    totalItems: 0,
  };
}

function normalize(configuration: CockpitBacklogConfiguration): CockpitBacklogConfiguration {
  return {
    repositoryId: normalizedOptionalString(configuration.repositoryId),
    assigneeLogin: normalizedOptionalString(configuration.assigneeLogin),
    tagName: normalizedOptionalString(configuration.tagName),
  };
}

function sameConfiguration(left: CockpitBacklogConfiguration, right: CockpitBacklogConfiguration): boolean {
  return left.repositoryId === right.repositoryId &&
    left.assigneeLogin === right.assigneeLogin &&
    left.tagName === right.tagName;
}

function normalizedOptionalString(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function rememberedProvider(): WorkProviderKind {
  try { return window.localStorage.getItem('cockpitBacklogProvider') === 'linear' ? 'linear' : 'github'; } catch { return 'github'; }
}

function rememberedGlobalScope(provider: WorkProviderKind): 'all' | null {
  try {
    return window.localStorage.getItem(`cockpitGlobalScope:${provider}`) === 'all' ? 'all' : null;
  } catch {
    return null;
  }
}

function rememberGlobalScope(provider: WorkProviderKind): void {
  try {
    window.localStorage.setItem(`cockpitGlobalScope:${provider}`, 'all');
  } catch {
    // Persistence can be unavailable in hardened renderer contexts.
  }
}
