import { ElMessageBox } from 'element-plus';
import type { Team } from '@codex-claw/shared/contracts';

export async function confirmCloseTeam(team: Team): Promise<boolean> {
  try {
    await ElMessageBox.confirm(
      `Agents and messages in ${team.name} will be removed from Codex Claw.`,
      `Close ${team.name}?`,
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Close Team',
        type: 'warning',
      },
    );
    return true;
  } catch {
    // Element Plus rejects when the user cancels or closes the confirmation.
    return false;
  }
}
