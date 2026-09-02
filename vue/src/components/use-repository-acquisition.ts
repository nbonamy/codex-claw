import { canonicalGitRemoteIdentity } from '@codex-claw/core/git-remote';
import type {
  CloneSourceRepositoryInput,
  SourceRepository,
  Team,
  WorkIntegrationConnection,
  WorkRepository,
} from '@codex-claw/core/contracts';
import { computed, ref, watch } from 'vue';

type CatalogStatus = 'notLoaded' | 'loading' | 'loaded' | 'error';

export type RepositoryAcquisitionOptions = {
  activeTeam: () => Team | null;
  activeTeamId: () => string | undefined;
  catalog: () => WorkRepository[] | undefined;
  catalogError: () => string | null;
  catalogStatus: () => CatalogStatus;
  cloneRepository: (input: CloneSourceRepositoryInput) => Promise<SourceRepository>;
  connectGitHub: () => Promise<void>;
  errorMessage: (error: unknown) => string;
  githubConnection: () => WorkIntegrationConnection;
  loadGitHubRepositories: () => Promise<WorkRepository[] | void>;
  openGitHubAuthorization: () => Promise<void>;
  openRepository: (repository: SourceRepository, teamId?: string) => Promise<void>;
  sourceRepositories: () => SourceRepository[];
};

/** Owns the reusable GitHub/URL repository acquisition dialog workflow. */
export function useRepositoryAcquisition(options: RepositoryAcquisitionOptions) {
  const visible = ref(false);
  const mode = ref<'github' | 'url'>('github');
  const repositories = ref<WorkRepository[]>([]);
  const loading = ref(false);
  const busy = ref(false);
  const error = ref<string | null>(null);

  const displayError = computed(() => (
    error.value ?? (mode.value === 'github' ? options.catalogError() : null)
  ));
  const catalogLoading = computed(() => {
    const status = options.catalogStatus();
    return loading.value || (
      mode.value === 'github' &&
      options.githubConnection().status === 'connected' &&
      status !== 'error' &&
      (status === 'loading' || options.catalog() === undefined)
    );
  });

  async function open(nextMode: 'github' | 'url'): Promise<void> {
    mode.value = nextMode;
    visible.value = true;
    error.value = null;
    repositories.value = [];
    if (nextMode === 'github' && options.githubConnection().status === 'connected') {
      await loadCatalog();
    }
  }

  function close(): void {
    visible.value = false;
    busy.value = false;
    error.value = null;
  }

  async function connect(): Promise<void> {
    await runBusy(options.connectGitHub);
  }

  async function openAuthorization(): Promise<void> {
    error.value = null;
    try {
      await options.openGitHubAuthorization();
    } catch (cause) {
      error.value = options.errorMessage(cause);
    }
  }

  async function loadCatalog(): Promise<void> {
    loading.value = true;
    try {
      repositories.value = await options.loadGitHubRepositories() ?? options.catalog() ?? [];
    } catch (cause) {
      error.value = options.errorMessage(cause);
    } finally {
      loading.value = false;
    }
  }

  async function select(repository: WorkRepository): Promise<void> {
    const identity = canonicalGitRemoteIdentity(repository.url);
    const local = identity
      ? options.sourceRepositories().find((candidate) => candidate.remoteIdentity === identity)
      : undefined;
    if (local) {
      close();
      await options.openRepository(local, selectedTeamId());
      return;
    }
    await cloneAndOpen(repository.url);
  }

  async function cloneAndOpen(url: string): Promise<void> {
    await runBusy(async () => {
      const team = options.activeTeam();
      const repository = await options.cloneRepository({
        url,
        ...(team?.remoteConnectionId ? { remoteConnectionId: team.remoteConnectionId } : {}),
      });
      close();
      await options.openRepository(repository, team?.id ?? options.activeTeamId());
    });
  }

  async function runBusy(action: () => Promise<void>): Promise<void> {
    busy.value = true;
    error.value = null;
    try {
      await action();
    } catch (cause) {
      error.value = options.errorMessage(cause);
    } finally {
      busy.value = false;
    }
  }

  function selectedTeamId(): string | undefined {
    return options.activeTeam()?.id ?? options.activeTeamId();
  }

  watch(options.catalog, (next) => {
    if (
      visible.value &&
      mode.value === 'github' &&
      options.githubConnection().status === 'connected' &&
      next
    ) {
      repositories.value = next;
    }
  });

  return {
    busy,
    catalogLoading,
    displayError,
    error,
    mode,
    repositories,
    visible,
    cloneAndOpen,
    close,
    connect,
    open,
    openAuthorization,
    select,
  };
}
