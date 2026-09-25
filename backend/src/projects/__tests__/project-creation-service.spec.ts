import { describe, expect, it, vi } from 'vitest';
import { createAgentFromInput } from '@codex-claw/core/agent-manager';
import type { SourceRepository } from '@codex-claw/core/contracts';
import { ProjectCreationService } from '../project-creation-service';

const repository: SourceRepository = {
  name: 'new-product',
  path: '/src/new-product',
  worktrees: [{ name: 'main', path: '/src/new-product' }],
};

describe('ProjectCreationService', () => {
  it('creates the repository and agent before submitting the handoff prompt', async () => {
    const steps: string[] = [];
    const agent = createAgentFromInput({ name: null, folder: repository.path, backend: 'codex', teamId: 'team-one' });
    const service = new ProjectCreationService({
      createRepository: vi.fn(async () => { steps.push('repository'); return repository; }),
      createAgent: vi.fn(async () => { steps.push('agent'); return agent; }),
      startAgent: vi.fn(async () => { steps.push('prompt'); }),
    });

    await expect(service.create({ name: ' new-product ', teamId: 'team-one', prompt: ' Build it. ' })).resolves.toStrictEqual({
      repository, agent, promptSubmitted: true,
    });
    expect(steps).toStrictEqual(['repository', 'agent', 'prompt']);
  });

  it('reports the recoverable repository when agent creation fails', async () => {
    const createRepository = vi.fn().mockResolvedValue(repository);
    const startAgent = vi.fn();
    const service = new ProjectCreationService({
      createRepository,
      createAgent: vi.fn().mockRejectedValue(new Error('Agent unavailable')),
      startAgent,
    });

    await expect(service.create({ name: 'new-product', teamId: 'team-one' }))
      .rejects.toThrow('Created the repository at /src/new-product, but could not finish setting up its agent. The repository remains on disk; check the agent list before retrying. Agent unavailable');
    expect(createRepository).toHaveBeenCalledOnce();
    expect(startAgent).not.toHaveBeenCalled();
  });

  it('keeps an already created project recoverable when its initial prompt fails', async () => {
    const agent = createAgentFromInput({ name: null, folder: repository.path, backend: 'codex', teamId: 'team-one' });
    const service = new ProjectCreationService({
      createRepository: vi.fn().mockResolvedValue(repository),
      createAgent: vi.fn().mockResolvedValue(agent),
      startAgent: vi.fn().mockRejectedValue(new Error('Backend offline')),
    });

    await expect(service.create({ name: 'new-product', teamId: 'team-one', prompt: 'Build it.' }))
      .rejects.toThrow('Created the project at /src/new-product, but could not start its agent. The project remains available. Backend offline');
  });
});
