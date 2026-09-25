import { createAgentInSnapshot } from '@codex-claw/core/agent-manager';
import type { Agent, AppSnapshot, CreateAgentInput } from '@codex-claw/core/contracts';
import { createEntityId } from '@codex-claw/core/ids';
import { resolveAgentBackend } from '@codex-claw/core/agent-backends';

export type AgentCreationOptions = {
  select?: boolean;
  afterAgentId?: string;
};

export class AgentCreationService {
  constructor(private readonly snapshot: AppSnapshot) {}

  create(input: CreateAgentInput, options: AgentCreationOptions = {}): Agent {
    const id = createEntityId('agent');
    createAgentInSnapshot(this.snapshot, { ...input, backend: resolveAgentBackend(this.snapshot.general, input.backend) }, undefined, id, options);
    const agent = this.snapshot.agents.find((candidate) => candidate.id === id);
    if (!agent) throw new Error('Agent could not be created.');
    return agent;
  }
}
