import { describe, expect, it, vi } from 'vitest';
import type { Agent, AgentStatus } from '@codex-claw/core/contracts';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import {
  ClawMcpAgentCoordinator,
  McpToolError,
  type ClawMcpAgentCoordinatorOptions,
} from '../agent-coordinator';

describe('ClawMcpAgentCoordinator', () => {
  it('requires a known caller before exposing or invoking mission capabilities', async () => {
    const { coordinator } = fixture();
    const input = { missionId: 'mission', runId: 'run', summary: 'Ready', artifacts: { requirements: { problem: 'Billing', acceptance: 'Pay' }, tickets: [], implementation: { changes: '', tests: '' }, review: { summary: '', pullRequestUrl: '' } } };
    expect(coordinator.missionContext('agent-dina')).toBeUndefined();
    await expect(coordinator.submitMissionResult('agent-dina', input)).rejects.toThrow('unavailable');
    await expect(coordinator.upsertMissionTicket('agent-dina', { title: 'Ticket', body: 'Body', repositoryPath: '/repo' })).rejects.toThrow('unavailable');
    await expect(coordinator.setMissionTitle('agent-dina', 'Add team billing')).rejects.toThrow('unavailable');
    await expect(coordinator.attachMissionRepository('agent-dina', '/repo')).rejects.toThrow('unavailable');
    expect(() => coordinator.listMissionArtifacts('agent-dina')).toThrow('unavailable');
    const missionContext = vi.fn().mockReturnValue({ missionId: 'mission', runId: 'run', stage: 'requirements' });
    const onMissionResult = vi.fn().mockResolvedValue({ success: true, status: 'awaitingReview' });
    const onUpsertMissionTicket = vi.fn().mockResolvedValue({ success: true, ticketId: 'mission-ticket-1', index: 0, artifactRevision: 1 });
    const onSetMissionTitle = vi.fn().mockResolvedValue({ success: true, title: 'Add team billing' });
    const onSetMissionExecutionPolicy = vi.fn().mockResolvedValue({ success: true, reviewPolicy: 'reviewAfterImplementation' });
    const onAttachMissionRepository = vi.fn().mockResolvedValue({ success: true, repoPath: '/repo' });
    const onListMissionArtifacts = vi.fn().mockReturnValue([{ stage: 'requirements', revision: 1, size: 10, updatedAt: 'now' }]);
    const onReadMissionArtifact = vi.fn().mockResolvedValue({ stage: 'requirements', content: '# Brief', revision: 1, updatedAt: 'now' });
    const onWriteMissionArtifact = vi.fn().mockResolvedValue({ stage: 'requirements', content: '# Brief', revision: 2, updatedAt: 'later' });
    const enabled = fixture({ getMissionContext: missionContext, onMissionResult, onUpsertMissionTicket, onSetMissionTitle, onSetMissionExecutionPolicy, onAttachMissionRepository, onListMissionArtifacts, onReadMissionArtifact, onWriteMissionArtifact }).coordinator;
    expect(() => enabled.missionContext('missing')).toThrow();
    await expect(enabled.submitMissionResult('missing', input)).rejects.toThrow();
    expect(onMissionResult).not.toHaveBeenCalled();
    expect(enabled.missionContext('agent-dina')).toEqual({ missionId: 'mission', runId: 'run', stage: 'requirements' });
    expect(missionContext).toHaveBeenCalledWith('agent-dina');
    await expect(enabled.setMissionTitle('agent-dina', 'Add team billing')).resolves.toEqual({ success: true, title: 'Add team billing' });
    expect(onSetMissionTitle).toHaveBeenCalledWith('agent-dina', 'Add team billing');
    await expect(enabled.setMissionExecutionPolicy('agent-dina', 'reviewAfterImplementation')).resolves.toEqual({ success: true, reviewPolicy: 'reviewAfterImplementation' });
    expect(onSetMissionExecutionPolicy).toHaveBeenCalledWith('agent-dina', 'reviewAfterImplementation');
    await expect(enabled.attachMissionRepository('agent-dina', '/repo')).resolves.toEqual({ success: true, repoPath: '/repo' });
    expect(onAttachMissionRepository).toHaveBeenCalledWith('agent-dina', '/repo');
    expect(enabled.listMissionArtifacts('agent-dina')).toHaveLength(1);
    await expect(enabled.readMissionArtifact('agent-dina', 'requirements')).resolves.toMatchObject({ revision: 1 });
    await expect(enabled.writeMissionArtifact('agent-dina', { stage: 'requirements', content: '# Brief' })).resolves.toMatchObject({ revision: 2 });
    await expect(enabled.submitMissionResult('agent-dina', input)).resolves.toEqual({ success: true, status: 'awaitingReview' });
    expect(onMissionResult).toHaveBeenCalledWith('agent-dina', input);
    await expect(enabled.upsertMissionTicket('agent-dina', { title: 'Ticket', body: 'Body', repositoryPath: '/repo' })).resolves.toMatchObject({ ticketId: 'mission-ticket-1' });
    expect(onUpsertMissionTicket).toHaveBeenCalledWith('agent-dina', { title: 'Ticket', body: 'Body', repositoryPath: '/repo' });
  });

  it('connects agents, reports statuses, and updates trimmed status text', () => {
    const { agents, coordinator, onAgentUpdated } = fixture();
    agents[0]!.status = { type: 'working', detail: 'Running tests' };
    agents[1]!.status = { type: 'error', message: 'Disconnected' };

    expect(coordinator.connectAgent('Dina', 'session-1')).toMatchObject({
      id: 'agent-dina',
      isRegistered: true,
      mcpSessionId: 'session-1',
      updatedAt: '2026-08-02T12:00:00.000Z',
    });
    expect(coordinator.listAgents('agent-dina')).toStrictEqual({
      agents: [
        expect.objectContaining({ id: 'agent-dina', status: 'Running tests' }),
        expect.objectContaining({ id: 'agent-jesse', status: 'Error: Disconnected' }),
      ],
    });

    expect(coordinator.setStatus('agent-dina', '  Reviewing coverage  ')).toBe('Status updated');
    expect(agents[0]!.statusText).toBe('Reviewing coverage');
    expect(coordinator.debugAgents()[0]?.status).toBe('Running tests: Reviewing coverage');
    coordinator.setStatus('agent-dina', '   ');
    expect(agents[0]!.statusText).toBeUndefined();
    expect(onAgentUpdated).toHaveBeenCalledTimes(3);
  });

  it('sets and clears predefined thread flags through the agent update seam', () => {
    const { agents, coordinator, onAgentUpdated } = fixture();

    expect(coordinator.toggleThreadFlag('agent-dina', { id: 'delegate_to_worktree', value: true }))
      .toStrictEqual({ success: true, id: 'delegate_to_worktree', value: true });
    expect(agents[0]!.threadFlags).toStrictEqual({ delegate_to_worktree: true });
    expect(coordinator.toggleThreadFlag('agent-dina', { id: 'ready_for_review', value: true }))
      .toStrictEqual({ success: true, id: 'ready_for_review', value: true });
    expect(agents[0]!.threadFlags).toStrictEqual({
      delegate_to_worktree: true,
      ready_for_review: true,
    });
    expect(coordinator.toggleThreadFlag('agent-dina', { id: 'delegate_to_worktree', value: false }))
      .toStrictEqual({ success: true, id: 'delegate_to_worktree', value: false });
    expect(agents[0]!.threadFlags).toStrictEqual({ ready_for_review: true });
    expect(coordinator.toggleThreadFlag('agent-dina', { id: 'ready_for_review', value: false }))
      .toStrictEqual({ success: true, id: 'ready_for_review', value: false });
    expect(agents[0]!.threadFlags).toBeUndefined();
    expect(onAgentUpdated).toHaveBeenCalledTimes(4);
    expect(() => coordinator.toggleThreadFlag('agent-dina', {
      id: 'delegate_to_worktree', value: true, payload: {},
    })).toThrow('does not accept a payload');
  });

  it('rejects recursive worktree delegation suggestions from delegated co-agents', () => {
    const { agents, coordinator, onAgentUpdated } = fixture();
    agents[0]!.delegatedByAgentId = 'agent-parent';

    expect(() => coordinator.toggleThreadFlag('agent-dina', {
      id: 'delegate_to_worktree', value: true,
    })).toThrow('already a delegated co-agent');
    expect(agents[0]!.threadFlags).toBeUndefined();
    expect(onAgentUpdated).not.toHaveBeenCalled();

    agents[0]!.threadFlags = { delegate_to_worktree: true };
    expect(coordinator.toggleThreadFlag('agent-dina', {
      id: 'delegate_to_worktree', value: false,
    })).toStrictEqual({ success: true, id: 'delegate_to_worktree', value: false });
    expect(agents[0]!.threadFlags).toBeUndefined();
  });

  it('labels every backend status variant', () => {
    const { agents, coordinator } = fixture();
    for (const [status, label] of [
      [{ type: 'working' }, 'Working'],
      [{ type: 'awaitingInput' }, 'Awaiting input'],
      [{ type: 'awaitingInput', detail: 'Choose a file' }, 'Choose a file'],
      [{ type: 'error', message: '' }, 'Error'],
      [{ type: 'idle' }, 'Idle'],
    ] as Array<[AgentStatus, string]>) {
      agents[0]!.status = status;
      expect(coordinator.debugAgents()[0]?.status).toBe(label);
    }
  });

  it('sends by id, folder, or unique case-insensitive name and exposes sender names', () => {
    const { coordinator, onInboxMessage } = fixture();

    expect(coordinator.sendMessage('agent-dina', 'agent-jesse', 'first')).toMatchObject({
      success: true,
      recipientId: 'agent-jesse',
      recipientName: 'Jesse',
    });
    coordinator.sendMessage('DINA', '/tmp/jesse', 'second');
    coordinator.sendMessage('agent-dina', 'jesse', 'third');

    expect(coordinator.latestUnreadMessageId('agent-jesse')).toBe('message-3');
    expect(coordinator.peekUnreadMessages('agent-jesse')).toStrictEqual([
      expect.objectContaining({ id: 'message-1', from: 'Dina', fromId: 'agent-dina', content: 'first' }),
      expect.objectContaining({ id: 'message-2', content: 'second' }),
      expect.objectContaining({ id: 'message-3', content: 'third' }),
    ]);
    expect(onInboxMessage).toHaveBeenCalledTimes(3);
  });

  it('checks without marking, marks selected messages, and takes the remainder', () => {
    const { coordinator } = fixture();
    coordinator.sendMessage('agent-dina', 'agent-jesse', 'one');
    coordinator.sendMessage('agent-dina', 'agent-jesse', 'two');

    expect(coordinator.checkMessages('agent-jesse', false).messages).toHaveLength(2);
    expect(coordinator.peekUnreadMessages('agent-jesse')).toHaveLength(2);
    coordinator.markMessagesRead(['message-1', 'missing']);
    expect(coordinator.takeUnreadMessages('agent-jesse')).toStrictEqual([
      expect.objectContaining({ id: 'message-2', timestamp: '2026-08-02T12:00:00.000Z' }),
    ]);
    expect(coordinator.latestUnreadMessageId('agent-jesse')).toBeNull();
    expect(coordinator.checkMessages('agent-jesse')).toStrictEqual({ messages: [] });
  });

  it('broadcasts only to registered teammates other than the sender', () => {
    const { agents, coordinator, onInboxMessage } = fixture();
    agents[0]!.isRegistered = true;
    agents[1]!.isRegistered = true;
    agents.push(agent({ id: 'agent-lee', name: 'Lee', folder: '/tmp/lee', isRegistered: false }));
    agents.push(agent({ id: 'agent-other', name: 'Other', folder: '/tmp/other', teamId: 'team-other', isRegistered: true }));

    expect(coordinator.broadcastMessage('agent-dina', 'hello')).toStrictEqual({
      success: true,
      recipientCount: 1,
    });
    expect(coordinator.peekUnreadMessages('agent-jesse')).toHaveLength(1);
    expect(coordinator.peekUnreadMessages('agent-lee')).toHaveLength(0);
    expect(coordinator.peekUnreadMessages('agent-other')).toHaveLength(0);
    expect(onInboxMessage).toHaveBeenCalledWith('agent-jesse', 'message-1');

    agents[1]!.isRegistered = false;
    expect(coordinator.broadcastMessage('agent-dina', 'anyone?')).toStrictEqual({
      success: false,
      recipientCount: 0,
    });
  });

  it('limits visibility to unteamed agents for an unteamed caller', () => {
    const { agents, coordinator } = fixture();
    agents.push(agent({ id: 'agent-loose', name: 'Loose', folder: '/tmp/loose', teamId: undefined }));

    expect(coordinator.listAgents('agent-loose').agents.map(({ id }) => id)).toStrictEqual(['agent-loose']);
  });

  it('rejects missing, cross-team, and ambiguous recipients with useful errors', () => {
    const { agents, coordinator } = fixture();
    agents.push(agent({ id: 'agent-other', name: 'Other', folder: '/tmp/other', teamId: 'team-other' }));
    agents.push(agent({ id: 'agent-jesse-2', name: 'Jesse', folder: '/tmp/jesse-2' }));

    expect(() => coordinator.sendMessage('agent-dina', 'Other', 'nope'))
      .toThrowError('Failed to send message: Recipient not found');
    expect(() => coordinator.sendMessage('agent-dina', 'Jesse', 'ambiguous'))
      .toThrowError("Recipient name 'Jesse' is ambiguous");
    expect(() => coordinator.listAgents('missing'))
      .toThrowError(/Visible agents:\n\n- agent-dina: Dina/);
    const emptyCoordinator = new ClawMcpAgentCoordinator({ getAgents: () => [] });
    expect(() => emptyCoordinator.listAgents('missing'))
      .toThrowError("Agent 'missing' not found. No agents are currently available.");
  });

  it('displays normalized inline markdown or paths', async () => {
    const onDisplayMarkdown = vi.fn().mockResolvedValue({
      success: true,
      message: 'Displayed',
      path: 'docs/mcp.md',
      title: 'MCP',
    });
    const { coordinator } = fixture({ onDisplayMarkdown });

    await expect(coordinator.displayMarkdown('agent-dina', {
      path: '  docs/mcp.md ',
      title: ' MCP ',
    })).resolves.toMatchObject({ success: true, path: 'docs/mcp.md' });
    expect(onDisplayMarkdown).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), {
      path: 'docs/mcp.md',
      title: 'MCP',
    });

    await coordinator.displayMarkdown('agent-dina', { markdown: ' # Report ' });
    expect(onDisplayMarkdown).toHaveBeenLastCalledWith(expect.anything(), { markdown: '# Report' });
  });

  it('validates markdown display inputs and availability', async () => {
    const { coordinator } = fixture();

    await expect(coordinator.displayMarkdown('agent-dina', {}))
      .rejects.toThrowError('Provide exactly one of markdown or path.');
    await expect(coordinator.displayMarkdown('agent-dina', { markdown: '# Hi', path: 'x.md' }))
      .rejects.toThrowError('Provide exactly one of markdown or path.');
    await expect(coordinator.displayMarkdown('agent-dina', { markdown: '# Hi' }))
      .rejects.toThrowError('Markdown display is not available.');
  });

  it('validates and delegates work item lifecycle updates', async () => {
    const onUpdateWorkItem = vi.fn().mockResolvedValue({
      success: true,
      workItemId: 'github:openai/codex#42',
      status: 'readyForReview',
      updatedAt: '2026-08-02T12:00:00.000Z',
    });
    const { coordinator } = fixture({ onUpdateWorkItem });

    await coordinator.updateWorkItem('agent-dina', ' github:openai/codex#42 ', 'readyForReview');
    expect(onUpdateWorkItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-dina' }),
      'github:openai/codex#42',
      'readyForReview',
      undefined,
    );
    await expect(coordinator.updateWorkItem('agent-dina', '   ', 'readyForReview'))
      .rejects.toThrowError('Provide the work item ID from your assignment prompt.');
    await expect(coordinator.updateWorkItem('agent-dina', 'github:x/y#1', 'blocked'))
      .rejects.toThrowError('Provide a concise note');
    await expect(fixture().coordinator.updateWorkItem('agent-dina', 'github:x/y#1', 'inProgress'))
      .rejects.toThrowError('Work item updates are not available.');
  });

  it('lists repositories and static or refreshed worktrees', async () => {
    const repos = [{
      name: 'codex-claw',
      path: '/src/codex-claw',
      worktrees: [{ name: 'main', path: '/src/codex-claw' }],
    }];
    const onListSourceRepositories = vi.fn().mockResolvedValue(repos);
    const onListSourceWorktrees = vi.fn().mockResolvedValue([
      { name: 'coverage', path: '/src/codex-claw-coverage' },
    ]);
    const refreshed = fixture({ onListSourceRepositories, onListSourceWorktrees }).coordinator;
    const staticCoordinator = fixture({ onListSourceRepositories }).coordinator;

    await expect(refreshed.listSourceRepositories('agent-dina')).resolves.toStrictEqual({ repos });
    await expect(refreshed.listSourceWorktrees('agent-dina', ' /src/codex-claw ')).resolves.toStrictEqual({
      repoPath: '/src/codex-claw',
      worktrees: [{ name: 'coverage', path: '/src/codex-claw-coverage' }],
    });
    await expect(staticCoordinator.listSourceWorktrees('agent-dina', '/src/codex-claw')).resolves.toStrictEqual({
      repoPath: '/src/codex-claw',
      worktrees: repos[0]!.worktrees,
    });
    await expect(refreshed.listSourceWorktrees('agent-dina', '/src/missing'))
      .rejects.toThrowError('Source repository not found.');
  });

  it('reports unavailable repository operations', async () => {
    const { coordinator } = fixture();

    await expect(coordinator.listSourceRepositories('agent-dina'))
      .rejects.toThrowError('Source repositories are not available.');
    await expect(coordinator.createSourceWorktree('agent-dina', {
      repoPath: '/src/claw',
      branchName: 'coverage',
    })).rejects.toThrowError('Source worktree creation is not available.');
  });

  it('normalizes worktree creation and agent creation inputs', async () => {
    const onCreateSourceWorktree = vi.fn().mockResolvedValue({
      name: 'coverage',
      path: '/src/claw-coverage',
    });
    const onCreateAgent = vi.fn().mockResolvedValue({
      success: true,
      agentId: 'agent-new',
      message: 'Created',
    });
    const { coordinator } = fixture({ onCreateSourceWorktree, onCreateAgent });

    await coordinator.createSourceWorktree('agent-dina', {
      repoPath: ' /src/claw ',
      branchName: ' coverage ',
      destinationPath: ' /src/claw-coverage ',
    });
    expect(onCreateSourceWorktree).toHaveBeenCalledWith({
      repoPath: '/src/claw',
      branchName: 'coverage',
      destinationPath: '/src/claw-coverage',
    });

    await coordinator.createAgent('agent-dina', {
      repoPath: ' /src/claw ',
      name: ' New Agent ',
      model: ' gpt-5.6-sol ',
      reasoningEffort: ' high ',
      createWorktree: true,
      branchName: ' coverage ',
      destinationPath: ' /src/claw-coverage ',
      prompt: ' Fix the flaky test. ',
    });
    expect(onCreateAgent).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), {
      repoPath: '/src/claw',
      name: 'New Agent',
      backend: 'codex',
      model: 'gpt-5.6-sol',
      reasoningEffort: 'high',
      createWorktree: true,
      branchName: 'coverage',
      destinationPath: '/src/claw-coverage',
      prompt: 'Fix the flaky test.',
      teamId: 'team-codex-claw',
    });
  });

  it('reports unavailable agent creation', async () => {
    await expect(fixture().coordinator.createAgent('agent-dina', { repoPath: '/src/claw' }))
      .rejects.toThrowError('Agent creation is not available.');
  });

  it('returns safe empty inbox state for unknown agents', () => {
    const { coordinator } = fixture();

    expect(coordinator.latestUnreadMessageId('missing')).toBeNull();
    expect(coordinator.takeUnreadMessages('missing')).toStrictEqual([]);
    expect(coordinator.peekUnreadMessages('missing')).toStrictEqual([]);
  });

  it('keeps only the latest 100 read messages during cleanup', () => {
    const { coordinator } = fixture();
    for (let index = 0; index < 102; index += 1) {
      coordinator.sendMessage('agent-dina', 'agent-jesse', `message ${index}`);
      coordinator.checkMessages('agent-jesse');
    }

    coordinator.sendMessage('agent-dina', 'agent-jesse', 'still delivered');
    expect(coordinator.takeUnreadMessages('agent-jesse')).toStrictEqual([
      expect.objectContaining({ content: 'still delivered' }),
    ]);
  });

  it('preserves sender ids when the sender no longer exists', () => {
    const { agents, coordinator } = fixture();
    coordinator.sendMessage('agent-dina', 'agent-jesse', 'goodbye');
    agents.splice(agents.findIndex(({ id }) => id === 'agent-dina'), 1);

    expect(coordinator.takeUnreadMessages('agent-jesse')[0]).toMatchObject({
      from: 'agent-dina',
      fromId: 'agent-dina',
    });
  });

  it('uses a dedicated error type for tool-facing validation', () => {
    expect(new McpToolError('bad input')).toMatchObject({
      name: 'McpToolError',
      message: 'bad input',
    });
  });

  it('validates, trims, and delegates spoken announcements without updating agent state', async () => {
    const onAnnounce = vi.fn().mockResolvedValue({
      success: true,
      phase: 'start',
    });
    const { agents, coordinator, onAgentUpdated } = fixture({ onAnnounce });

    await expect(coordinator.announce('agent-dina', 'start', '  I’ll take it.  ')).resolves.toStrictEqual({
      success: true,
      phase: 'start',
    });
    expect(onAnnounce).toHaveBeenCalledWith(agents[0], 'start', 'I’ll take it.');
    expect(onAgentUpdated).not.toHaveBeenCalled();
    await expect(coordinator.announce('agent-dina', 'finish', '   '))
      .rejects.toThrowError('Announcement text must not be empty.');
    await expect(coordinator.announce('agent-dina', 'finish', 'x'.repeat(161)))
      .rejects.toThrowError('Announcement text must be 160 characters or fewer.');
    await expect(fixture().coordinator.announce('agent-dina', 'start', 'Hi'))
      .rejects.toThrowError('Spoken announcements are not available.');
  });
});

function fixture(overrides: Partial<ClawMcpAgentCoordinatorOptions> = {}) {
  const agents = createInitialSnapshot().agents;
  agents[0]!.folder = '/tmp/dina';
  agents[1]!.folder = '/tmp/jesse';
  const onAgentUpdated = vi.fn();
  const onInboxMessage = vi.fn();
  let id = 0;
  const coordinator = new ClawMcpAgentCoordinator({
    getAgents: () => agents,
    onAgentUpdated,
    onInboxMessage,
    createId: () => `message-${++id}`,
    now: () => new Date('2026-08-02T12:00:00.000Z'),
    ...overrides,
  });
  return { agents, coordinator, onAgentUpdated, onInboxMessage };
}

function agent(overrides: Partial<Agent> & Pick<Agent, 'id' | 'name' | 'folder'>): Agent {
  const { id, name, folder, ...rest } = overrides;
  return {
    id,
    teamId: 'team-codex-claw',
    name,
    avatar: 'AG',
    folder,
    backend: 'codex',
    backendDefaults: { kind: 'codex' },
    status: { type: 'idle' },
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
    ...rest,
  };
}
