import type { AppSnapshot, BenchLocation, BenchTemplate } from '@codex-claw/core/contracts';
import { createEmptySnapshot } from '@codex-claw/core/snapshot';
import { ref } from 'vue';
import { translate } from './i18n';
import { codexClawApi } from './platform-api';

type RemoteBenchStatus = 'notLoaded' | 'loading' | 'loaded' | 'error';
type RemoteBenchLocation = Extract<BenchLocation, { kind: 'remote' }>;

export function createRemoteBenchState(options: { getSnapshot: () => AppSnapshot }) {
  const byConnectionId = ref<Record<string, BenchTemplate[]>>({});
  const statusByConnectionId = ref<Record<string, RemoteBenchStatus>>({});
  const errorByConnectionId = ref<Record<string, string | null>>({});

  async function getSnapshot(location?: BenchLocation): Promise<AppSnapshot> {
    if (!codexClawApi?.getBenchSnapshot) {
      return isRemote(location) ? createEmptySnapshot() : options.getSnapshot();
    }
    return isRemote(location) ? codexClawApi.getBenchSnapshot(location) : options.getSnapshot();
  }

  async function load(location?: BenchLocation): Promise<BenchTemplate[]> {
    if (!isRemote(location)) return options.getSnapshot().bench;
    const connectionId = location.remoteConnectionId.trim();
    if (!codexClawApi?.getBenchSnapshot) {
      set(connectionId, [], 'error', translate('surface.app-state.benchIsNotAvailable'));
      return [];
    }
    statusByConnectionId.value = { ...statusByConnectionId.value, [connectionId]: 'loading' };
    errorByConnectionId.value = { ...errorByConnectionId.value, [connectionId]: null };
    try {
      const snapshot = await codexClawApi.getBenchSnapshot(location);
      cache(location, snapshot);
      return snapshot.bench;
    } catch (error) {
      set(connectionId, [], 'error', error instanceof Error ? error.message : String(error));
      return [];
    }
  }

  async function forLocation(location: BenchLocation): Promise<BenchTemplate[]> {
    if (!isRemote(location)) return options.getSnapshot().bench;
    return byConnectionId.value[location.remoteConnectionId] ?? load(location);
  }

  function locationForAgent(agentId: string): BenchLocation {
    const agent = options.getSnapshot().agents.find((candidate) => candidate.id === agentId);
    return locationForTeamId(agent?.teamId);
  }

  function locationForTeamId(teamId: string | null | undefined): BenchLocation {
    const snapshot = options.getSnapshot();
    const team = teamId
      ? snapshot.teams.find((candidate) => candidate.id === teamId) ?? null
      : snapshot.teams.find((candidate) => candidate.id === snapshot.activeTeamId) ?? snapshot.teams[0] ?? null;
    const remoteConnectionId = team?.remoteConnectionId?.trim() ?? '';
    return remoteConnectionId ? { kind: 'remote', remoteConnectionId } : { kind: 'local' };
  }

  function cache(location: RemoteBenchLocation, snapshot: AppSnapshot): void {
    set(location.remoteConnectionId.trim(), snapshot.bench, 'loaded', null);
  }

  function prune(): void {
    const ids = new Set(options.getSnapshot().remoteConnections.connections.map((connection) => connection.id));
    byConnectionId.value = filterRecordByKeys(byConnectionId.value, ids);
    statusByConnectionId.value = filterRecordByKeys(statusByConnectionId.value, ids);
    errorByConnectionId.value = filterRecordByKeys(errorByConnectionId.value, ids);
  }

  function set(
    connectionId: string,
    bench: BenchTemplate[],
    status: RemoteBenchStatus,
    error: string | null,
  ): void {
    byConnectionId.value = { ...byConnectionId.value, [connectionId]: bench };
    statusByConnectionId.value = { ...statusByConnectionId.value, [connectionId]: status };
    errorByConnectionId.value = { ...errorByConnectionId.value, [connectionId]: error };
  }

  return {
    benchForLocation: forLocation,
    cacheSnapshot: cache,
    errorByConnectionId,
    getSnapshot,
    isRemote,
    load,
    locationForAgent,
    locationForTeamId,
    prune,
    remoteBenchByConnectionId: byConnectionId,
    statusByConnectionId,
  };
}

function isRemote(location: BenchLocation | undefined): location is RemoteBenchLocation {
  return location?.kind === 'remote' && location.remoteConnectionId.trim().length > 0;
}

function filterRecordByKeys<T>(record: Record<string, T>, keys: Set<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => keys.has(key)));
}
