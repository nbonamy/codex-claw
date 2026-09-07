import { describe, expect, it, vi } from 'vitest';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import type { Agent } from '@codex-claw/core/contracts';
import type { DelegatedWorkReportPort } from '../../agents/delegated-work-report-service';
import type { AgentGitService } from '../agent-git-service';
import { AgentGitWorkflowService, parseAgentGitRequest } from '../agent-git-workflow-service';

describe('AgentGitWorkflowService', () => {
  it('recognizes only agent Git methods and preserves their params for routing', () => {
    const params = { agentId: 'agent-1', input: { paths: ['file.ts'], confirmed: true } };

    expect(parseAgentGitRequest(backendMethods.agentGitStage, params)).toStrictEqual({
      method: backendMethods.agentGitStage,
      agentId: 'agent-1',
      params,
    });
    expect(parseAgentGitRequest(backendMethods.agentSelect, params)).toBeNull();
    expect(() => parseAgentGitRequest(backendMethods.agentGitStage, {})).toThrow('Invalid agentId.');
  });

  it('owns Git confirmation before invoking the low-level adapter', async () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0] as Agent;
    const stage = vi.fn();
    const service = new AgentGitWorkflowService({
      applyEvent: vi.fn(),
      delegatedWorkReports: {} as DelegatedWorkReportPort,
      driverRequest: vi.fn(),
      forgetSession: vi.fn(),
      getSnapshot: () => snapshot,
      getWorkIntegrations: vi.fn(),
      git: { stage } as unknown as AgentGitService,
      persistAndEmitSnapshot: vi.fn(),
      refreshGitStatus: vi.fn(),
      refreshWorkspaceIdentity: vi.fn(),
    });

    await expect(service.execute({
      method: backendMethods.agentGitStage,
      agentId: agent.id,
      params: { agentId: agent.id, input: { paths: ['file.ts'], confirmed: false } },
    }, agent)).rejects.toThrow('Staging files requires explicit confirmation.');
    expect(stage).not.toHaveBeenCalled();
  });
});
