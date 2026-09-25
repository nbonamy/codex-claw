import type { Agent, BackendDefaults, SourceRepository } from '@codex-claw/core/contracts';
import { requireRepositoryName } from '../create-source-repository';

export type ProjectCreationInput = {
  name: string;
  teamId: string;
  backendDefaults?: BackendDefaults;
  prompt?: string;
};

export type CreatedProject = {
  repository: SourceRepository;
  agent: Agent;
  promptSubmitted: boolean;
};

export class ProjectCreationService {
  constructor(private readonly ports: {
    createRepository(name: string): Promise<SourceRepository>;
    createAgent(input: {
      repository: SourceRepository;
      teamId: string;
      backendDefaults?: BackendDefaults;
    }): Promise<Agent>;
    startAgent(agent: Agent, prompt: string): Promise<void>;
  }) {}

  async create(input: ProjectCreationInput): Promise<CreatedProject> {
    const name = requireRepositoryName(input.name);
    const prompt = input.prompt?.trim();
    const repository = await this.ports.createRepository(name);
    let agent: Agent;
    try {
      agent = await this.ports.createAgent({
        repository,
        teamId: input.teamId,
        ...(input.backendDefaults ? { backendDefaults: input.backendDefaults } : {}),
      });
    } catch (error) {
      throw new Error(`Created the repository at ${repository.path}, but could not finish setting up its agent. The repository remains on disk; check the agent list before retrying. ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    if (prompt) {
      try {
        await this.ports.startAgent(agent, prompt);
      } catch (error) {
        throw new Error(`Created the project at ${repository.path}, but could not start its agent. The project remains available. ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
    }
    return { repository, agent, promptSubmitted: Boolean(prompt) };
  }
}
