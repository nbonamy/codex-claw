import { closeAgentInSnapshot, updateAgentFolder } from '@codex-claw/core/agent-manager';
import { unsupportedBackendFeature, type BackendEvent } from '@codex-claw/core/backend-driver';
import { agentGitBackendMethods, backendMethods, type AgentGitBackendMethod } from '@codex-claw/core/backend-protocol/methods';
import { requireAgentFolder } from '@codex-claw/core/agent-folder';
import type {
  Agent,
  AgentGitDiff,
  AgentGitMessageGenerationResult,
  AgentGitOperationProgress,
  AgentGitPullRequest,
  AgentGitWorkflow,
  AppSnapshot,
} from '@codex-claw/core/contracts';
import type { DelegatedWorkReportPort } from '../agents/delegated-work-report-service';
import type { AgentGitService } from './agent-git-service';

export type AgentGitRequest = {
  method: AgentGitBackendMethod;
  agentId: string;
  params: Record<string, unknown>;
};

type AgentGitWorkIntegrationsPort = {
  githubConnected(): Promise<boolean>;
  findPullRequest(repositoryId: string, branch: string): Promise<AgentGitPullRequest | null>;
  createPullRequest(repositoryId: string, input: { branch: string; title: string; body: string }): Promise<AgentGitPullRequest>;
};

export type AgentGitWorkflowServiceOptions = {
  applyEvent: (event: BackendEvent) => void;
  delegatedWorkReports: DelegatedWorkReportPort;
  driverRequest: (agent: Agent, method: string, params: unknown) => Promise<unknown>;
  forgetSession: (agent: Agent) => Promise<void>;
  getSnapshot: () => AppSnapshot;
  getWorkIntegrations: () => AgentGitWorkIntegrationsPort;
  git: AgentGitService;
  persistAndEmitSnapshot: () => Promise<AppSnapshot>;
  refreshGitStatus: (agentId: string) => Promise<void>;
  refreshWorkspaceIdentity: (agentId: string) => Promise<boolean>;
};

/** Owns the complete local workflow for app-level agent Git requests. */
export class AgentGitWorkflowService {
  constructor(private readonly options: AgentGitWorkflowServiceOptions) {}

  async execute(request: AgentGitRequest, agent: Agent): Promise<true | AgentGitMessageGenerationResult | AgentGitWorkflow> {
    const { method, agentId, params } = request;
    switch (method) {
      case backendMethods.agentGitDiffOpen:
        await this.openDiff(agent);
        return true;
      case backendMethods.agentGitWorkflowGet:
        return this.workflow(agent);
      case backendMethods.agentGitMessageGenerate:
        return this.generateMessage(agent, params);
      case backendMethods.agentGitStage: {
        requireConfirmed(params.input, 'Staging files');
        const input = requireRecord(params.input);
        const paths = requireStringArray(input.paths, 'paths');
        await this.options.git.stage(requireAgentFolder(agent), paths);
        return this.workflow(agent, { refreshStatus: true });
      }
      case backendMethods.agentGitCommit: {
        const folder = requireAgentFolder(agent);
        const input = requireConfirmed(params.input, 'Creating a commit');
        const workflow = await this.options.git.workflow(folder);
        const pathsToStage = workflow.files
          .filter((file) => (file.indexStatus === '?' ? input.includeUntracked === true : input.includeUnstaged === true))
          .map((file) => file.path);
        if (pathsToStage.length > 0) {
          await this.options.git.stage(folder, pathsToStage);
        }
        await this.options.git.commit(folder, requireString(input.message, 'message'));
        return this.workflow(agent, { refreshStatus: true });
      }
      case backendMethods.agentGitPush: {
        const folder = requireAgentFolder(agent);
        const input = requireConfirmed(params.input, 'Pushing a branch');
        if (input.closeAgentAfterPush === true && input.target !== 'mergeTarget') {
          throw new Error('Closing an agent after pushing is only available for a completed merge.');
        }
        const currentWorkflow = await this.options.git.workflow(folder);
        const pushFolder = input.target === 'mergeTarget' && !isIntegrationBranchName(currentWorkflow.branch)
          ? await this.options.git.mergeTarget(folder)
          : folder;
        const workflow = pushFolder === folder ? currentWorkflow : await this.options.git.workflow(pushFolder);
        if (workflow.detached || !workflow.branch) throw new Error('Create or check out a branch before pushing.');
        if (!workflow.remote) throw new Error('Add a Git remote before pushing.');
        await this.options.git.push(pushFolder, workflow.remote, workflow.branch, !workflow.upstream);
        const result = await this.workflow(agent, { refreshStatus: true });
        if (input.closeAgentAfterPush === true) {
          closeAgentInSnapshot(this.options.getSnapshot(), agentId);
          await this.options.persistAndEmitSnapshot();
        }
        return result;
      }
      case backendMethods.agentGitBranchCreate: {
        const folder = requireAgentFolder(agent);
        const input = requireConfirmed(params.input, 'Creating a branch');
        const pullRequestNumber = input.pullRequestNumber;
        if (pullRequestNumber !== undefined && (!Number.isInteger(pullRequestNumber) || (pullRequestNumber as number) <= 0)) {
          throw new Error('Invalid pull request number.');
        }
        const branchName = requireString(input.name, 'name');
        const targetFolder = pullRequestNumber === undefined
          ? await this.options.git.createBranch(folder, branchName, input.createWorktree === true)
          : await this.options.git.createBranch(folder, branchName, input.createWorktree === true, pullRequestNumber as number);
        if (input.createWorktree === true) {
          updateAgentFolder(this.options.getSnapshot(), agentId, targetFolder);
          await this.options.forgetSession(agent);
        }
        const workspaceChanged = await this.options.refreshWorkspaceIdentity(agentId);
        if (input.createWorktree === true || workspaceChanged) await this.options.persistAndEmitSnapshot();
        return this.workflow(agent, { refreshStatus: true });
      }
      case backendMethods.agentGitPullRequestCreate:
        return this.createPullRequest(agent, agentId, params);
      case backendMethods.agentGitMerge:
        return this.merge(agent, agentId, params);
    }
  }

