import { agentDisplayName } from '@codex-claw/core/agent-display';
import type {
  Agent,
  AppSnapshot,
  AutomationLocation,
  CreateAgentInput,
  CreateSourceWorktreeInput,
  SourceBranch,
  SourceRepository,
  SourceWorktree,
  WorkItem,
  WorkRepository,
} from '@codex-claw/core/contracts';
import { workItemAssignmentPrompt } from '@codex-claw/core/work-item-prompts';
import { computed, ref } from 'vue';
import { translate } from '../i18n';
import type { WorkItemAssignmentSelection, WorkItemAssignmentSession } from './WorkItemAssignmentPicker.vue';
import { resolveRepositorySessionContext, type RepositorySessionSource } from './repository-session-context';

export function useRepositorySession(options: {
  activeTeamId: () => string | undefined;
  assignWorkItem: (payload: { agentId: string; item: WorkItem; prompt?: string }) => Promise<void>;
  createAgent: (input: CreateAgentInput) => Promise<Agent | null | void>;
  createIsolatedWorkItemAgent: (
    item: WorkItem,
    teamId: string,
    options?: { reuseExisting?: boolean },
  ) => Promise<{ agent: Agent; item: WorkItem }>;
  createSourceWorktree: (input: CreateSourceWorktreeInput) => Promise<SourceWorktree>;
  getSnapshot: () => AppSnapshot;
  getWorkRepositories: () => WorkRepository[];
  listSourceBranches: (repoPath: string, remoteConnectionId?: string) => Promise<SourceBranch[]>;
  loadWorkItems: (repositoryId: string, location?: AutomationLocation) => Promise<WorkItem[]>;
  loadWorkRepositories: (location?: AutomationLocation) => Promise<WorkRepository[]>;
  notifyError: (message: string) => void;
  prefillWorkItemForAgent: (agentId: string, item: WorkItem) => void;
  startWorkItemInExistingSession: (
    agentId: string,
    item: WorkItem,
    action: WorkItemAssignmentSelection['action'],
  ) => Promise<void>;
  suggestSourceWorktreePath: (input: Pick<CreateSourceWorktreeInput, 'branchName' | 'repoPath' | 'remoteConnectionId'>) => Promise<string>;
}) {
  const source = ref<RepositorySessionSource | null>(null);
  const visible = ref(false);
  const branches = ref<SourceBranch[]>([]);
  const workItems = ref<WorkItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const assignmentState = ref<'idle' | 'running' | 'success' | 'error'>('idle');
  const assignmentError = ref<string | null>(null);
  const worktreeSource = ref<RepositorySessionSource | null>(null);
  const worktreeBranches = ref<SourceBranch[]>([]);
  const worktreeBranchesLoading = ref(false);
  let sourceRequestId = 0;
  let worktreeRequestId = 0;

  const assignmentSessions = computed<WorkItemAssignmentSession[]>(() => {
    const current = source.value;
    if (!current) return [];
    const { teamId } = context(current);
    return options.getSnapshot().agents
      .filter((agent) => (!teamId || agent.teamId === teamId)
        && agent.workspace?.kind === 'git'
        && agent.workspace.primaryWorktreeRoot === current.repositoryRoot)
      .map((agent) => ({
        agentId: agent.id,
        label: agent.workspace?.kind === 'git' && agent.workspace.branch
          ? `${agentDisplayName(agent)} · ${agent.workspace.branch}`
          : agentDisplayName(agent),
      }));
  });
  const worktreeRepository = computed<SourceRepository | null>(() => {
    const current = worktreeSource.value;
    return current ? { name: current.repositoryName, path: current.repositoryRoot, worktrees: [] } : null;
  });

  async function open(nextSource: RepositorySessionSource): Promise<void> {
    const requestId = ++sourceRequestId;
    source.value = nextSource;
    visible.value = true;
    branches.value = [];
    workItems.value = [];
    error.value = null;
    assignmentState.value = 'idle';
    assignmentError.value = null;
    loading.value = true;
    const { remoteConnectionId, location } = context(nextSource);
    try {
      const loadedBranches = await options.listSourceBranches(nextSource.repositoryRoot, remoteConnectionId || undefined);
      if (requestId !== sourceRequestId) return;
      branches.value = loadedBranches;
      try {
        const repositories = await options.loadWorkRepositories(location);
        if (requestId !== sourceRequestId) return;
        const workRepository = (repositories.length > 0 ? repositories : options.getWorkRepositories())
          .find((repository) => (
            repository.name === nextSource.repositoryName ||
            repository.fullName.endsWith(`/${nextSource.repositoryName}`)
          ));
        if (workRepository) workItems.value = await options.loadWorkItems(workRepository.id, location);
      } catch {
        workItems.value = [];
      }
    } catch (caught) {
      if (requestId !== sourceRequestId) return;
      error.value = caught instanceof Error ? caught.message : String(caught);
    } finally {
      if (requestId === sourceRequestId) loading.value = false;
    }
  }

  function close(): void {
    sourceRequestId += 1;
    visible.value = false;
    source.value = null;
    loading.value = false;
    error.value = null;
    assignmentState.value = 'idle';
    assignmentError.value = null;
  }

  async function listBranches(input: { agentId: string; repositoryRoot: string }): Promise<SourceBranch[]> {
    const { remoteConnectionId } = context({ agentId: input.agentId });
    return options.listSourceBranches(input.repositoryRoot, remoteConnectionId);
  }

  function createOnBranch(payload: RepositorySessionSource & { branch: SourceBranch }): void {
    const { branch, ...nextSource } = payload;
    void createSession(nextSource, branch, context(nextSource).teamId);
  }

  async function openWorktree(nextSource: RepositorySessionSource): Promise<void> {
    const requestId = ++worktreeRequestId;
    worktreeSource.value = nextSource;
    worktreeBranches.value = [];
    worktreeBranchesLoading.value = true;
    const { remoteConnectionId } = context(nextSource);
    try {
      const loaded = await options.listSourceBranches(nextSource.repositoryRoot, remoteConnectionId || undefined);
      if (requestId === worktreeRequestId) worktreeBranches.value = loaded;
    } catch (caught) {
      if (requestId === worktreeRequestId) {
        options.notifyError(caught instanceof Error ? caught.message : String(caught));
        worktreeSource.value = null;
      }
    } finally {
      if (requestId === worktreeRequestId) worktreeBranchesLoading.value = false;
    }
  }

  function closeWorktree(): void {
    worktreeRequestId += 1;
    worktreeSource.value = null;
    worktreeBranches.value = [];
    worktreeBranchesLoading.value = false;
  }

  async function createWorktree(input: CreateSourceWorktreeInput): Promise<SourceWorktree> {
    const { remoteConnectionId } = context(worktreeSource.value);
    return options.createSourceWorktree({ ...input, ...(remoteConnectionId ? { remoteConnectionId } : {}) });
  }

  async function suggestWorktreePath(
    input: Pick<CreateSourceWorktreeInput, 'branchName' | 'repoPath'>,
  ): Promise<string> {
    const { remoteConnectionId } = context(worktreeSource.value);
    return options.suggestSourceWorktreePath({ ...input, ...(remoteConnectionId ? { remoteConnectionId } : {}) });
  }

  async function createFromWorktree(worktree: SourceWorktree): Promise<void> {
    const nextSource = worktreeSource.value;
    closeWorktree();
    if (!nextSource) return;
    const { teamId } = context(nextSource);
    try {
      await options.createAgent({
        name: null,
        folder: worktree.path,
        backend: 'codex',
        sourceRepositoryName: nextSource.repositoryName,
        ...(teamId ? { teamId } : {}),
      });
    } catch (caught) {
      options.notifyError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function createForSourceBranch(branch: SourceBranch): void {
    const current = source.value;
    if (current) void createSession(current, branch, context(current).teamId);
  }

  async function startWork(selection: WorkItemAssignmentSelection): Promise<void> {
    const current = source.value;
    if (!current) return;
    const { teamId } = context(current);
    assignmentState.value = 'running';
    assignmentError.value = null;
    try {
      if (selection.destination === 'existing') {
        if (!selection.agentId) throw new Error(translate('surface.appShell.theSelectedAgentIsUnavailable'));
        await options.startWorkItemInExistingSession(selection.agentId, selection.item, selection.action);
      } else {
        if (!teamId) throw new Error(translate('surface.appShell.createOrSelectATeamBeforeStartingRepositoryWork'));
        const { agent, item } = await options.createIsolatedWorkItemAgent(
          selection.item,
          teamId,
          selection.reuseExisting ? { reuseExisting: true } : {},
        );
        await options.assignWorkItem({
          agentId: agent.id,
          item,
          prompt: workItemAssignmentPrompt(item, { action: selection.action }),
        });
      }
      assignmentState.value = 'success';
    } catch (caught) {
      assignmentState.value = 'error';
      assignmentError.value = caught instanceof Error ? caught.message : String(caught);
    }
  }

  async function customizeWork(selection: Omit<WorkItemAssignmentSelection, 'action'>): Promise<void> {
    const current = source.value;
    if (!current) return;
    const { teamId } = context(current);
    assignmentState.value = 'running';
    assignmentError.value = null;
    try {
      if (selection.destination === 'existing') {
        if (!selection.agentId) throw new Error(translate('surface.appShell.theSelectedAgentIsUnavailable'));
        options.prefillWorkItemForAgent(selection.agentId, selection.item);
      } else {
        if (!teamId) throw new Error(translate('surface.appShell.createOrSelectATeamBeforeStartingRepositoryWork'));
        const { agent, item } = await options.createIsolatedWorkItemAgent(
          selection.item,
          teamId,
          selection.reuseExisting ? { reuseExisting: true } : {},
        );
        options.prefillWorkItemForAgent(agent.id, item);
      }
      close();
    } catch (caught) {
      assignmentState.value = 'error';
      assignmentError.value = caught instanceof Error ? caught.message : String(caught);
    }
  }

  async function createSession(nextSource: RepositorySessionSource, branch: SourceBranch, teamId?: string): Promise<void> {
    close();
    try {
      const { remoteConnectionId } = context({ ...nextSource, teamId });
      const worktree = branch.worktreePath
        ? { name: branch.name, path: branch.worktreePath }
        : await options.createSourceWorktree({
            repoPath: nextSource.repositoryRoot,
            branchName: branch.name,
            ...(remoteConnectionId ? { remoteConnectionId } : {}),
          });
      await options.createAgent({
        name: null,
        folder: worktree.path,
        backend: 'codex',
        sourceRepositoryName: nextSource.repositoryName,
        ...(teamId ? { teamId } : {}),
      });
    } catch (caught) {
      options.notifyError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function context(current?: Pick<RepositorySessionSource, 'agentId' | 'teamId'> | null) {
    return resolveRepositorySessionContext(options.getSnapshot(), current, options.activeTeamId());
  }

  return {
    assignmentError,
    assignmentSessions,
    assignmentState,
    branches,
    close,
    closeWorktree,
    complete: close,
    createForSourceBranch,
    createFromWorktree,
    createOnBranch,
    createWorktree,
    customizeWork,
    error,
    listBranches,
    loading,
    open,
    openWorktree,
    source,
    startWork,
    suggestWorktreePath,
    visible,
    workItems,
    worktreeBranches,
    worktreeBranchesLoading,
    worktreeRepository,
    worktreeSource,
  };
}
