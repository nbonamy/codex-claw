import type {
  Agent,
  AppSnapshot,
  Automation,
  AutomationExecutionLogEntry,
  AutomationRepositoryTarget,
  CreateSourceWorktreeInput,
  SourceWorktree,
  WorkItem,
  WorkProviderKind,
} from '@codex-claw/core/contracts';
import { assignWorkItemToAgentInSnapshot, createAgentInSnapshot } from '@codex-claw/core/agent-manager';
import { agentDisplayName } from '@codex-claw/core/agent-display';
import { recordAutomationExecutionInSnapshot } from '@codex-claw/core/automation-manager';
import { createEntityId, type IdGenerator } from '@codex-claw/core/ids';
import { workItemAssignmentKey } from '@codex-claw/core/work-assignments';
import { workItemAssignmentPrompt, workItemBranchName, workItemDisplayIdentifier, workProviderLabel } from '@codex-claw/core/work-item-prompts';
import { logMain, warnMain } from '../log';

type WorkItemLister = {
  listItems(provider: WorkProviderKind, repositoryId: string): Promise<WorkItem[]>;
};

type AutomationPromptContext = {
  automationId: string;
  executionId: string;
  workItemId: string;
};

export type AutomationRunnerOptions = {
  getSnapshot: () => AppSnapshot;
  listWorkItems: WorkItemLister;
  notifySnapshotUpdated: () => void;
  saveSnapshot: () => Promise<void>;
  sendPrompt: (agentId: string, prompt: string, context: AutomationPromptContext) => Promise<unknown>;
  selectWorkItems?: (automation: Automation, candidates: WorkItem[]) => Promise<WorkItem[]>;
  createWorktree: (input: CreateSourceWorktreeInput) => Promise<SourceWorktree>;
  createExecutionId?: IdGenerator;
  now?: () => Date;
  requireConnectedEngine?: (backend: Agent['backend']) => Promise<unknown>;
};

type CreatedAutomationAssignment = {
  agent: Agent;
  item: WorkItem;
};

export class AutomationRunner {
  private readonly pendingAssignments = new Set<string>();
  constructor(private readonly options: AutomationRunnerOptions) {}

  async runAll(): Promise<void> {
    const now = this.now();
    const automations = [...this.snapshot().automations].filter((automation) => automationIsDue(automation, now));
    for (const automation of automations) {
      await this.runAutomation(automation.id);
    }
  }

