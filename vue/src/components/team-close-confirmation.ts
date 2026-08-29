
import { translate } from '../i18n';
import { ElMessageBox } from 'element-plus';
import type { Team } from '@codex-claw/core/contracts';

export async function confirmCloseTeam(team: Team): Promise<boolean> {
  try {
    const isRemoteTeam = Boolean(team.remoteConnectionId);
    await ElMessageBox.confirm(
      isRemoteTeam
        ? `${team.name} will be deleted on the remote backend. Its agents and conversations will stop there.`
        : `Agents and messages in ${team.name} will be removed from Codex Claw.`,
      isRemoteTeam ? `Delete ${team.name}?` : `Close ${team.name}?`,
      {
        cancelButtonText: translate('common.cancel'),
        confirmButtonText: isRemoteTeam ? translate('surface.team-close-confirmation.deleteTeam') : translate('surface.team-close-confirmation.closeTeam'),
        type: 'warning',
      },
    );
    return true;
  } catch {
    // Element Plus rejects when the user cancels or closes the confirmation.
    return false;
  }
}

export async function confirmDisconnectTeam(team: Team): Promise<boolean> {
  try {
    await ElMessageBox.confirm(
      `${team.name} will be removed from this app. Its agents keep running on the remote backend.`,
      `Disconnect from ${team.name}?`,
      {
        cancelButtonText: translate('common.cancel'),
        confirmButtonText: translate('common.disconnect'),
        type: 'info',
      },
    );
    return true;
  } catch {
    return false;
  }
}
