import { agentDisplayName } from '@codex-claw/core/agent-display';
import type {
  Agent,
  AgentGitBranchInput,
  AppSnapshot,
  CreateAgentInput,
  CreateSourceWorktreeInput,
  DuplicateAgentOptions,
  SourceRepository,
  SourceWorktree,
  Team,
  WorkItem,
  WorkItemQuery,
} from '@codex-claw/core/contracts';
import { findAssignedAgentForWorkItem } from '@codex-claw/core/work-assignments';
import {
  workItemAssignmentPrompt,
  workItemComposerPrompt,
  type WorkItemAssignmentAction,
} from '@codex-claw/core/work-item-prompts';
import { computed, ref } from 'vue';
import { translate } from '../i18n';
import type { RepositoryWorkStartInput } from './right-workspace';

export type WorkItemAssignmentIntent = {
  item: WorkItem;
  teamId?: string;
};

type WorkItemRoutingModel = {
  activeTeamId: () => string | undefined;
  composerText: () => string;
  currentAgent: () => Agent | null;
  snapshot: () => AppSnapshot;
  sourceRepositories: () => SourceRepository[];
};

type WorkItemRoutingActions = {
  assign: (payload: { agentId: string; item: WorkItem; prompt?: string }) => Promise<void>;
  assignFromUi: (payload: { agentId: string; item: WorkItem }) => void;
  createAgent: (input: CreateAgentInput) => Promise<Agent | null | void>;
  createBranch: (agentId: string, input: AgentGitBranchInput) => Promise<unknown>;
  createWorktree: (input: CreateSourceWorktreeInput) => Promise<SourceWorktree>;
  duplicateAgent: (agentId: string, options: DuplicateAgentOptions) => Promise<Agent | null>;
  loadItems: (
    provider: WorkItem['provider'],
    repositoryId: string,
    query: WorkItemQuery,
  ) => Promise<WorkItem[] | void>;
};

type WorkItemRoutingUi = {
  confirmReassignment: (message: string) => Promise<boolean>;
  focusComposer: () => void;
  openNewAgent: (teamId: string | undefined, sourceRepositoryName: string) => void;
  selectAgent: (agentId: string) => void;
  updateComposer: (agentId: string, text: string) => void;
};

