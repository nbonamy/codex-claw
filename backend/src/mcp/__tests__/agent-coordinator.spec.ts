import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/shared/snapshot';
import { ClawMcpAgentCoordinator } from '../agent-coordinator';

describe('ClawMcpAgentCoordinator', () => {
  it('lists source worktrees through the backend git worktree provider when available', async () => {
    const snapshot = createInitialSnapshot();
    const onListSourceWorktrees = vi.fn().mockResolvedValue([
      { name: 'main', path: '/Users/nbonamy/src/codex-claw' },
      { name: 'backend-split', path: '/Users/nbonamy/src/codex-claw-backend-split' },
    ]);
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => snapshot.agents,
      onListSourceRepositories: () => [{
        name: 'codex-claw',
        path: '/Users/nbonamy/src/codex-claw',
        worktrees: [{ name: 'stale-scan-result', path: '/Users/nbonamy/src/codex-claw' }],
      }],
      onListSourceWorktrees,
    });

    await expect(coordinator.listSourceWorktrees('agent-dina', '/Users/nbonamy/src/codex-claw')).resolves.toStrictEqual({
      repoPath: '/Users/nbonamy/src/codex-claw',
      worktrees: [
        { name: 'main', path: '/Users/nbonamy/src/codex-claw' },
        { name: 'backend-split', path: '/Users/nbonamy/src/codex-claw-backend-split' },
      ],
    });
    expect(onListSourceWorktrees).toHaveBeenCalledWith('/Users/nbonamy/src/codex-claw');
  });
});
