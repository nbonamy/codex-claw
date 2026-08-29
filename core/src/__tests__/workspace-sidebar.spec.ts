import { describe, expect, it } from 'vitest';
import type { Agent } from '../contracts';
import { projectWorkspaceSidebar, repositoryIconForAgent } from '../workspace-sidebar';

describe('workspace sidebar projection', () => {
  it('groups primary checkouts and linked worktrees beneath the canonical repository', () => {
    const agents = [
      gitAgent('agent-main', 'Main conversation', '/src/codex-claw', 'main', false),
      gitAgent('agent-feature', 'Implement routing', '/src/codex-claw-routing', 'feat/routing', true),
    ];

    expect(projectWorkspaceSidebar({
      agents,
      activeAgentId: 'agent-feature',
      unreadAgentIds: ['agent-main'],
    })).toStrictEqual([{
      id: 'git:/src/codex-claw',
      kind: 'repository',
      label: 'codex-claw',
      repositoryRoot: '/src/codex-claw',
      repositoryKey: '/src/codex-claw',
      sessions: [{
        agentId: 'agent-main',
        title: 'Main conversation',
        displayTitle: 'Main conversation',
        branch: 'main',
        folder: '/src/codex-claw',
        isLinkedWorktree: false,
        kind: 'main',
        isActive: false,
        isUnread: true,
        status: { type: 'idle' },
        quickSwitchIndex: 0,
      }, {
        agentId: 'agent-feature',
        title: 'Implement routing',
        displayTitle: 'Implement routing',
        branch: 'feat/routing',
        folder: '/src/codex-claw-routing',
        isLinkedWorktree: true,
        kind: 'worktree',
        isActive: true,
        isUnread: false,
        status: { type: 'working' },
        quickSwitchIndex: 1,
      }],
    }]);
  });

  it('classifies ordinary branches, detached heads, and folder sessions for presentation', () => {
    const branch = gitAgent('agent-branch', 'Branch', '/src/repo', 'feat/sidebar', false);
    const detached = gitAgent('agent-detached', 'Detached', '/src/repo-detached', 'main', false);
    if (detached.workspace?.kind === 'git') detached.workspace = { ...detached.workspace, branch: null };
    const folder = baseAgent('agent-folder', 'Notes', '/src/notes');

    expect(projectWorkspaceSidebar({ agents: [branch, detached, folder], activeAgentId: null }))
      .toMatchObject([
        { sessions: [{ kind: 'branch' }, { kind: 'detached' }] },
        { sessions: [{ kind: 'folder' }] },
      ]);
  });

  it('keeps group order stable and collects non-Git agents under Quick chats', () => {
    const folderAgent = baseAgent('agent-notes', 'Scratchpad', '/src/notes');
    folderAgent.workspace = {
      kind: 'folder',
      folder: '/src/notes',
      label: 'notes',
      updatedAt: '2026-08-27T12:00:00.000Z',
    };
    const unclassified = baseAgent('agent-loose', 'Uninitialized', '/tmp/loose');
    const repo = gitAgent('agent-sdk', 'SDK work', '/src/codex-app-sdk', 'main', false, '/src/codex-app-sdk');

    expect(projectWorkspaceSidebar({ agents: [folderAgent, repo, unclassified], activeAgentId: null }))
      .toMatchObject([{
        id: 'quick-chats',
        kind: 'quickChats',
        label: 'Quick chats',
        sessions: [{ agentId: 'agent-notes' }, { agentId: 'agent-loose' }],
      }, {
        id: 'git:/src/codex-app-sdk',
        kind: 'repository',
        label: 'codex-app-sdk',
        sessions: [{ agentId: 'agent-sdk' }],
      }]);
  });

  it('uses agent names without mixing them with branch names', () => {
    const first = gitAgent('agent-one', 'Fix tests', '/src/repo-one', 'feat/one', true);
    const second = gitAgent('agent-two', 'Review tests', '/src/repo-two', 'feat/one', true);

    expect(projectWorkspaceSidebar({ agents: [first, second], activeAgentId: null })[0]?.sessions)
      .toMatchObject([
        { displayTitle: 'Fix tests' },
        { displayTitle: 'Review tests' },
      ]);
  });

  it('falls back to the branch when an agent has no name', () => {
    const agent = gitAgent('agent-unnamed', '   ', '/src/repo', 'feat/sidebar', true);

    expect(projectWorkspaceSidebar({ agents: [agent], activeAgentId: null })[0]?.sessions[0])
      .toMatchObject({ displayTitle: 'feat/sidebar' });
  });

  it('uses the Git origin as the stable repository preference key', () => {
    const agent = gitAgent('agent-origin', 'Origin', '/src/codex-claw-worktree', 'feat/icons', true);
    if (agent.workspace?.kind === 'git') agent.workspace.originUrl = 'git@github.com:nbonamy/codex-claw.git';

    expect(projectWorkspaceSidebar({ agents: [agent], activeAgentId: null })[0]).toMatchObject({
      repositoryRoot: '/src/codex-claw',
      repositoryKey: 'git@github.com:nbonamy/codex-claw.git',
    });
  });

  it('resolves agent identity from the repository icon catalog', () => {
    const agent = gitAgent('agent-origin', 'Origin', '/src/codex-claw-worktree', 'feat/icons', true);
    if (agent.workspace?.kind === 'git') agent.workspace.originUrl = 'git@github.com:nbonamy/codex-claw.git';

    expect(repositoryIconForAgent(agent, {
      'git@github.com:nbonamy/codex-claw.git': '🦞',
    })).toBe('🦞');
    expect(repositoryIconForAgent(agent, {})).toBeUndefined();
    expect(repositoryIconForAgent(baseAgent('agent-folder', 'Folder', '/src/folder'), {
      '/src/folder': '📁',
    })).toBeUndefined();
  });

  it('falls back to persisted repository roots when migrating icon keys', () => {
    const agent = gitAgent('agent-origin', 'Origin', '/src/codex-claw-worktree', 'feat/icons', true);
    if (agent.workspace?.kind === 'git') agent.workspace.originUrl = 'git@github.com:nbonamy/codex-claw.git';

    expect(repositoryIconForAgent(agent, { '/src/codex-claw': '🧠' })).toBe('🧠');
  });
});

function baseAgent(id: string, name: string, folder: string): Agent {
  return {
    id,
    teamId: 'team-test',
    name,
    folder,
    backend: 'codex',
    status: { type: 'idle' },
    createdAt: '2026-08-27T12:00:00.000Z',
    updatedAt: '2026-08-27T12:00:00.000Z',
  };
}

function gitAgent(
  id: string,
  name: string,
  folder: string,
  branch: string,
  linked: boolean,
  primaryWorktreeRoot = '/src/codex-claw',
): Agent {
  const agent = baseAgent(id, name, folder);
  agent.status = id === 'agent-feature' ? { type: 'working' } : { type: 'idle' };
  agent.workspace = {
    kind: 'git',
    folder,
    repositoryName: primaryWorktreeRoot.split('/').at(-1)!,
    repositoryRoot: folder,
    branch,
    isLinkedWorktree: linked,
    primaryWorktreeRoot,
    updatedAt: '2026-08-27T12:00:00.000Z',
  };
  return agent;
}