  async runAutomation(automationId: string): Promise<void> {
    const automation = this.snapshot().automations.find((candidate) => candidate.id === automationId);
    if (!automation || !automation.enabled) {
      logMain('automation-runner', 'skipped', {
        automationId,
        reason: automation ? 'disabled' : 'missing',
      });
      return;
    }

    const executionId = this.createExecutionId();
    const startedAt = this.now().toISOString();
    const createdAssignments: CreatedAutomationAssignment[] = [];
    logMain('automation-runner', 'started', {
      automationId: automation.id,
      executionId,
      repositoryCount: automation.repositories.length,
    });
    try {
      await this.options.requireConnectedEngine?.(automation.backend ?? 'codex');
      await this.createAssignmentsForAutomation(automation, executionId, startedAt, createdAssignments);
      if (createdAssignments.length === 0) {
        automation.lastRunAt = startedAt;
        automation.lastCreatedCount = 0;
        automation.updatedAt = startedAt;
        delete automation.lastError;
        await this.publishSnapshotUpdate();
        logMain('automation-runner', 'completed without assignments', {
          automationId: automation.id,
          executionId,
        });
        return;
      }
      const entry = createAutomationExecutionEntry(automation.id, executionId, startedAt, 'working', createdAssignments);
      recordAutomationExecutionInSnapshot(this.snapshot(), automation.id, entry);
      await this.publishSnapshotUpdate();
      logMain('automation-runner', 'recorded assignments', {
        automationId: automation.id,
        executionId,
        createdCount: createdAssignments.length,
      });

      let promptError: string | null = null;
      for (const assignment of createdAssignments) {
        const workItemId = workItemAssignmentKey(assignment.item);
        try {
          logMain('automation-runner', 'dispatching prompt', {
            automationId: automation.id,
            executionId,
            agentId: assignment.agent.id,
            workItemId,
          });
          await this.options.sendPrompt(
            assignment.agent.id,
            workItemAssignmentPrompt(assignment.item, {
              assignment: automation.assignmentPrompt,
              completionPolicy: 'complete',
            }),
            {
              automationId: automation.id,
              executionId,
              workItemId,
            },
          );
        } catch (error) {
          promptError = error instanceof Error ? error.message : String(error);
          warnMain('automation-runner', 'prompt dispatch failed', {
            automationId: automation.id,
            executionId,
            agentId: assignment.agent.id,
            workItemId,
            message: promptError,
          });
        }
      }

      if (promptError) {
        recordAutomationExecutionInSnapshot(this.snapshot(), automation.id, {
          ...entry,
          completedAt: this.now().toISOString(),
          status: 'failed',
          error: promptError,
        });
        await this.publishSnapshotUpdate();
        warnMain('automation-runner', 'failed', {
          automationId: automation.id,
          executionId,
          createdCount: createdAssignments.length,
          message: promptError,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordAutomationExecutionInSnapshot(
        this.snapshot(),
        automation.id,
        createAutomationExecutionEntry(
          automation.id,
          executionId,
          startedAt,
          'failed',
          createdAssignments,
          message,
          this.now().toISOString(),
        ),
      );
      await this.publishSnapshotUpdate();
      warnMain('automation-runner', 'failed', {
        automationId: automation.id,
        executionId,
        createdCount: createdAssignments.length,
        message,
      });
    }
  }

  private async createAssignmentsForAutomation(
    automation: Automation,
    executionId: string,
    createdAt: string,
    createdAssignments: CreatedAutomationAssignment[],
  ): Promise<void> {
    const candidates: Array<{ item: WorkItem; repository: AutomationRepositoryTarget }> = [];
    const seen = new Set<string>();
    for (const repository of automation.repositories) {
      if (!repository.sourceRepositoryPath.trim()) throw new Error(`Choose a code repository for ${repository.repositoryId}.`);
      const items = await this.options.listWorkItems.listItems(repository.provider, repository.repositoryId);
      const matchingItems = matchingAutomationItems(items, repository);
      logMain('automation-runner', 'listed work items', {
        automationId: automation.id,
        executionId,
        repositoryId: repository.repositoryId,
        itemCount: items.length,
        matchingCount: matchingItems.length,
      });

      for (const item of matchingItems) {
        const assignmentKey = workItemAssignmentKey(item);
        const existingAssignment = this.snapshot().workBacklog.assignments[assignmentKey];
        if (existingAssignment || seen.has(assignmentKey) || this.pendingAssignments.has(assignmentKey)) {
          logMain('automation-runner', 'skipped already assigned item', {
            automationId: automation.id,
            executionId,
            workItemId: assignmentKey,
          });
          continue;
        }
        seen.add(assignmentKey);
        candidates.push({ item, repository });
      }
    }

    if (candidates.length === 0) return;
    const selectedItems = automation.selectionPrompt
      ? await this.requireWorkItemSelector()(automation, candidates.map(({ item }) => item))
      : candidates.map(({ item }) => item);
    const selectedIds = new Set(selectedItems.map(workItemAssignmentKey));
    for (const { item, repository } of candidates) {
      const assignmentKey = workItemAssignmentKey(item);
      if (!selectedIds.has(assignmentKey) || this.snapshot().workBacklog.assignments[assignmentKey] || this.pendingAssignments.has(assignmentKey)) continue;
      this.pendingAssignments.add(assignmentKey);
      try {
        const agent = await this.createAgentForAutomation(automation, repository, item, createdAt);
        if (!agent) continue;

        assignWorkItemToAgentInSnapshot(this.snapshot(), agent.id, item, createdAt, {
          automationExecutionId: executionId,
          automationId: automation.id,
          policy: 'complete',
        });
        createdAssignments.push({ agent, item });
        logMain('automation-runner', 'created assignment', {
          automationId: automation.id,
          executionId,
          agentId: agent.id,
          workItemId: assignmentKey,
        });
      } finally {
        this.pendingAssignments.delete(assignmentKey);
      }
    }
  }

  private requireWorkItemSelector(): NonNullable<AutomationRunnerOptions['selectWorkItems']> {
    if (!this.options.selectWorkItems) {
      throw new Error('Automation work item selection is not available.');
    }
    return this.options.selectWorkItems;
  }

  private async createAgentForAutomation(
    automation: Automation,
    repository: AutomationRepositoryTarget,
    item: WorkItem,
    createdAt: string,
  ): Promise<Agent | null> {
    const team = this.snapshot().teams.find((candidate) => candidate.id === automation.teamId);
    if (!team || team.remoteConnectionId) {
      throw new Error(`Team is no longer available for automation "${automation.name}".`);
    }

    const worktree = await this.options.createWorktree({
      repoPath: repository.sourceRepositoryPath,
      branchName: automationBranchName(item),
      reuseExisting: true,
    });
    if (this.snapshot().workBacklog.assignments[workItemAssignmentKey(item)]) return null;
    const previousAgentIds = new Set(this.snapshot().agents.map((agent) => agent.id));
    createAgentInSnapshot(
      this.snapshot(),
      {
        name: dedicatedTeamName(item),
        folder: worktree.path,
        backend: automation.backend ?? 'codex',
        teamId: team.id,
      },
      createdAt,
      undefined,
      { select: false },
    );
    const agent = this.snapshot().agents.find((candidate) => !previousAgentIds.has(candidate.id));
    if (!agent) {
      throw new Error(`Agent could not be created for automation "${automation.name}".`);
    }
    return agent;
  }

  private async publishSnapshotUpdate(): Promise<void> {
    await this.options.saveSnapshot();
    this.options.notifySnapshotUpdated();
  }

  private snapshot(): AppSnapshot {
    return this.options.getSnapshot();
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private createExecutionId(): string {
    return this.options.createExecutionId?.() ?? createEntityId('automation-exec');
  }
}

export function matchingAutomationItems(items: WorkItem[], repository: AutomationRepositoryTarget): WorkItem[] {
  return items.filter((item) => {
    return item.provider === repository.provider && item.repositoryId === repository.repositoryId && item.state === 'open';
  });
}

export function automationIsDue(automation: Automation, now: Date): boolean {
  if (!automation.enabled) return false;
  if (!automation.lastRunAt) return true;
  const lastRunAt = new Date(automation.lastRunAt).getTime();
  return !Number.isFinite(lastRunAt) || now.getTime() - lastRunAt >= automation.schedule.intervalMinutes * 60_000;
}

function dedicatedTeamName(item: WorkItem): string {
  return `${workProviderLabel(item.provider)} ${workItemDisplayIdentifier(item)}`;
}

function automationBranchName(item: WorkItem): string {
  if (item.provider === 'linear') return workItemBranchName(item).replace(/^fix\//, 'automation/');
  return `automation/${item.provider}-${item.number}`;
}

function createAutomationExecutionEntry(
  automationId: string,
  executionId: string,
  startedAt: string,
  status: AutomationExecutionLogEntry['status'],
  assignments: CreatedAutomationAssignment[],
  error?: string,
  completedAt?: string,
): AutomationExecutionLogEntry {
  return {
    id: executionId,
    automationId,
    startedAt,
    status,
    createdCount: assignments.length,
    createdAgents: assignments.map(({ agent, item }) => ({
      agentId: agent.id,
      agentName: agentDisplayName(agent),
      workItemId: workItemAssignmentKey(item),
      ...(item.identifier ? { workItemIdentifier: item.identifier } : {}),
      workItemTitle: item.title,
      workItemUrl: item.url,
    })),
    ...(completedAt ? { completedAt } : {}),
    ...(error ? { error } : {}),
  };
}
