import { createAgentInSnapshot } from '@workspace/core/agent-manager';
import type { Agent, AppSnapshot, CreateAgentInput } from '@workspace/core/contracts';
import { createEntityId } from '@workspace/core/ids';
import { resolveAgentBackend } from '@workspace/core/agent-backends';
import { requireReleasedProvider } from '../provider-release';

export type AgentCreationOptions = {
  id?: string;
  select?: boolean;
  afterAgentId?: string;
};

export class AgentCreationService {
  constructor(private readonly snapshot: AppSnapshot) {}

  create(input: CreateAgentInput, options: AgentCreationOptions = {}): Agent {
    if (input.backend) requireReleasedProvider(input.backend);
    const backend = resolveAgentBackend(this.snapshot, input.backend);
    requireReleasedProvider(backend);
    const id = options.id ?? createEntityId('agent');
    if (this.snapshot.agents.some(agent => agent.id === id)) throw new Error('Agent already exists.');
    createAgentInSnapshot(this.snapshot, { ...input, backend }, undefined, id, options);
    const agent = this.snapshot.agents.find((candidate) => candidate.id === id);
    if (!agent) throw new Error('Agent could not be created.');
    return agent;
  }
}
