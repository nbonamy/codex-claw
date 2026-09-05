import { ref } from 'vue';
import type {
  AppSnapshot,
  AutomationLocation,
  GlobalWorkItemQuery,
  WorkBacklogConfigurationInput,
  WorkItem,
  WorkItemPage,
  WorkItemQuery,
  WorkProviderAuthorization,
  WorkProviderKind,
  WorkRepository,
} from '@codex-claw/core/contracts';
import { localizedText } from './i18n/errors';
import { translate } from './i18n';
import { isFirstRunOnboardingActive } from './onboarding-session';
import { clawPlatformActions, codexClawApi } from './platform-api';
import { useConfetti } from './shared/confetti/use-confetti';

type WorkProviderStateOptions = {
  adoptSnapshot: (snapshot: AppSnapshot) => void;
  getSnapshot: () => AppSnapshot;
};

const authorizationPollMs = 5_000;

/** Owns provider authorization, polling, repository catalogs, and backlog state. */
export function createWorkProviderState(options: WorkProviderStateOptions) {
  const authorization = ref<WorkProviderAuthorization | null>(null);
  const repositoriesByProvider = ref<Partial<Record<WorkProviderKind, WorkRepository[]>>>({});
  const itemsByRepository = ref<Record<string, WorkItem[]>>({});
  const assignedItemsByProvider = ref<Partial<Record<WorkProviderKind, WorkItem[]>>>({});
  const status = ref<'notLoaded' | 'loading' | 'loaded' | 'error'>('notLoaded');
  const error = ref<string | null>(null);
  const authorizationPollTimers = new Map<WorkProviderKind, ReturnType<typeof globalThis.setTimeout>>();

  async function connect(provider: WorkProviderKind): Promise<void> {
    if (!codexClawApi?.connectWorkProvider) return;
    status.value = 'loading';
    error.value = null;
    try {
      const result = await codexClawApi.connectWorkProvider(provider);
      options.adoptSnapshot(result.snapshot);
      authorization.value = result.authorization ?? null;
      if (result.authorization) scheduleAuthorizationPoll(provider);
      else clearAuthorizationPoll(provider);
      status.value = 'loaded';
    } catch (cause) {
      status.value = 'error';
      error.value = errorMessage(cause);
      throw cause;
    }
  }

  async function openAuthorization(provider: WorkProviderKind): Promise<void> {
    status.value = 'loading';
    error.value = null;
    try {
      const pending = authorization.value;
      if (pending?.provider === provider && clawPlatformActions.openExternal) {
        await clawPlatformActions.openExternal(pending.verificationUri);
      } else if (codexClawApi?.openWorkProviderAuthorization) {
        options.adoptSnapshot(await codexClawApi.openWorkProviderAuthorization(provider));
      } else {
        return;
      }
      scheduleAuthorizationPoll(provider);
      status.value = 'loaded';
    } catch (cause) {
      status.value = 'error';
      error.value = errorMessage(cause);
      throw cause;
    }
  }

  async function completeConnection(provider: WorkProviderKind): Promise<void> {
    if (codexClawApi?.completeWorkProviderConnection) {
      await pollConnection(provider, { userInitiated: true });
    }
  }

  async function disconnect(provider: WorkProviderKind): Promise<void> {
    if (!codexClawApi?.disconnectWorkProvider) return;
    options.adoptSnapshot(await codexClawApi.disconnectWorkProvider(provider));
    clearAuthorizationPoll(provider);
    authorization.value = null;
    repositoriesByProvider.value = { ...repositoriesByProvider.value, [provider]: [] };
    itemsByRepository.value = {};
    status.value = 'notLoaded';
    error.value = null;
  }

  async function loadRepositories(provider: WorkProviderKind, location?: AutomationLocation): Promise<WorkRepository[]> {
    if (isRemoteAutomationLocation(location)) {
      return await codexClawApi?.listWorkRepositories?.(provider, location) ?? [];
    }
    if (!codexClawApi?.listWorkRepositories || connection(provider)?.status !== 'connected') {
      repositoriesByProvider.value = { ...repositoriesByProvider.value, [provider]: [] };
      status.value = 'notLoaded';
      return [];
    }

    status.value = 'loading';
    error.value = null;
    try {
      const repositories = await codexClawApi.listWorkRepositories(provider);
      repositoriesByProvider.value = { ...repositoriesByProvider.value, [provider]: repositories };
      status.value = 'loaded';
      const configuredId = options.getSnapshot().workBacklog.providerConfigurations[provider]?.repositoryId ?? null;
      const selectedId = configuredId ?? repositories[0]?.id ?? null;
      if (selectedId && !configuredId) {
        await configure({
          provider,
          configuration: { repositoryId: selectedId, assigneeLogin: null, tagName: null },
        });
      }
      if (selectedId) await loadItems(provider, selectedId);
      return repositories;
    } catch (cause) {
      repositoriesByProvider.value = { ...repositoriesByProvider.value, [provider]: [] };
      status.value = 'error';
      error.value = errorMessage(cause);
      return [];
    }
  }

  async function configure(input: WorkBacklogConfigurationInput, location?: AutomationLocation): Promise<void> {
    if (!codexClawApi?.configureWorkBacklog) return;
    const next = location
      ? await codexClawApi.configureWorkBacklog(input, location)
      : await codexClawApi.configureWorkBacklog(input);
    if (!isRemoteAutomationLocation(location)) options.adoptSnapshot(next);
  }

  async function loadItems(
    provider: WorkProviderKind,
    repositoryId: string,
    location?: AutomationLocation,
    query?: WorkItemQuery,
  ): Promise<WorkItem[] | undefined> {
    if (!codexClawApi?.listWorkItems || !repositoryId) return [];
    if (isRemoteAutomationLocation(location)) {
      return codexClawApi.listWorkItems(provider, repositoryId, location, query);
    }
    if (query) return codexClawApi.listWorkItems(provider, repositoryId, undefined, query);

    status.value = 'loading';
    error.value = null;
    try {
      const items = await codexClawApi.listWorkItems(provider, repositoryId);
      itemsByRepository.value = { ...itemsByRepository.value, [workItemsKey(provider, repositoryId)]: items };
      status.value = 'loaded';
      return items;
    } catch (cause) {
      status.value = 'error';
      error.value = errorMessage(cause);
      return undefined;
    }
  }

  async function loadGlobalItems(
    provider: WorkProviderKind,
    location?: AutomationLocation,
    query?: GlobalWorkItemQuery,
  ): Promise<WorkItemPage> {
    if (!codexClawApi?.listGlobalWorkItems) {
      return { items: [], page: 1, pageSize: query?.pageSize ?? 50, totalItems: 0 };
    }
    return codexClawApi.listGlobalWorkItems(provider, location, query);
  }

  async function loadAssignedItems(provider: WorkProviderKind, location?: AutomationLocation): Promise<WorkItem[]> {
    if (!codexClawApi?.listAssignedWorkItems) return [];
    status.value = 'loading';
    error.value = null;
    try {
      const items = await codexClawApi.listAssignedWorkItems(provider, location);
      assignedItemsByProvider.value = { ...assignedItemsByProvider.value, [provider]: items };
      status.value = 'loaded';
      return items;
    } catch (cause) {
      status.value = 'error';
      error.value = errorMessage(cause);
      throw cause;
    }
  }

  async function loadConnected(): Promise<void> {
    const providers = options.getSnapshot().workBacklog.connections
      .filter((candidate) => candidate.status === 'connected')
      .map((candidate) => candidate.provider);
    await Promise.all(providers.map(loadConnectedProvider));
  }

  async function loadConnectedProvider(provider: WorkProviderKind): Promise<void> {
    if (!codexClawApi?.listWorkRepositories) return;
    try {
      const repositories = await codexClawApi.listWorkRepositories(provider);
      repositoriesByProvider.value = { ...repositoriesByProvider.value, [provider]: repositories };
      const configuredId = options.getSnapshot().workBacklog.providerConfigurations[provider]?.repositoryId ?? null;
      const selectedId = configuredId ?? repositories[0]?.id ?? null;
      if (selectedId && !configuredId && codexClawApi.configureWorkBacklog) {
        options.adoptSnapshot(await codexClawApi.configureWorkBacklog({
          provider,
          configuration: { repositoryId: selectedId, assigneeLogin: null, tagName: null },
        }));
      }
      if (selectedId) await loadItemsForRepository(provider, selectedId);
      status.value = 'loaded';
    } catch (cause) {
      status.value = 'error';
      error.value = errorMessage(cause);
    }
  }

  async function loadItemsForRepository(provider: WorkProviderKind, repositoryId: string): Promise<void> {
    if (!codexClawApi?.listWorkItems) return;
    const items = await codexClawApi.listWorkItems(provider, repositoryId);
    itemsByRepository.value = { ...itemsByRepository.value, [workItemsKey(provider, repositoryId)]: items };
  }

  async function pollConnection(provider: WorkProviderKind, pollOptions: { userInitiated?: boolean } = {}): Promise<void> {
    if (!codexClawApi?.completeWorkProviderConnection) return;
    if (pollOptions.userInitiated) status.value = 'loading';
    error.value = null;
    try {
      options.adoptSnapshot(await codexClawApi.completeWorkProviderConnection(provider));
      const current = connection(provider);
      if (current?.status === 'connected') {
        clearAuthorizationPoll(provider);
        authorization.value = null;
        if (!isFirstRunOnboardingActive()) useConfetti().celebrate();
        await loadRepositories(provider);
        return;
      }
      if (current?.status === 'connecting' && authorization.value?.provider === provider) {
        status.value = 'loaded';
        scheduleAuthorizationPoll(provider);
        return;
      }
      clearAuthorizationPoll(provider);
      authorization.value = null;
      status.value = current?.status === 'error' ? 'error' : 'loaded';
      error.value = current?.status === 'error' ? localizedText(current.detail, translate) : null;
    } catch (cause) {
      clearAuthorizationPoll(provider);
      status.value = 'error';
      error.value = errorMessage(cause);
      if (pollOptions.userInitiated) throw cause;
    }
  }

  function scheduleAuthorizationPoll(provider: WorkProviderKind): void {
    clearAuthorizationPoll(provider);
    if (authorization.value?.provider !== provider || connection(provider)?.status !== 'connecting') return;
    const timer = globalThis.setTimeout(() => {
      authorizationPollTimers.delete(provider);
      void pollConnection(provider);
    }, authorizationPollMs);
    authorizationPollTimers.set(provider, timer);
  }

  function clearAuthorizationPoll(provider: WorkProviderKind): void {
    const timer = authorizationPollTimers.get(provider);
    if (timer === undefined) return;
    globalThis.clearTimeout(timer);
    authorizationPollTimers.delete(provider);
  }

  function connection(provider: WorkProviderKind) {
    return options.getSnapshot().workBacklog.connections.find((candidate) => candidate.provider === provider) ?? null;
  }

  return {
    assignedItemsByProvider,
    authorization,
    error,
    itemsByRepository,
    repositoriesByProvider,
    status,
    completeConnection,
    configure,
    connect,
    disconnect,
    loadAssignedItems,
    loadConnected,
    loadGlobalItems,
    loadItems,
    loadRepositories,
    openAuthorization,
  };
}

export function isRemoteAutomationLocation(
  location: AutomationLocation | undefined,
): location is Extract<AutomationLocation, { kind: 'remote' }> {
  return location?.kind === 'remote' && location.remoteConnectionId.trim().length > 0;
}

function workItemsKey(provider: WorkProviderKind, repositoryId: string): string {
  return `${provider}:${repositoryId}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