export function useWorkItemRouting(options: {
  actions: WorkItemRoutingActions;
  model: WorkItemRoutingModel;
  ui: WorkItemRoutingUi;
}) {
  const pendingNewAgentItem = ref<WorkItem | null>(null);

  const newAgentTeamName = computed(() => (
    pendingNewAgentItem.value ? workItemTeamName(pendingNewAgentItem.value) : ''
  ));
  const newAgentWorktreeBranchName = computed(() => {
    const item = pendingNewAgentItem.value;
    if (!item) return '';
    return item.kind === 'pullRequest'
      ? item.branchName?.trim() || `review/gh-${item.number}`
      : `fix/gh-${item.number}`;
  });

  async function startRepositoryWork(agentId: string, input: RepositoryWorkStartInput): Promise<void> {
    const sourceAgent = findAgent(agentId);
    if (!sourceAgent) throw new Error(translate('surface.appShell.theSelectedAgentIsUnavailable'));

    const item = await resolvePullRequestBranch(input.item);
    const sourceAgentName = agentDisplayName(sourceAgent);
    const targetLabel = input.target === 'duplicate' ? `a duplicate of ${sourceAgentName}` : sourceAgentName;
    if (!await confirmAssignedOverride(item, targetLabel, input.target === 'current' ? sourceAgent.id : undefined)) {
      throw new Error(translate('surface.appShell.assignmentCancelled'));
    }

    const targetAgent = input.target === 'duplicate'
      ? await options.actions.duplicateAgent(sourceAgent.id, {
          select: false,
          name: `${sourceAgentName} gh-${item.number}`,
        })
      : sourceAgent;
    if (!targetAgent) throw new Error(translate('surface.appShell.theDuplicateAgentCouldNotBeCreated'));
    if (input.target === 'duplicate' && input.workspace.kind !== 'worktree') {
      throw new Error(translate('surface.appShell.aDuplicatedAgentRequiresANewWorktree'));
    }

    const pullRequestBranch = item.kind === 'pullRequest' ? item.branchName?.trim() : undefined;
    if (item.kind === 'pullRequest' && !pullRequestBranch) {
      throw new Error(translate('surface.appShell.gitHubDidNotReturnThePullRequestBranch'));
    }
    const checkoutBranch = pullRequestBranch
      ?? (input.workspace.kind === 'worktree' ? input.workspace.branchName : undefined);
    if (checkoutBranch) {
      await options.actions.createBranch(targetAgent.id, {
        name: checkoutBranch,
        createWorktree: input.workspace.kind === 'worktree',
        ...(item.kind === 'pullRequest' ? { pullRequestNumber: item.number } : {}),
        confirmed: true,
      });
    }
    await assignWithPrompt(targetAgent.id, item, input.action);
  }

  function prefill(agentId: string, item: WorkItem): void {
    const prompt = workItemComposerPrompt(item);
    const existingText = options.model.currentAgent()?.id === agentId
      ? options.model.composerText().trimEnd()
      : '';
    const text = existingText ? `${existingText}\n\n${prompt}` : prompt;
    options.ui.updateComposer(agentId, text);
    options.ui.selectAgent(agentId);
    options.ui.focusComposer();
  }

  async function openNewAgent(intent: WorkItemAssignmentIntent): Promise<void> {
    if (!await confirmAssignedOverride(intent.item, 'a new agent')) return;
    pendingNewAgentItem.value = intent.item;
    options.ui.openNewAgent(
      intent.teamId ?? options.model.activeTeamId(),
      workItemRepositoryName(intent.item),
    );
  }

  function clearNewAgent(): void {
    pendingNewAgentItem.value = null;
  }

  function assignCreatedAgent(agent: Agent | null | void): void {
    const item = pendingNewAgentItem.value;
    if (agent && item) options.actions.assignFromUi({ agentId: agent.id, item });
    clearNewAgent();
  }

  async function startMany(input: {
    action: WorkItemAssignmentAction;
    items: WorkItem[];
    teamId: string;
  }): Promise<void> {
    await Promise.all(input.items.map(async (listedItem) => {
      const { agent, item } = await createIsolatedAgent(listedItem, input.teamId);
      await assignWithPrompt(agent.id, item, input.action);
    }));
  }

  async function createIsolatedAgent(
    listedItem: WorkItem,
    teamId: string,
    creationOptions: { reuseExisting?: boolean } = {},
  ): Promise<{ agent: Agent; item: WorkItem }> {
    const team = options.model.snapshot().teams.find((candidate) => candidate.id === teamId);
    if (!team) throw new Error(translate('surface.appShell.theSelectedTeamIsUnavailable'));

    const item = await resolvePullRequestBranch(listedItem);
    const repositoryName = workItemRepositoryName(item);
    const repository = options.model.sourceRepositories().find((candidate) => candidate.name === repositoryName);
    if (!repository) throw new Error(`${item.repositoryFullName} is not available in the source folder.`);

    const worktree = await options.actions.createWorktree({
      repoPath: repository.path,
      branchName: workItemBranchName(item),
      ...(creationOptions.reuseExisting ? { reuseExisting: true } : {}),
      ...remoteConnection(team),
    });
    const agent = await options.actions.createAgent({
      name: null,
      folder: worktree.path,
      backend: 'codex',
      sourceRepositoryName: repository.name,
      teamId: team.id,
    });
    if (!agent) throw new Error(`Could not create an agent for ${item.repositoryFullName} #${item.number}.`);
    return { agent, item };
  }

  async function startInExistingSession(
    agentId: string,
    listedItem: WorkItem,
    action: WorkItemAssignmentAction,
  ): Promise<void> {
    const agent = findAgent(agentId);
    if (!agent) throw new Error(translate('surface.appShell.theSelectedAgentIsUnavailable'));
    const item = await resolvePullRequestBranch(listedItem);
    if (!await confirmAssignedOverride(item, agentDisplayName(agent), agent.id)) {
      throw new Error(translate('surface.appShell.assignmentCancelled'));
    }

    const branchName = workItemBranchName(item);
    if (agent.workspace?.kind !== 'git' || agent.workspace.branch !== branchName) {
      await options.actions.createBranch(agent.id, {
        name: branchName,
        createWorktree: false,
        ...(item.kind === 'pullRequest' ? { pullRequestNumber: item.number } : {}),
        confirmed: true,
      });
    }
    await assignWithPrompt(agent.id, item, action);
  }

  async function assignExisting(payload: { agentId: string; item: WorkItem }): Promise<void> {
    const targetAgent = findAgent(payload.agentId);
    if (!await confirmAssignedOverride(payload.item, targetAgent?.name ?? 'this agent', payload.agentId)) return;
    options.actions.assignFromUi(payload);
  }

  async function resolvePullRequestBranch(item: WorkItem): Promise<WorkItem> {
    if (item.kind !== 'pullRequest' || item.branchName?.trim()) return item;
    const refreshedItems = await options.actions.loadItems(item.provider, item.repositoryId, {
      kind: 'pullRequest',
      state: 'all',
    });
    return refreshedItems?.find((candidate) => candidate.id === item.id) ?? item;
  }

  async function confirmAssignedOverride(
    item: WorkItem,
    targetLabel: string,
    targetAgentId?: string,
  ): Promise<boolean> {
    const assignedAgent = findAssignedAgentForWorkItem(
      options.model.snapshot().agents,
      options.model.snapshot().workBacklog.assignments,
      item,
    );
    if (!assignedAgent || assignedAgent.id === targetAgentId) return true;
    return options.ui.confirmReassignment(
      `${workProviderTitle(item.provider)} #${item.number} is already assigned to ${assignedAgent.name}. We don't know if ${assignedAgent.name} is still working on it. Assign it to ${targetLabel} anyway?`,
    );
  }

  function findAgent(agentId: string): Agent | null {
    return options.model.snapshot().agents.find((candidate) => candidate.id === agentId) ?? null;
  }

  async function assignWithPrompt(
    agentId: string,
    item: WorkItem,
    action: WorkItemAssignmentAction,
  ): Promise<void> {
    await options.actions.assign({
      agentId,
      item,
      prompt: workItemAssignmentPrompt(item, { action }),
    });
  }

  return {
    assignCreatedAgent,
    assignExisting,
    clearNewAgent,
    createIsolatedAgent,
    newAgentItem: pendingNewAgentItem,
    newAgentTeamName,
    newAgentWorktreeBranchName,
    openNewAgent,
    prefill,
    startInExistingSession,
    startMany,
    startRepositoryWork,
  };
}

function workItemBranchName(item: WorkItem): string {
  const branchName = item.kind === 'pullRequest' ? item.branchName?.trim() : `fix/gh-${item.number}`;
  if (!branchName) throw new Error(`GitHub did not return the branch for ${item.repositoryFullName} #${item.number}.`);
  return branchName;
}

function workItemRepositoryName(item: WorkItem): string {
  return item.repositoryFullName.split('/').filter(Boolean).at(-1) ?? item.repositoryFullName;
}

function workItemTeamName(item: WorkItem): string {
  return `${workProviderTitle(item.provider)} #${item.number}`;
}

function workProviderTitle(provider: WorkItem['provider']): string {
  return provider === 'github' ? translate('surface.appShell.gitHub') : provider;
}

function remoteConnection(team: Team): { remoteConnectionId?: string } {
  const remoteConnectionId = team.remoteConnectionId?.trim();
  return remoteConnectionId ? { remoteConnectionId } : {};
}
