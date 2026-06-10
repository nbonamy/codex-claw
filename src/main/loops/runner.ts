import type { Agent, AppSnapshot, Loop, LoopExecutionLogEntry, WorkItem, WorkProviderKind } from '../../shared/contracts';
import { assignWorkItemToAgentInSnapshot, deployBenchTemplateInSnapshot } from '../../shared/agent-manager';
import { recordLoopExecutionInSnapshot } from '../../shared/loop-manager';
import { createEntityId, type IdGenerator } from '../../shared/ids';
import { defaultTeamColor } from '../../shared/team-colors';
import { createTeamInSnapshot } from '../../shared/team-manager';
import { workItemAssignmentKey } from '../../shared/work-assignments';
import { workItemAssignmentPrompt, workProviderLabel } from '../../shared/work-item-prompts';

type WorkItemLister = {
  listItems(provider: WorkProviderKind, repositoryId: string): Promise<WorkItem[]>;
};

export type LoopPromptContext = {
  loopId: string;
  executionId: string;
  workItemId: string;
};

export type LoopRunnerOptions = {
  getSnapshot: () => AppSnapshot;
  listWorkItems: WorkItemLister;
  notifySnapshotUpdated: () => void;
  saveSnapshot: () => Promise<void>;
  sendPrompt: (agentId: string, prompt: string, context: LoopPromptContext) => Promise<unknown>;
  createExecutionId?: IdGenerator;
  now?: () => Date;
};

type CreatedLoopAssignment = {
  agent: Agent;
  item: WorkItem;
};

export class LoopRunner {
  constructor(private readonly options: LoopRunnerOptions) {}

  async runAll(): Promise<void> {
    const loops = [...this.snapshot().loops].filter((loop) => loop.enabled);
    for (const loop of loops) {
      await this.runLoop(loop.id);
    }
  }

  async runLoop(loopId: string): Promise<void> {
    const loop = this.snapshot().loops.find((candidate) => candidate.id === loopId);
    if (!loop || !loop.enabled) {
      return;
    }

    const executionId = this.createExecutionId();
    const startedAt = this.now().toISOString();
    const createdAssignments: CreatedLoopAssignment[] = [];
    try {
      await this.createAssignmentsForLoop(loop, startedAt, createdAssignments);
      if (createdAssignments.length === 0) {
        return;
      }
      const completedAt = this.now().toISOString();
      const entry = createLoopExecutionEntry(loop.id, executionId, startedAt, completedAt, 'completed', createdAssignments);
      recordLoopExecutionInSnapshot(this.snapshot(), loop.id, entry);
      await this.publishSnapshotUpdate();

      let promptError: string | null = null;
      for (const assignment of createdAssignments) {
        try {
          await this.options.sendPrompt(assignment.agent.id, workItemAssignmentPrompt(assignment.item), {
            loopId: loop.id,
            executionId,
            workItemId: workItemAssignmentKey(assignment.item),
          });
        } catch (error) {
          promptError = error instanceof Error ? error.message : String(error);
        }
      }

      if (promptError) {
        recordLoopExecutionInSnapshot(this.snapshot(), loop.id, {
          ...entry,
          completedAt: this.now().toISOString(),
          status: 'failed',
          error: promptError,
        });
        await this.publishSnapshotUpdate();
      }
    } catch (error) {
      recordLoopExecutionInSnapshot(this.snapshot(), loop.id, createLoopExecutionEntry(
        loop.id,
        executionId,
        startedAt,
        this.now().toISOString(),
        'failed',
        createdAssignments,
        error instanceof Error ? error.message : String(error),
      ));
      await this.publishSnapshotUpdate();
    }
  }

  private async createAssignmentsForLoop(loop: Loop, createdAt: string, createdAssignments: CreatedLoopAssignment[]): Promise<void> {
    const items = await this.options.listWorkItems.listItems(loop.source.provider, loop.source.repositoryId);

    for (const item of matchingLoopItems(items, loop)) {
      const assignmentKey = workItemAssignmentKey(item);
      if (this.snapshot().workBacklog.assignments[assignmentKey] || (loop.processedWorkItemIds ?? []).includes(assignmentKey)) {
        continue;
      }

      const teamId = this.resolveTargetTeamId(loop, item, createdAt);
      const agent = deployBenchTemplateInSnapshot(
        this.snapshot(),
        loop.action.benchTemplateId,
        teamId,
        createdAt,
        undefined,
        { select: false },
      );
      if (!agent) {
        throw new Error(`Bench agent is no longer available for loop "${loop.name}".`);
      }

      assignWorkItemToAgentInSnapshot(this.snapshot(), agent.id, item, createdAt);
      createdAssignments.push({ agent, item });
    }
  }

  private resolveTargetTeamId(loop: Loop, item: WorkItem, createdAt: string): string {
    const teamTarget = loop.action.teamTarget;
    if (teamTarget.mode === 'existing') {
      const team = this.snapshot().teams.find((candidate) => candidate.id === teamTarget.teamId);
      if (!team) {
        throw new Error(`Team is no longer available for loop "${loop.name}".`);
      }
      return team.id;
    }

    const team = createTeamInSnapshot(this.snapshot(), {
      name: dedicatedTeamName(item),
      color: defaultTeamColor,
    }, createdAt, { select: false });
    return team.id;
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
    return this.options.createExecutionId?.() ?? createEntityId('loop-exec');
  }
}

export function matchingLoopItems(items: WorkItem[], loop: Loop): WorkItem[] {
  const selectedTagName = loop.source.tagName;
  return items.filter((item) => {
    if (item.provider !== loop.source.provider || item.repositoryId !== loop.source.repositoryId || item.state !== 'open') {
      return false;
    }

    if (!selectedTagName) {
      return true;
    }

    return item.labels.some((label) => label.name === selectedTagName);
  });
}

function dedicatedTeamName(item: WorkItem): string {
  return `${workProviderLabel(item.provider)} #${item.number}`;
}

function createLoopExecutionEntry(
  loopId: string,
  executionId: string,
  startedAt: string,
  completedAt: string,
  status: LoopExecutionLogEntry['status'],
  assignments: CreatedLoopAssignment[],
  error?: string,
): LoopExecutionLogEntry {
  return {
    id: executionId,
    loopId,
    startedAt,
    completedAt,
    status,
    createdCount: assignments.length,
    createdAgents: assignments.map(({ agent, item }) => ({
      agentId: agent.id,
      agentName: agent.name,
      workItemId: workItemAssignmentKey(item),
      workItemTitle: item.title,
      workItemUrl: item.url,
    })),
    ...(error ? { error } : {}),
  };
}
