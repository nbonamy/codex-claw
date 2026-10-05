import { product } from '@workspace/core/product';

import { translate } from '../i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { Team } from '@workspace/core/contracts';

export async function confirmCloseTeam(
  team: Team,
  remote?: { loadTeams: (connectionId: string) => Promise<Team[]>; hostName: string },
): Promise<'close' | 'disconnect' | null> {
  if (team.remoteConnectionId) {
    try {
      if (!remote) throw new Error(translate('surface.team-close-confirmation.remoteTeamsUnavailable'));
      const remoteTeams = await remote.loadTeams(team.remoteConnectionId);
      if (!remoteTeams.some(remoteTeam => remoteTeam.id === team.remoteTeamId)) {
        throw new Error(translate('surface.team-close-confirmation.remoteTeamNotFound'));
      }
      if (remoteTeams.length === 1) {
        try {
          await ElMessageBox.confirm(
            translate('surface.team-close-confirmation.onlyRemoteTeam', { team: team.name, host: remote.hostName }),
            translate('surface.team-close-confirmation.cannotDeleteTeam'),
            {
              cancelButtonText: translate('common.cancel'),
              confirmButtonText: translate('surface.team-close-confirmation.yes'),
              type: 'info',
            },
          );
          return 'disconnect';
        } catch {
          return null;
        }
      }
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  try {
    const isRemoteTeam = Boolean(team.remoteConnectionId);
    await ElMessageBox.confirm(
      isRemoteTeam
        ? 'Agents, missions and quick chats will be deleted on the remote backend. Mission worktrees will not be deleted.'
        : `Agents, missions and quick chats will be removed from ${product.name}. Mission worktrees will not be deleted.`,
      isRemoteTeam ? `Delete ${team.name}?` : `Close ${team.name}?`,
      {
        cancelButtonText: translate('common.cancel'),
        confirmButtonText: isRemoteTeam ? translate('surface.team-close-confirmation.deleteTeam') : translate('surface.team-close-confirmation.closeTeam'),
        type: 'warning',
      },
    );
    return 'close';
  } catch {
    // Element Plus rejects when the user cancels or closes the confirmation.
    return null;
  }
}
