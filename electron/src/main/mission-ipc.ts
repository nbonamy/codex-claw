import type { TypedIpcMain } from '@codex-app-sdk/electron';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { ipcChannels, type CodexClawIpcRequests } from '@codex-claw/core/ipc';
import type { AppSnapshot } from '@codex-claw/core/contracts';
import type { ClawBackendClientPort } from './backend-client';

export function registerMissionIpcHandlers(ipc: TypedIpcMain<CodexClawIpcRequests>, backend: () => ClawBackendClientPort, adopt: (snapshot: AppSnapshot) => AppSnapshot | Promise<AppSnapshot>): void {
  ipc.handle(ipcChannels.executeMission, async (_event, input) => adopt(await backend().request<AppSnapshot>(backendMethods.missionExecute, { input })));
  ipc.handle(ipcChannels.createMission, async (_event, input) => adopt(await backend().request<AppSnapshot>(backendMethods.missionCreate, { input })));
  ipc.handle(ipcChannels.updateMission, async (_event, input) => adopt(await backend().request<AppSnapshot>(backendMethods.missionUpdate, { input })));
}
