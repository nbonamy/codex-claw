import { describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { BackendConversationRef } from '@codex-claw/core/contracts';
import type { AgentBackendDriver } from '@codex-claw/core/backend-driver';
import { codexBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { ClawBackendServer } from '../server';
import { BackendDriverRpc } from '../driver-rpc';
import type { AgentGitService } from '../git/agent-git-service';
import {
  createTestSnapshot,
  gitWorkspace,
  createTextMessage,
} from './server-test-fixtures';

describe('ClawBackendServer', () => {

  it('owns agent CRUD and layout mutations', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-agent-'));
    const snapshot = createTestSnapshot();
    snapshot.sourceFolder = {
      path: '/Users/nbonamy/src',
      initialized: true,
      recentRepoNames: ['id8'],
    };
    snapshot.teams.push({ id: 'team-other', name: 'Other Team', agentIds: [] });
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
      driverRpc: new BackendDriverRpc(new Map()),
    });

    try {
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'create-agent',
        method: 'agent/create',
        params: { input: { name: 'Dina', folder: tempDir, backend: 'codex', sourceRepositoryName: 'codex-claw', teamId: 'team-test' } },
      })).resolves.toMatchObject({
        result: {
          activeAgentId: expect.stringContaining('agent-'),
          agents: [{ name: 'Dina', folder: tempDir }],
          sourceFolder: {
            recentRepoNames: ['codex-claw', 'id8'],
          },
        },
      });
      const agentId = snapshot.agents[0]?.id ?? '';
      expect(snapshot.teams.find((team) => team.id === 'team-test')?.agentIds).toStrictEqual([agentId]);

      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'update-agent',
        method: 'agent/update',
        params: { input: { id: agentId, name: 'Dina Backend' } },
      })).resolves.toMatchObject({
        result: {
          agents: [{ id: agentId, name: 'Dina Backend', folder: tempDir }],
        },
      });
      const modelSelection = { model: 'sol', reasoningEffort: 'high', serviceTier: null };
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'update-model-selection',
        method: 'agent/update',
        params: { input: { id: agentId, modelSelection } },
      })).resolves.toMatchObject({
        result: { agents: [{ id: agentId, backendDefaults: { kind: 'codex', model: 'sol', reasoningEffort: 'high', serviceTier: null, userSelectedModel: true } }] },
      });
      expect(saveSnapshot).toHaveBeenCalledWith(expect.objectContaining({
        agents: [expect.objectContaining({ backendDefaults: expect.objectContaining({ model: 'sol', userSelectedModel: true }) })],
      }));
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'update-agent-git-diff-target',
        method: 'agent/update',
        params: { input: { id: agentId, gitDiffTarget: { type: 'staged' } } },
      })).resolves.toMatchObject({
        result: {
          agents: [{ id: agentId, name: 'Dina Backend', gitDiffTarget: { type: 'staged' } }],
        },
      });
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'set-open-in-application',
        method: 'client/agentExternalApplication/update',
        params: { agentId, application: 'xcode' },
      })).resolves.toMatchObject({
        result: {
          agents: [{ id: agentId, openInApplication: 'xcode' }],
        },
      });
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'duplicate-agent',
        method: 'agent/duplicate',
        params: { agentId },
      })).resolves.toMatchObject({
        result: {
          agents: [{ id: agentId }, { name: 'Dina Backend (copy)', openInApplication: 'xcode', backendDefaults: { model: 'sol', userSelectedModel: true } }],
        },
      });
      const duplicateId = snapshot.agents[1]?.id ?? '';

      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'move-agent',
        method: 'agent/team/move',
        params: { input: { agentId: duplicateId, teamId: 'team-other' } },
      })).resolves.toMatchObject({
        result: {
          activeTeamId: 'team-other',
          activeAgentId: duplicateId,
        },
      });
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'reorder-agent',
        method: 'client/agentOrder/update',
        params: { input: { teamId: 'team-test', agentId, beforeAgentId: null } },
      })).resolves.toMatchObject({ result: { activeAgentId: expect.any(String) } });
      expect(snapshot.teams.find((team) => team.id === 'team-test')?.agentIds).toStrictEqual([agentId]);
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'close-agent',
        method: 'agent/delete',
        params: { agentId: duplicateId },
      })).resolves.toMatchObject({
        result: {
          agents: [{ id: agentId }],
        },
      });

      expect(saveSnapshot).toHaveBeenCalled();
    } finally {
      await server.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('reorders repository groups atomically with every agent in the repository', async () => {
    const snapshot = createTestSnapshot();
    const createdAt = '2026-06-05T00:00:00.000Z';
    snapshot.agents = [
      {
        id: 'agent-claw-main',
        teamId: 'team-test',
        name: 'Claw main',
        folder: '/src/codex-claw',
        workspace: gitWorkspace('/src/codex-claw', 'codex-claw', 'main'),
        backend: 'codex',
        backendDefaults: { kind: 'codex' },
        status: { type: 'idle' },
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: 'agent-id8',
        teamId: 'team-test',
        name: 'id8',
        folder: '/src/id8',
        workspace: gitWorkspace('/src/id8', 'id8', 'main'),
        backend: 'codex',
        backendDefaults: { kind: 'codex' },
        status: { type: 'idle' },
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: 'agent-claw-worktree',
        teamId: 'team-test',
        name: 'Claw worktree',
        folder: '/src/codex-claw.worktrees/drag-drop',
        workspace: {
          ...gitWorkspace('/src/codex-claw', 'codex-claw', 'feat/drag-drop'),
          folder: '/src/codex-claw.worktrees/drag-drop',
          repositoryRoot: '/src/codex-claw.worktrees/drag-drop',
          isLinkedWorktree: true,
        },
        backend: 'codex',
        backendDefaults: { kind: 'codex' },
        status: { type: 'idle' },
        createdAt,
        updatedAt: createdAt,
      },
    ];
    snapshot.teams[0]!.agentIds = snapshot.agents.map((agent) => agent.id);
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
      driverRpc: new BackendDriverRpc(new Map()),
    });

    try {
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'reorder-repository',
        method: 'client/repositoryOrder/update',
        params: {
          input: {
            teamId: 'team-test',
            repositoryRoot: '/src/codex-claw',
            beforeRepositoryRoot: null,
          },
        },
      })).resolves.toMatchObject({ result: { activeTeamId: 'team-test' } });

      expect(snapshot.clientPreferences?.desktop?.agentOrderByTeam?.['team-test']).toStrictEqual([
        'agent-id8',
        'agent-claw-main',
        'agent-claw-worktree',
      ]);
      expect(saveSnapshot).toHaveBeenCalledOnce();
    } finally {
      await server.close();
    }
  });

  it('forgets the live backend session before closing its agent without retiring the conversation', async () => {
    const snapshot = createTestSnapshot();
    const agent = {
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: '/repo',
      backend: 'codex' as const,
      backendSession: { kind: 'codex' as const, threadId: 'thread-dina' },
      status: { type: 'idle' as const },
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    snapshot.teams[0]!.agentIds = [agent.id];
    snapshot.agents = [agent];
    snapshot.activeAgentId = agent.id;
    const releaseConversation = vi.fn();
    const archiveAgentConversation = vi.fn().mockResolvedValue(undefined);
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToAgentRequest: async () => undefined,
      releaseConversation,
      archiveAgentConversation,
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      saveSnapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'close-agent',
      method: backendMethods.agentDelete,
      params: { agentId: agent.id },
    })).resolves.toMatchObject({ result: { agents: [] } });

    expect(archiveAgentConversation).toHaveBeenCalledWith(expect.objectContaining({
      backendSession: { kind: 'codex', threadId: 'thread-dina' },
    }));
    expect(releaseConversation).toHaveBeenCalledWith(agent.id);
    expect(snapshot.agents).toStrictEqual([]);
    expect(saveSnapshot).toHaveBeenCalledOnce();
    await server.close();
  });

  it('deletes an explicitly confirmed linked worktree before removing its agent', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: '/repo-fix-gh-22',
      backend: 'codex',
      status: { type: 'idle' },
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    }];
    snapshot.activeAgentId = 'agent-dina';
    const validateLinkedWorktreeDeletion = vi.fn();
    const deleteLinkedWorktree = vi.fn();
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      agentGitService: { validateLinkedWorktreeDeletion, deleteLinkedWorktree } as unknown as AgentGitService,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'close-agent-worktree',
      method: backendMethods.agentDelete,
      params: {
        agentId: 'agent-dina',
        input: { deleteWorktree: true, deleteRemoteBranch: true, confirmed: true },
      },
    })).resolves.toMatchObject({ result: { agents: [] } });

    expect(validateLinkedWorktreeDeletion).toHaveBeenCalledWith('/repo-fix-gh-22', true, undefined);
    expect(deleteLinkedWorktree).toHaveBeenCalledWith('/repo-fix-gh-22', true, undefined);
    await server.close();
  });

  it('cleans up a closed pull request after verifying its recorded head', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: '/repo-feature',
      backend: 'codex',
      status: { type: 'idle' },
      pullRequest: {
        provider: 'github',
        repository: 'owner/repo',
        branch: 'feature',
        number: 7,
        title: 'Feature',
        url: 'https://github.com/owner/repo/pull/7',
        draft: false,
        headSha: 'merged-head',
        state: 'closed',
        createdAt: '2026-09-03T11:00:00.000Z',
        updatedAt: '2026-09-03T12:00:00.000Z',
      },
      createdAt: '2026-09-03T10:00:00.000Z',
      updatedAt: '2026-09-03T10:00:00.000Z',
    }];
    const validateLinkedWorktreeDeletion = vi.fn();
    const deleteLinkedWorktree = vi.fn();
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      agentGitService: { validateLinkedWorktreeDeletion, deleteLinkedWorktree } as unknown as AgentGitService,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'cleanup-closed-pr-remote',
      method: backendMethods.agentDelete,
      params: {
        agentId: 'agent-dina',
        input: { deleteWorktree: true, deleteRemoteBranch: true, pullRequestCleanup: true, confirmed: true },
      },
    })).rejects.toThrow('Keep the remote branch');

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'cleanup-closed-pr',
      method: backendMethods.agentDelete,
      params: {
        agentId: 'agent-dina',
        input: { deleteWorktree: true, pullRequestCleanup: true, confirmed: true },
      },
    })).resolves.toMatchObject({ result: { agents: [] } });

    expect(validateLinkedWorktreeDeletion).toHaveBeenCalledWith('/repo-feature', false, 'merged-head');
    expect(deleteLinkedWorktree).toHaveBeenCalledWith('/repo-feature', false, 'merged-head');
    await server.close();
  });

  it('does not delete a worktree shared by another agent', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina', 'agent-jesse'];
    snapshot.agents = [
      {
        id: 'agent-dina', teamId: 'team-test', name: 'Dina', folder: '/repo-feature', backend: 'codex',
        status: { type: 'idle' }, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      },
      {
        id: 'agent-jesse', teamId: 'team-test', name: 'Jesse', folder: '/repo-feature', backend: 'codex',
        status: { type: 'idle' }, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ];
    snapshot.activeAgentId = 'agent-dina';
    const deleteLinkedWorktree = vi.fn();
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      agentGitService: { deleteLinkedWorktree } as unknown as AgentGitService,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'close-shared-worktree',
      method: backendMethods.agentDelete,
      params: { agentId: 'agent-dina', input: { deleteWorktree: true, confirmed: true } },
    })).rejects.toThrow('The worktree is also used by Jesse.');

    expect(deleteLinkedWorktree).not.toHaveBeenCalled();
    expect(snapshot.agents).toHaveLength(2);
    await server.close();
  });

  it('owns agent file listing and reads by resolving agent folders internally', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-agent-files-'));
    const externalTempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-external-file-'));
    const externalFile = path.join(externalTempDir, 'outside.md');
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: tempDir,
      backend: 'codex',
      status: { type: 'idle' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc: new BackendDriverRpc(new Map()),
    });

    try {
      await mkdir(path.join(tempDir, 'docs'), { recursive: true });
      await writeFile(path.join(tempDir, 'README.md'), '# Read me\n');
      await writeFile(path.join(tempDir, 'docs', 'architecture.md'), '# Architecture\n');
      await writeFile(externalFile, '# Outside\n');

      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'list-files',
        method: 'agent/files/list',
        params: { agentId: 'agent-dina' },
      })).resolves.toMatchObject({
        result: expect.arrayContaining([
          { name: 'README.md', path: 'README.md' },
          { name: 'architecture.md', path: 'docs/architecture.md' },
        ]),
      });
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'preview-file',
        method: 'agent/file/preview',
        params: { agentId: 'agent-dina', filePath: 'README.md' },
      })).resolves.toMatchObject({
        result: {
          path: 'README.md',
          content: '# Read me\n',
        },
      });
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'missing-agent',
        method: 'agent/file/preview',
        params: { agentId: 'agent-missing', filePath: 'README.md' },
      })).resolves.toMatchObject({
        error: {
          message: 'Agent not found: agent-missing',
        },
      });
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'external-file',
        method: 'agent/file/preview',
        params: { agentId: 'agent-dina', filePath: externalFile },
      })).resolves.toMatchObject({
        result: {
          path: externalFile,
          content: '# Outside\n',
        },
      });
    } finally {
      await server.close();
      await Promise.all([
        rm(tempDir, { recursive: true, force: true }),
        rm(externalTempDir, { recursive: true, force: true }),
      ]);
    }
  });

  it('previews absolute files from a quick chat without a project workspace', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-quick-chat-file-'));
    const filePath = path.join(tempDir, 'MEMORY.md');
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-quick-chat'];
    snapshot.agents = [{
      id: 'agent-quick-chat',
      teamId: 'team-test',
      sessionKind: 'quickChat',
      name: null,
      folder: null,
      backend: 'codex',
      status: { type: 'idle' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      driverRpc: new BackendDriverRpc(new Map()),
    });

    try {
      await writeFile(filePath, '# Memory\n');
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'preview-quick-chat-absolute-file',
        method: 'agent/file/preview',
        params: { agentId: 'agent-quick-chat', filePath },
      })).resolves.toMatchObject({
        result: { path: filePath, kind: 'text', content: '# Memory\n' },
      });
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'preview-quick-chat-relative-file',
        method: 'agent/file/preview',
        params: { agentId: 'agent-quick-chat', filePath: 'MEMORY.md' },
      })).rejects.toThrow('This session does not have a project workspace.');
    } finally {
      await server.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('owns provider metadata and conversation-history reads by resolving agents internally', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      backendSession: { kind: 'codex', threadId: 'thread-root' },
      status: { type: 'idle' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    snapshot.activeAgentId = 'agent-dina';
    snapshot.subagentTrees['agent-dina'] = {
      rootConversationId: 'thread-root',
      nodes: {
        'thread-child': {
          conversationId: 'thread-child',
          parentConversationId: 'thread-root',
          createdAt: '2026-06-13T00:00:00.000Z',
          status: 'completed',
          updatedAt: '2026-06-13T00:00:00.000Z',
        },
        'thread-grandchild': {
          conversationId: 'thread-grandchild',
          parentConversationId: 'thread-child',
          createdAt: '2026-06-13T00:00:00.000Z',
          status: 'completed',
          updatedAt: '2026-06-13T00:00:00.000Z',
        },
        'thread-legacy-child': {
          conversationId: 'thread-legacy-child',
          parentConversationId: 'thread-root',
          createdAt: '2026-06-13T00:00:00.000Z',
          status: 'completed',
          updatedAt: '2026-06-13T00:00:00.000Z',
        },
      },
      operations: {},
      activities: {
        'activity-child': {
          id: 'activity-child',
          lifecycle: 'completed',
          kind: 'started',
          conversationId: 'thread-child',
          agentPath: '/root/child',
          occurredAt: '2026-06-13T00:00:01.000Z',
        },
        'activity-grandchild': {
          id: 'activity-grandchild',
          lifecycle: 'completed',
          kind: 'started',
          conversationId: 'thread-grandchild',
          agentPath: '/root/child/grandchild',
          occurredAt: '2026-06-13T00:00:02.000Z',
        },
      },
    };
    snapshot.automations = [{
      id: 'automation-bugs',
      name: 'GitHub bugs',
      enabled: true,
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
      repositories: [{
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
        sourceRepositoryPath: '/Users/nbonamy/src/codex-claw',
      }],
      teamId: 'team-test',
      schedule: { intervalMinutes: 60 },
      executionLog: [{
        id: 'automation-exec-1',
        automationId: 'automation-bugs',
        startedAt: '2026-06-13T00:00:00.000Z',
        status: 'completed',
        createdCount: 1,
        createdAgents: [{
          agentId: 'agent-dina',
          agentName: 'Dina',
          workItemId: 'github:nbonamy/codex-claw#12',
          workItemTitle: 'Fix cockpit',
          workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/12',
          conversationRef: { backend: 'codex', threadId: 'thread-dina' },
        }],
      }],
    }];
    const conversations = [{
      id: 'thread-dina',
      title: 'Read docs',
      updatedAt: '2026-06-09T10:00:00.000Z',
      messageCount: 3,
      storageState: 'active' as const,
      ref: { backend: 'codex' as const, threadId: 'thread-dina' },
    }];
    const messages = [{
      ...createTextMessage('user-thread-dina-user-1', 'agent-dina', 'hello'),
      turnId: 'turn-root',
    }];
    const subagentMessage = {
      ...createTextMessage('assistant-thread-child-1', 'agent-dina', 'child result'),
      turnId: 'turn-child',
    };
    const nestedSubagentMessage = {
      ...createTextMessage('assistant-thread-grandchild-1', 'agent-dina', 'nested child result'),
      turnId: 'turn-grandchild',
    };
    const legacySubagentMessage = createTextMessage('assistant-thread-legacy-child-1', 'agent-dina', 'legacy child result');
    const childMessages = [...messages, subagentMessage];
    const grandchildMessages = [subagentMessage, nestedSubagentMessage];
    const legacyChildMessages = [...messages, legacySubagentMessage];
    const listModels = vi.fn().mockResolvedValue([{ id: 'gpt-test', name: 'GPT Test' }]);
    const listPlugins = vi.fn().mockResolvedValue([{ id: 'dropbox', name: 'dropbox', displayName: 'Dropbox', enabled: true }]);
    const listSkills = vi.fn().mockResolvedValue([{ name: 'frontend-design', path: '/skills/frontend-design/SKILL.md' }]);
    const listConversations = vi.fn().mockResolvedValue(conversations);
    const readConversationMessages = vi.fn(async (ref: BackendConversationRef) => {
      if (ref.backend !== 'codex') return messages;
      if (ref.threadId === 'thread-grandchild') return grandchildMessages;
      if (ref.threadId === 'thread-child') return childMessages;
      if (ref.threadId === 'thread-legacy-child') return legacyChildMessages;
      return messages;
    });
    const readConversationSummary = vi.fn(async (_agent: unknown, ref: BackendConversationRef) => ({
      id: ref.backend === 'codex' ? ref.threadId : 'thread-unknown',
      parentConversationId: ref.backend === 'codex' && ref.threadId === 'thread-grandchild'
        ? 'thread-child'
        : 'thread-root',
      agentNickname: ref.backend === 'codex' ? `Nickname ${ref.threadId}` : undefined,
      title: 'Subagent',
      status: 'idle' as const,
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:01.000Z',
      messageCount: 1,
      storageState: 'active' as const,
      ref,
    }));
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToAgentRequest: async () => undefined,
      listConversations,
      listModels,
      listPlugins,
      listSkills,
      readConversationMessages,
      readConversationSummary,
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
    });

    await server.initialize();
    await server.handleMessage({ jsonrpc: '2.0', id: 'snapshot', method: 'snapshot/get' });
    await vi.waitFor(() => {
      expect(snapshot.subagentTrees['agent-dina']?.nodes['thread-child']?.agentNickname)
        .toBe('Nickname thread-child');
      expect(snapshot.subagentTrees['agent-dina']?.nodes['thread-grandchild']?.agentNickname)
        .toBe('Nickname thread-grandchild');
      expect(snapshot.subagentTrees['agent-dina']?.nodes['thread-legacy-child']?.agentNickname)
        .toBe('Nickname thread-legacy-child');
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'models',
      method: 'agent/models/list',
      params: { agentId: 'agent-dina' },
    })).resolves.toMatchObject({ result: [{ id: 'gpt-test', name: 'GPT Test' }] });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'plugins',
      method: 'agent/plugins/list',
      params: { agentId: 'agent-dina' },
    })).resolves.toMatchObject({ result: [{ id: 'dropbox', displayName: 'Dropbox' }] });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'skills',
      method: 'agent/skills/list',
      params: { agentId: 'agent-dina' },
    })).resolves.toMatchObject({ result: [{ name: 'frontend-design' }] });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'conversations',
      method: 'agent/conversations/list',
      params: { agentId: 'agent-dina' },
    })).resolves.toMatchObject({ result: conversations });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'messages',
      method: 'agent/conversation/messages/get',
      params: { agentId: 'agent-dina', ref: { backend: 'codex', threadId: 'thread-dina' } },
    })).resolves.toMatchObject({ result: messages });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'subagent-messages',
      method: 'agent/conversation/messages/get',
      params: { agentId: 'agent-dina', ref: { backend: 'codex', threadId: 'thread-child' } },
    })).resolves.toMatchObject({ result: childMessages });
    expect(readConversationMessages).not.toHaveBeenCalledWith({ backend: 'codex', threadId: 'thread-root' }, 'agent-dina');
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'nested-subagent-messages',
      method: 'agent/conversation/messages/get',
      params: { agentId: 'agent-dina', ref: { backend: 'codex', threadId: 'thread-grandchild' } },
    })).resolves.toMatchObject({ result: grandchildMessages });
    expect(readConversationMessages.mock.calls.filter(([candidate]) => (
      candidate.backend === 'codex' && candidate.threadId === 'thread-child'
    ))).toHaveLength(1);
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'legacy-subagent-messages',
      method: 'agent/conversation/messages/get',
      params: { agentId: 'agent-dina', ref: { backend: 'codex', threadId: 'thread-legacy-child' } },
    })).resolves.toMatchObject({ result: legacyChildMessages });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'unknown-ref',
      method: 'agent/conversation/messages/get',
      params: { agentId: 'agent-dina', ref: { backend: 'codex', threadId: 'thread-unknown' } },
    })).resolves.toMatchObject({ error: { message: 'Conversation reference is not available.' } });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'invalid-ref',
      method: 'agent/conversation/messages/get',
      params: { agentId: 'agent-dina', ref: { backend: 'codex' } },
    })).resolves.toMatchObject({ error: { message: 'Invalid conversation reference.' } });

    expect(listModels).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(listPlugins).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(listSkills).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(listConversations).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), undefined);
    expect(readConversationMessages).toHaveBeenCalledWith({ backend: 'codex', threadId: 'thread-dina' }, 'agent-dina');
    expect(readConversationMessages).toHaveBeenCalledWith({ backend: 'codex', threadId: 'thread-child' }, 'agent-dina');
    expect(readConversationMessages).toHaveBeenCalledWith({ backend: 'codex', threadId: 'thread-grandchild' }, 'agent-dina');
    expect(readConversationMessages).toHaveBeenCalledWith({ backend: 'codex', threadId: 'thread-legacy-child' }, 'agent-dina');
    expect(readConversationMessages).not.toHaveBeenCalledWith({ backend: 'codex', threadId: 'thread-root' }, 'agent-dina');
    await server.close();
  });
});
