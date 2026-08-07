import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { dialog } from 'electron';
import { isClawSnapshotGetResult } from '@codex-claw/core/backend-protocol/rpc';
import type { AppSnapshot } from '@codex-claw/core/contracts';
import { ClawBackendSocketClient } from './backend-socket-client';
import { getClawdDaemonStatus, getResolvedClawdVersion, refreshClawdDaemon, type DaemonLaunchAgentDependencies } from './daemon-launch-agent';
import { logMain, warnMain } from './log';

type SnapshotClient = {
  close(): Promise<void>;
  request<Result>(method: string, params?: unknown): Promise<Result>;
  start(): Promise<void>;
};

type ShowMessageBox = typeof dialog.showMessageBox;

export type DaemonStartupMaintenanceDependencies = DaemonLaunchAgentDependencies & {
  createSnapshotClient?: (socketPath: string) => SnapshotClient;
  getDaemonStatus?: typeof getClawdDaemonStatus;
  getPackagedVersion?: typeof getResolvedClawdVersion;
  refreshDaemon?: typeof refreshClawdDaemon;
  showMessageBox?: ShowMessageBox;
};

export async function ensureCurrentClawdDaemonForStartup(
  dependencies: DaemonStartupMaintenanceDependencies = {},
): Promise<void> {
  const getDaemonStatus = dependencies.getDaemonStatus ?? getClawdDaemonStatus;
  const getPackagedVersion = dependencies.getPackagedVersion ?? getResolvedClawdVersion;
  const status = await getDaemonStatus(dependencies);
  if (!status.supported || !status.installed || !status.running || !status.version) {
    return;
  }

  const packagedVersion = await getPackagedVersion(dependencies);
  if (!packagedVersion || packagedVersion === status.version) {
    return;
  }

  const active = await daemonHasActiveWork(status.socketPath, dependencies);
  if (active) {
    const response = await (dependencies.showMessageBox ?? dialog.showMessageBox)({
      buttons: ['Continue with old backend', 'Restart backend now'],
      cancelId: 0,
      defaultId: 1,
      message: 'Codex Claw updated. The background backend must restart to use the latest version. Active agents or loops are running.',
      type: 'info',
    });
    if (response.response !== 1) {
      logMain('clawd', 'continuing with stale daemon after app update', {
        daemonVersion: status.version,
        packagedVersion,
        pid: status.pid,
      });
      return;
    }
  }

  logMain('clawd', 'restarting stale daemon after app update', {
    daemonVersion: status.version,
    packagedVersion,
    pid: status.pid,
  });
  await (dependencies.refreshDaemon ?? refreshClawdDaemon)(dependencies);
}

async function daemonHasActiveWork(
  socketPath: string,
  dependencies: DaemonStartupMaintenanceDependencies,
): Promise<boolean> {
  const client = dependencies.createSnapshotClient?.(socketPath) ?? new ClawBackendSocketClient({ socketPath });
  try {
    await client.start();
    const result = await client.request<unknown>(backendMethods.snapshotGet);
    if (!isClawSnapshotGetResult(result)) {
      return true;
    }
    return snapshotHasActiveWork(result.snapshot);
  } catch (error) {
    warnMain('clawd', 'failed to inspect daemon activity before update restart', {
      detail: error instanceof Error ? error.message : String(error),
    });
    return true;
  } finally {
    await client.close().catch(() => undefined);
  }
}

function snapshotHasActiveWork(snapshot: AppSnapshot): boolean {
  return snapshot.agents.some((agent) => (
    agent.status.type === 'starting' ||
    agent.status.type === 'working' ||
    agent.status.type === 'awaitingInput'
  )) || snapshot.loops.some((loop) => (
    loop.executionLog.some((entry) => entry.status === 'working')
  ));
}
