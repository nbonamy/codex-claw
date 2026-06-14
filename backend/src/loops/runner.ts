import type { Agent, AppSnapshot, Loop, LoopExecutionLogEntry, WorkItem, WorkProviderKind } from '@codex-claw/shared/contracts';
import { assignWorkItemToAgentInSnapshot, deployBenchTemplateInSnapshot } from '@codex-claw/shared/agent-manager';
import { recordLoopExecutionInSnapshot } from '@codex-claw/shared/loop-manager';
import { createEntityId, type IdGenerator } from '@codex-claw/shared/ids';
import { createAgentInSnapshot } from '@codex-claw/shared/snapshot';
import { defaultTeamColor } from '@codex-claw/shared/team-colors';
import { createTeamInSnapshot } from '@codex-claw/shared/team-manager';
import { workItemAssignmentKey } from '@codex-claw/shared/work-assignments';
import { workItemAssignmentPrompt, workProviderLabel } from '@codex-claw/shared/work-item-prompts';
import path from 'node:path';
import { logMain, warnMain } from '../log';

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
      logMain('loop-runner', 'skipped', {
        loopId,
        reason: loop ? 'disabled' : 'missing',
      });
      return;
    }

    const executionId = this.createExecutionId();
    const startedAt = this.now().toISOString();
    const createdAssignments: CreatedLoopAssignment[] = [];
    logMain('loop-runner', 'started', {
      loopId: loop.id,
      executionId,
      provider: loop.source.provider,
      repositoryId: loop.source.repositoryId,
    });
    try {
      await this.createAssignmentsForLoop(loop, executionId, startedAt, createdAssignments);
      if (createdAssignments.length === 0) {
        logMain('loop-runner', 'completed without assignments', {
          loopId: loop.id,
          executionId,
        });
        return;
      }
      const entry = createLoopExecutionEntry(loop.id, executionId, startedAt, 'working', createdAssignments);
      recordLoopExecutionInSnapshot(this.snapshot(), loop.id, entry);
      await this.publishSnapshotUpdate();
      logMain('loop-runner', 'recorded assignments', {
        loopId: loop.id,
        executionId,
        createdCount: createdAssignments.length,
      });

      let promptError: string | null = null;
      for (const assignment of createdAssignments) {
        const workItemId = workItemAssignmentKey(assignment.item);
        try {
          logMain('loop-runner', 'dispatching prompt', {
            loopId: loop.id,
            executionId,
            agentId: assignment.agent.id,
            workItemId,
          });
          await this.options.sendPrompt(assignment.agent.id, workItemAssignmentPrompt(assignment.item, loop.instructions), {
            loopId: loop.id,
            executionId,
            workItemId,
          });
        } catch (error) {
          promptError = error instanceof Error ? error.message : String(error);
          warnMain('loop-runner', 'prompt dispatch failed', {
            loopId: loop.id,
            executionId,
            agentId: assignment.agent.id,
            workItemId,
            message: promptError,
          });
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
        warnMain('loop-runner', 'failed', {
          loopId: loop.id,
          executionId,
          createdCount: createdAssignments.length,
          message: promptError,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordLoopExecutionInSnapshot(this.snapshot(), loop.id, createLoopExecutionEntry(
        loop.id,
        executionId,
        startedAt,
        'failed',
        createdAssignments,
        message,
        this.now().toISOString(),
      ));
      await this.publishSnapshotUpdate();
      warnMain('loop-runner', 'failed', {
        loopId: loop.id,
        executionId,
        createdCount: createdAssignments.length,
        message,
      });
    }
  }

  private async createAssignmentsForLoop(loop: Loop, executionId: string, createdAt: string, createdAssignments: CreatedLoopAssignment[]): Promise<void> {
    const items = await this.options.listWorkItems.listItems(loop.source.provider, loop.source.repositoryId);
    const matchingItems = matchingLoopItems(items, loop);
    logMain('loop-runner', 'listed work items', {
      loopId: loop.id,
      executionId,
      itemCount: items.length,
      matchingCount: matchingItems.length,
    });

    for (const item of matchingItems) {
      const assignmentKey = workItemAssignmentKey(item);
      if (this.snapshot().workBacklog.assignments[assignmentKey]?.status === 'working') {
        logMain('loop-runner', 'skipped already assigned item', {
          loopId: loop.id,
          executionId,
          workItemId: assignmentKey,
        });
        continue;
      }

      const teamId = this.resolveTargetTeamId(loop, item, createdAt);
      const agent = this.createAgentForLoop(loop, item, teamId, createdAt);
      if (!agent) {
        throw new Error(`Agent configuration is no longer available for loop "${loop.name}".`);
      }

      assignWorkItemToAgentInSnapshot(this.snapshot(), agent.id, item, createdAt, {
        loopExecutionId: executionId,
        loopId: loop.id,
      });
      createdAssignments.push({ agent, item });
      logMain('loop-runner', 'created assignment', {
        loopId: loop.id,
        executionId,
        agentId: agent.id,
        workItemId: assignmentKey,
      });
    }
  }

  private createAgentForLoop(loop: Loop, item: WorkItem, teamId: string, createdAt: string): Agent | null {
    if (loop.action.type === 'create-agent-from-bench') {
      return deployBenchTemplateInSnapshot(
        this.snapshot(),
        loop.action.benchTemplateId,
        teamId,
        createdAt,
        undefined,
        { select: false },
      );
    }

    const previousAgentIds = new Set(this.snapshot().agents.map((agent) => agent.id));
    createAgentInSnapshot(this.snapshot(), {
      name: dedicatedTeamName(item),
      folder: loop.action.sourceRepositoryPath,
      backend: loop.action.backend ?? 'codex',
      backendDefaults: loop.action.backendDefaults,
      teamId,
    }, createdAt, undefined, { select: false });
    return this.snapshot().agents.find((agent) => !previousAgentIds.has(agent.id)) ?? null;
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
  const selectedAssigneeLogin = loop.source.assigneeLogin;
  const selectedTagName = loop.source.tagName;
  return items.filter((item) => {
    if (item.provider !== loop.source.provider || item.repositoryId !== loop.source.repositoryId || item.state !== 'open') {
      return false;
    }

    if (selectedAssigneeLogin && !(item.assignees ?? []).includes(selectedAssigneeLogin)) {
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
  status: LoopExecutionLogEntry['status'],
  assignments: CreatedLoopAssignment[],
  error?: string,
  completedAt?: string,
): LoopExecutionLogEntry {
  return {
    id: executionId,
    loopId,
    startedAt,
    status,
    createdCount: assignments.length,
    createdAgents: assignments.map(({ agent, item }) => ({
      agentId: agent.id,
      agentName: agent.name,
      workItemId: workItemAssignmentKey(item),
      workItemTitle: item.title,
      workItemUrl: item.url,
    })),
    ...(completedAt ? { completedAt } : {}),
    ...(error ? { error } : {}),
  };
}