  private async openDiff(agent: Agent): Promise<void> {
    const title = 'Git Diff';
    const subtitle = agent.folder;

    try {
      const review = await this.options.driverRequest(agent, backendMethods.driverGitDiffGet, { agent }) as AgentGitDiff | null;
      if (review === null) {
        this.options.applyEvent({
          agentId: agent.id,
          type: 'sidePanel.gitDiffRequested',
          payload: {
            kind: 'gitDiff',
            scope: 'workingTree',
            title,
            subtitle,
            diff: '',
            state: 'error',
            error: unsupportedBackendFeature(agent, 'git diff preview').message,
          },
        });
        return;
      }

      this.options.applyEvent({
        agentId: agent.id,
        type: 'sidePanel.gitDiffRequested',
        payload: {
          kind: 'gitDiff',
          scope: 'workingTree',
          title,
          subtitle,
          diff: review.diff,
          sections: review.sections,
        },
      });
    } catch (error) {
      this.options.applyEvent({
        agentId: agent.id,
        type: 'sidePanel.gitDiffRequested',
        payload: {
          kind: 'gitDiff',
          scope: 'workingTree',
          title,
          subtitle,
          diff: '',
          state: 'error',
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private async workflow(agent: Agent, options: { includePullRequest?: boolean; refreshStatus?: boolean } = {}): Promise<AgentGitWorkflow> {
    const workflow = await this.options.git.workflow(requireAgentFolder(agent));
    if (options.refreshStatus) {
      await this.options.refreshGitStatus(agent.id);
    }
    const workIntegrations = this.options.getWorkIntegrations();
    const githubConnected = await workIntegrations.githubConnected();
    let existingPullRequest = null;
    let githubError: string | undefined;
    if (options.includePullRequest && githubConnected && workflow.branch && workflow.repository.includes('/')) {
      try {
        existingPullRequest = await workIntegrations.findPullRequest(workflow.repository, workflow.branch);
      } catch (error) {
        githubError = error instanceof Error ? error.message : String(error);
      }
    }
    return {
      ...workflow,
      githubConnected,
      ...(existingPullRequest ? { existingPullRequest } : {}),
      ...(githubError ? { githubError } : {}),
    };
  }

  private async generateMessage(agent: Agent, params: Record<string, unknown>): Promise<AgentGitMessageGenerationResult> {
    const folder = requireAgentFolder(agent);
    const input = requireRecord(params.input);
    const kind = requireString(input.kind, 'kind');
    if (kind === 'commit') {
      const source = await this.options.git.commitMessageContext(folder, {
        includeUnstaged: input.includeUnstaged === true,
        includeUntracked: input.includeUntracked === true,
      });
      const generated = await this.options.driverRequest(agent, backendMethods.driverTextGenerate, {
        agent,
        cwd: folder,
        prompt: `Write a commit message for these selected changes.\n\n${source.context}`,
        developerInstructions: 'Return one concise, imperative git commit subject. Follow the repository convention when it is evident. Do not add Markdown or explanations.',
        outputSchema: commitMessageOutputSchema,
      });
      return parseGeneratedGitMessage(generated, 'commit');
    }
    if (kind === 'pullRequest') {
      const source = await this.options.git.pullRequestMessageContext(folder);
      const generated = await this.options.driverRequest(agent, backendMethods.driverTextGenerate, {
        agent,
        cwd: folder,
        prompt: `Draft a pull request title and body for the changes from ${source.baseRef ?? 'the base branch'} to the current branch.\n\n${source.context}`,
        developerInstructions: 'Return a concise pull request title and a useful Markdown body describing the outcome, important implementation details, and testing when supported by the supplied context. Do not invent facts.',
        outputSchema: pullRequestMessageOutputSchema,
      });
      return parseGeneratedGitMessage(generated, 'pullRequest');
    }
    throw new Error(`Unsupported Git message kind: ${kind}`);
  }

  private async createPullRequest(agent: Agent, agentId: string, params: Record<string, unknown>): Promise<AgentGitWorkflow> {
    const folder = requireAgentFolder(agent);
    const input = requireConfirmed(params.input, 'Creating a pull request');
    const workflow = await this.workflow(agent, { includePullRequest: true });
    if (!workflow.branch || workflow.detached) throw new Error('Create or check out a branch before creating a pull request.');
    if (isIntegrationBranchName(workflow.branch)) throw new Error('Create a feature branch before creating a pull request.');
    if (!workflow.remote || !workflow.remoteUrl) throw new Error('Add a GitHub remote before creating a pull request.');
    if (workflow.githubError) throw new Error(`Could not verify existing pull requests: ${workflow.githubError}`);
    if (workflow.existingPullRequest) throw new Error(`Pull request #${workflow.existingPullRequest.number} already exists for this branch.`);
    await this.options.git.assertPullRequestChanges(folder);
    if (input.reportBack === true) this.emitOperationProgress(agentId, 'pullRequest', 'handoff');
    const handoff = input.reportBack === true
      ? await this.options.delegatedWorkReports.prepare(agent, {
        kind: 'pullRequest',
        branch: workflow.branch,
      })
      : null;
    if (input.reportBack === true) this.emitOperationProgress(agentId, 'pullRequest', 'delivery');
    if (!workflow.upstream || workflow.ahead > 0) {
      await this.options.git.push(folder, workflow.remote, workflow.branch, !workflow.upstream);
    }
    const createdPullRequest = await this.options.getWorkIntegrations().createPullRequest(workflow.repository, {
      branch: workflow.branch,
      title: requireString(input.title, 'title'),
      body: typeof input.body === 'string' ? input.body : '',
    });
    const outcome = {
      kind: 'pullRequest' as const,
      branch: workflow.branch,
      title: createdPullRequest.title,
      number: createdPullRequest.number,
      url: createdPullRequest.url,
      draft: createdPullRequest.draft,
    };
    const now = new Date().toISOString();
    agent.pullRequest = {
      ...createdPullRequest,
      provider: 'github',
      repository: workflow.repository,
      branch: workflow.branch,
      createdAt: now,
      updatedAt: now,
    };
    const result = {
      ...await this.workflow(agent, { refreshStatus: true }),
      existingPullRequest: createdPullRequest,
    };
    this.options.delegatedWorkReports.notifyWorker(agent, outcome);
    if (input.reportBack === true) {
      this.options.delegatedWorkReports.deliver(agent, outcome, handoff);
    }
    await this.options.persistAndEmitSnapshot();
    return result;
  }

  private async merge(agent: Agent, agentId: string, params: Record<string, unknown>): Promise<AgentGitWorkflow> {
    const folder = requireAgentFolder(agent);
    const input = requireConfirmed(params.input, 'Merging a branch');
    const strategy = input.strategy === 'squash' ? 'squash' : 'merge';
    const commitMessage = strategy === 'squash' ? requireString(input.commitMessage, 'commitMessage') : undefined;
    const deleteWorktree = input.deleteWorktree === true;
    const workflow = input.reportBack === true ? await this.workflow(agent) : null;
    if (input.reportBack === true) this.emitOperationProgress(agentId, 'merge', 'handoff');
    const handoff = input.reportBack === true
      ? await this.options.delegatedWorkReports.prepare(agent, {
        kind: 'merge',
        branch: workflow?.branch ?? 'branch',
        repository: workflow?.repository ?? 'the base branch',
      })
      : null;
    if (input.reportBack === true) this.emitOperationProgress(agentId, 'merge', 'delivery');
    const targetFolder = await this.options.git.merge(folder, strategy, input.deleteBranch === true, deleteWorktree, commitMessage);
    const outcome = {
      kind: 'merge' as const,
      branch: workflow?.branch ?? 'branch',
      repository: workflow?.repository ?? 'the base branch',
    };
    if (deleteWorktree) {
      updateAgentFolder(this.options.getSnapshot(), agentId, targetFolder);
      await this.options.forgetSession(agent);
    }
    const result = await this.workflow(agent, { refreshStatus: true });
    if (input.reportBack === true) {
      this.options.delegatedWorkReports.deliver(agent, outcome, handoff);
    }
    if (deleteWorktree) {
      if (input.pushAfter !== true) {
        closeAgentInSnapshot(this.options.getSnapshot(), agentId);
      }
      await this.options.persistAndEmitSnapshot();
    }
    return result;
  }

  private emitOperationProgress(
    agentId: string,
    operation: AgentGitOperationProgress['operation'],
    phase: AgentGitOperationProgress['phase'],
  ): void {
    this.options.applyEvent({
      agentId,
      type: 'git.operationProgress',
      payload: { operation, phase } satisfies AgentGitOperationProgress,
    });
  }
}

export function parseAgentGitRequest(method: string, value: unknown): AgentGitRequest | null {
  if (!agentGitBackendMethods.some((candidate) => candidate === method)) return null;
  const params = requireRecord(value);
  return {
    method: method as AgentGitBackendMethod,
    agentId: requireString(params.agentId, 'agentId'),
    params,
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Invalid work integration request params.');
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`Invalid ${name}.`);
  return value;
}

function requireStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error(`Invalid ${name}.`);
  return value as string[];
}

function requireConfirmed(value: unknown, action: string): Record<string, unknown> {
  const input = requireRecord(value);
  if (input.confirmed !== true) throw new Error(`${action} requires explicit confirmation.`);
  return input;
}

function isIntegrationBranchName(branch?: string): boolean {
  return branch === 'main' || branch === 'master' || branch === 'develop' || branch === 'development' || branch === 'trunk';
}

const commitMessageOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: { message: { type: 'string' } },
  required: ['message'],
};

const pullRequestMessageOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    body: { type: 'string' },
  },
  required: ['title', 'body'],
};

function parseGeneratedGitMessage(value: unknown, kind: 'commit' | 'pullRequest'): AgentGitMessageGenerationResult {
  if (!isRecord(value) || typeof value.text !== 'string') throw new Error('The backend returned an invalid generated message.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.text);
  } catch {
    throw new Error('The backend returned malformed generated content.');
  }
  if (!isRecord(parsed)) throw new Error('The backend returned malformed generated content.');
  if (kind === 'commit') {
    const message = typeof parsed.message === 'string' ? parsed.message.trim() : '';
    if (!message) throw new Error('The backend returned an empty commit message.');
    return { kind, message };
  }
  const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
  const body = typeof parsed.body === 'string' ? parsed.body.trim() : '';
  if (!title) throw new Error('The backend returned an empty pull request title.');
  return { kind, title, body };
}
