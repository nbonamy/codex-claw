import { AppError } from '@codex-claw/core/app-error';
import { agentDisplayName } from '@codex-claw/core/agent-display';
import { requireAgentFolder } from '@codex-claw/core/agent-folder';
import { duplicateAgentInSnapshot } from '@codex-claw/core/agent-manager';
import type { AppSnapshot, ClientRequestResponse, WorkRoutingResult } from '@codex-claw/core/contracts';
import { updateAgentFolder } from '@codex-claw/core/snapshot';
import type { AgentGitService } from '../git/agent-git-service';

export type WorkRoutingPort = {
  resolveWorkRoutingRequest(requestId: string, result: WorkRoutingResult): boolean;
};

export type WorkRoutingServiceOptions = {
  getSnapshot: () => AppSnapshot;
  git: Pick<AgentGitService, 'createBranch' | 'status'>;
  port?: WorkRoutingPort;
  persistAndEmitSnapshot: () => Promise<unknown>;
  refreshWorkspaceIdentity: (agentId: string) => Promise<unknown>;
  sendPrompt: (agentId: string, prompt: string) => void;
};

/** Applies a user's routing choice and owns branch/worktree safety policy. */
export class WorkRoutingService {
  constructor(private readonly options: WorkRoutingServiceOptions) {}

  async respond(response: ClientRequestResponse): Promise<void> {
    const snapshot = this.options.getSnapshot();
    const request = snapshot.workRoutingRequests?.find((candidate) => candidate.id === response.id);
    if (!request) throw new Error(`Work routing request not found: ${response.id}`);
    if (!this.options.port) throw new Error('Work routing is not configured.');

    const selection = response.payload?.workRouting;
    if (response.payload?.cancelled === true || !selection) {
      this.resolve(request.id, { mode: 'cancelled' });
      return;
    }
    if (selection.mode !== 'current' && selection.mode !== 'branch' && selection.mode !== 'delegate') {
      throw new Error('Invalid work routing mode.');
    }

    const agent = snapshot.agents.find((candidate) => candidate.id === request.payload.request.agentId);
    if (!agent) throw new Error(`Agent not found: ${request.payload.request.agentId}`);
    const folder = requireAgentFolder(agent);

    if (selection.mode === 'current') {
      this.resolve(request.id, { mode: 'current', folder });
      return;
    }

    const branchName = selection.branchName?.trim() ?? '';
    if (!branchName) throw new AppError('workRouting.branchRequired', 'Enter a branch name.');

    if (selection.mode === 'branch') {
      await this.continueOnBranch(request.id, agent.id, folder, branchName, request.payload.request.sharedFolderAgentNames);
      return;
    }

    const delegatedFolder = await this.options.git.createBranch(folder, branchName, true);
    const delegated = duplicateAgentInSnapshot(snapshot, agent.id, undefined, undefined, {
      name: delegatedAgentName(agentDisplayName(agent), branchName),
      select: false,
    });
    if (!delegated) throw new Error(`Agent not found: ${agent.id}`);
    delegated.delegatedByAgentId = agent.id;

    updateAgentFolder(snapshot, delegated.id, delegatedFolder);
    await this.options.refreshWorkspaceIdentity(delegated.id);
    await this.options.persistAndEmitSnapshot();
    this.options.sendPrompt(delegated.id, request.payload.request.task);
    this.resolve(request.id, {
      mode: 'delegated',
      agentId: delegated.id,
      agentName: agentDisplayName(delegated),
      branchName,
      folder: delegatedFolder,
    });
  }

  private async continueOnBranch(
    requestId: string,
    agentId: string,
    folder: string,
    branchName: string,
    sharedFolderAgentNames: string[],
  ): Promise<void> {
    if (sharedFolderAgentNames.length > 0) {
      const agents = sharedFolderAgentNames.join(', ');
      throw new AppError(
        'workRouting.sharedFolder',
        `This folder is also used by ${agents}. Delegate to a worktree instead.`,
        { agents },
      );
    }
    const gitStatus = await this.options.git.status(folder);
    if (gitStatus.state === 'dirty') {
      throw new AppError(
        'workRouting.dirtyCheckout',
        'This checkout has uncommitted changes. Commit, stash, or delegate to a worktree instead.',
      );
    }
    if (gitStatus.state === 'unknown') {
      throw new AppError(
        'workRouting.dirtyCheckoutUnknown',
        'Could not verify whether this checkout has uncommitted changes. Delegate to a worktree instead.',
      );
    }
    const branchFolder = await this.options.git.createBranch(folder, branchName, false);
    await this.options.refreshWorkspaceIdentity(agentId);
    await this.options.persistAndEmitSnapshot();
    this.resolve(requestId, { mode: 'branch', branchName, folder: branchFolder });
  }

  private resolve(requestId: string, result: WorkRoutingResult): void {
    if (!this.options.port?.resolveWorkRoutingRequest(requestId, result)) {
      throw new Error(`Work routing request is no longer pending: ${requestId}`);
    }
  }
}

function delegatedAgentName(agentName: string, branchName: string): string {
  const branchLabel = branchName.split('/').filter(Boolean).at(-1) ?? branchName;
  return `${agentName} ${branchLabel}`;
}
