import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceSidebarGroup } from '@codex-claw/core/workspace-sidebar';
import { useRepositorySessionMenu } from '../use-repository-session-menu';

const group: WorkspaceSidebarGroup = {
  id: 'git:/src/claw',
  kind: 'repository',
  label: 'claw',
  repositoryRoot: '/src/claw',
  sessions: [{
    agentId: 'agent-one',
    customName: null,
    conversationTitle: null,
    displayTitle: 'main',
    branch: 'main',
    folder: '/src/claw',
    isLinkedWorktree: false,
    kind: 'main',
    isActive: true,
    isUnread: false,
    status: { type: 'idle' },
    quickSwitchIndex: 0,
  }],
};

describe('useRepositorySessionMenu', () => {
  it('loads and caches the default branch for a repository group', async () => {
    const load = vi.fn().mockResolvedValue([{ name: 'main', isDefault: true }]);
    const menu = useRepositorySessionMenu(() => load, translate);

    await menu.setVisible(group, true);
    await menu.setVisible(group, false);
    await menu.setVisible(group, true);

    expect(load).toHaveBeenCalledOnce();
    expect(menu.defaultBranches.value[group.id]).toStrictEqual({ name: 'main', isDefault: true });
  });

  it('captures loader failures and allows a later retry', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([{ name: 'main', isDefault: true }]);
    const menu = useRepositorySessionMenu(() => load, translate);

    await menu.setVisible(group, true);
    expect(menu.errors.value[group.id]).toBe('Could not load branches: offline');
    await menu.setVisible(group, true);

    expect(load).toHaveBeenCalledTimes(2);
    expect(menu.errors.value[group.id]).toBeNull();
  });
});

function translate(key: string, params?: Record<string, string>): string {
  return key === 'errors.branchesLoadWithDetail'
    ? `Could not load branches: ${params?.detail ?? ''}`
    : 'Could not load branches.';
}
