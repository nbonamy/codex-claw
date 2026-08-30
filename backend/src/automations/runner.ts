import type { Agent, AppSnapshot, Automation, AutomationExecutionLogEntry, WorkItem, WorkProviderKind } from '@codex-claw/core/contracts';
import { assignWorkItemToAgentInSnapshot, deployBenchTemplateInSnapshot } from '@codex-claw/core/agent-manager';
import { agentDisplayName } from '@codex-claw/core/agent-display';
import { recordAutomationExecutionInSnapshot } from '@codex-claw/core/automation-manager';
import { createEntityId, type IdGenerator } from '@codex-claw/core/ids';
import { createAgentInSnapshot } from '@codex-claw/core/snapshot';
import { defaultTeamColor } from '@codex-claw/core/team-colors';
import { createTeamInSnapshot } from '@codex-claw/core/team-manager';
import { workItemAssignmentKey } from '@codex-claw/core/work-assignments';
import { workItemAssignmentPrompt, workProviderLabel } from '@codex-claw/core/work-item-prompts';
import path from 'node:path';
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
  createExecutionId?: IdGenerator;
  now?: () => Date;
};

type CreatedAutomationAssignment = {
  agent: Agent;
  item: WorkItem;
};

export class AutomationRunner {
  constructor(private readonly options: AutomationRunnerOptions) {}

  async runAll(): Promise<void> {
    const automations = [...this.snapshot().automations].filter((automation) => automation.enabled);
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
      provider: automation.source.provider,
      repositoryId: automation.source.repositoryId,
    });
    try {
      await this.createAssignmentsForAutomation(automation, executionId, startedAt, createdAssignments);
      if (createdAssignments.length === 0) {
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
          await this.options.sendPrompt(assignment.agent.id, workItemAssignmentPrompt(assignment.item, {
            ...automation.instructions,
            completionPolicy: 'complete',
          }), {
            automationId: automation.id,
            executionId,
            workItemId,
          });
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
      recordAutomationExecutionInSnapshot(this.snapshot(), automation.id, createAutomationExecutionEntry(
        automation.id,
        executionId,
        startedAt,
        'failed',
        createdAssignments,
        message,
        this.now().toISOString(),
      ));
      await this.publishSnapshotUpdate();
      warnMain('automation-runner', 'failed', {
        automationId: automation.id,
        executionId,
        createdCount: createdAssignments.length,
        message,
      });
    }
  }

  private async createAssignmentsForAutomation(automation: Automation, executionId: string, createdAt: string, createdAssignments: CreatedAutomationAssignment[]): Promise<void> {
    const items = await this.options.listWorkItems.listItems(automation.source.provider, automation.source.repositoryId);
    const matchingItems = matchingAutomationItems(items, automation);
    logMain('automation-runner', 'listed work items', {
      automationId: automation.id,
      executionId,
      itemCount: items.length,
      matchingCount: matchingItems.length,
    });

    for (const item of matchingItems) {
      const assignmentKey = workItemAssignmentKey(item);
      const existingAssignment = this.snapshot().workBacklog.assignments[assignmentKey];
      if (existingAssignment && existingAssignment.status !== 'completed') {
        logMain('automation-runner', 'skipped already assigned item', {
          automationId: automation.id,
          executionId,
          workItemId: assignmentKey,
        });
        continue;
      }

      const teamId = this.resolveTargetTeamId(automation, item, createdAt);
      const agent = this.createAgentForAutomation(automation, item, teamId, createdAt);
      if (!agent) {
        throw new Error(`Agent configuration is no longer available for automation "${automation.name}".`);
      }

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
    }
  }

  private createAgentForAutomation(automation: Automation, item: WorkItem, teamId: string, createdAt: string): Agent | null {
    if (automation.action.type === 'create-agent-from-bench') {
      return deployBenchTemplateInSnapshot(
        this.snapshot(),
        automation.action.benchTemplateId,
        teamId,
        createdAt,
        undefined,
        { select: false },
      );
    }

    const previousAgentIds = new Set(this.snapshot().agents.map((agent) => agent.id));
    createAgentInSnapshot(this.snapshot(), {
      name: dedicatedTeamName(item),
      folder: automation.action.sourceRepositoryPath,
      backend: automation.action.backend ?? 'codex',
      backendDefaults: automation.action.backendDefaults,
      teamId,
    }, createdAt, undefined, { select: false });
    return this.snapshot().agents.find((agent) => !previousAgentIds.has(agent.id)) ?? null;
  }

  private resolveTargetTeamId(automation: Automation, item: WorkItem, createdAt: string): string {
    const teamTarget = automation.action.teamTarget;
    if (teamTarget.mode === 'existing') {
      const team = this.snapshot().teams.find((candidate) => candidate.id === teamTarget.teamId);
      if (!team) {
        throw new Error(`Team is no longer available for automation "${automation.name}".`);
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
    return this.options.createExecutionId?.() ?? createEntityId('automation-exec');
  }
}

export function matchingAutomationItems(items: WorkItem[], automation: Automation): WorkItem[] {
  const selectedAssigneeLogin = automation.source.assigneeLogin;
  const selectedTagName = automation.source.tagName;
  return items.filter((item) => {
    if (item.provider !== automation.source.provider || item.repositoryId !== automation.source.repositoryId || item.state !== 'open') {
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
      workItemTitle: item.title,
      workItemUrl: item.url,
    })),
    ...(completedAt ? { completedAt } : {}),
    ...(error ? { error } : {}),
  };
}
