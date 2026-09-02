import type {
  AppSnapshot,
  CloneSourceRepositoryInput,
  CreateSourceWorktreeInput,
  SourceBranch,
  SourceRepository,
  SourceWorktree,
} from '@codex-claw/core/contracts';
import { ref } from 'vue';
import { translate } from './i18n';
import { codexClawApi } from './platform-api';

type CatalogStatus = 'notLoaded' | 'loading' | 'loaded' | 'error';

export function createSourceRepositoryState(options: { getSnapshot: () => AppSnapshot }) {
  const repositories = ref<SourceRepository[]>([]);
  const status = ref<CatalogStatus>('notLoaded');
  const error = ref<string | null>(null);

  async function load(): Promise<void> {
    if (!codexClawApi?.listSourceRepositories || !options.getSnapshot().sourceFolder.path) {
      repositories.value = [];
      status.value = 'notLoaded';
      error.value = null;
      return;
    }
    status.value = 'loading';
    error.value = null;
    try {
      repositories.value = await codexClawApi.listSourceRepositories();
      status.value = 'loaded';
    } catch (caught) {
      repositories.value = [];
      status.value = 'error';
      error.value = caught instanceof Error ? caught.message : String(caught);
    }
  }

  async function list(remoteConnectionId?: string): Promise<SourceRepository[]> {
    return codexClawApi?.listSourceRepositories?.(remoteConnectionId) ?? [];
  }

  async function clone(input: CloneSourceRepositoryInput): Promise<SourceRepository> {
    if (!codexClawApi?.cloneSourceRepository) {
      throw new Error(translate('surface.app-state.repositoryCloningIsNotAvailable'));
    }
    const repository = await codexClawApi.cloneSourceRepository(input);
    await load();
    return repository;
  }

  async function createWorktree(input: CreateSourceWorktreeInput): Promise<SourceWorktree> {
    if (!codexClawApi?.createSourceWorktree) {
      throw new Error(translate('surface.app-state.sourceWorktreeCreationIsNotAvailable'));
    }
    const worktree = await codexClawApi.createSourceWorktree(input);
    await load();
    return worktree;
  }

  async function listBranches(repoPath: string, remoteConnectionId?: string): Promise<SourceBranch[]> {
    return codexClawApi?.listSourceBranches?.(repoPath, remoteConnectionId) ?? [];
  }

  async function listWorktrees(repoPath: string, remoteConnectionId?: string): Promise<SourceWorktree[]> {
    return codexClawApi?.listSourceWorktrees?.(repoPath, remoteConnectionId) ?? [];
  }

  return {
    clone,
    createWorktree,
    error,
    list,
    listBranches,
    listWorktrees,
    load,
    repositories,
    status,
  };
}
