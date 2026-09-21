import type { AppSnapshot, CreateSourceWorktreeInput, SourceWorktree } from '@codex-claw/core/contracts';
import type { Mission } from '@codex-claw/core/missions';
import { missionTeamRepositories, missionWorkspaceName } from './mission-execution-policy';

export type MissionWorkspacePorts = {
  snapshot: AppSnapshot;
  validateRepository(path: string): Promise<void>;
  createWorktree(input: CreateSourceWorktreeInput): Promise<SourceWorktree>;
  getHead(path: string): Promise<string>;
};

export class MissionWorkspaceService {
  constructor(private readonly ports: MissionWorkspacePorts) {}

  async provisionImplementationWorkspaces(mission: Mission): Promise<void> {
    const execution = mission.execution!;
    execution.workspaceName ??= missionWorkspaceName(mission);
    execution.workspaces ??= [];
    const branch = `mission/${execution.workspaceName}`;
    const repositoryPaths = [...new Set(mission.artifacts.tickets.map(ticket => ticket.repositoryPath))];
    const representedRepositories = missionTeamRepositories(this.ports.snapshot, mission);
    for (const repositoryPath of repositoryPaths) {
      if (!repositoryPath || !representedRepositories.includes(repositoryPath)) {
        throw new Error('Every ticket must target a repository represented in this Mission team.');
      }
      if (execution.workspaces.some(workspace => workspace.repositoryPath === repositoryPath)) continue;
      await this.ports.validateRepository(repositoryPath);
      const worktree = await this.ports.createWorktree({ repoPath: repositoryPath, branchName: branch, reuseExisting: true });
      const baseSha = await this.ports.getHead(worktree.path);
      execution.workspaces.push({ repositoryPath, path: worktree.path, branch, baseSha });
    }
  }

  prepareDeliveries(mission: Mission): void {
    const execution = mission.execution;
    if (!execution?.workspaces?.length) throw new Error('This Mission has no repository workspaces to ship.');
    execution.deliveries = execution.workspaces.map(workspace => {
      const run = execution.runs.slice().reverse().find(candidate => (
        candidate.stage === 'implementation' && candidate.repositoryPath === workspace.repositoryPath && candidate.workerId
      ));
      if (!run?.workerId) throw new Error(`No implementation agent is available to ship ${workspace.repositoryPath}.`);
      return { repositoryPath: workspace.repositoryPath, agentId: run.workerId, status: 'pending' };
    });
  }
}
