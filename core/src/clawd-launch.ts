import { backendMethods } from './backend-protocol/methods';
import type { ClawBackendHealth } from './backend-protocol/rpc';

export const CODEX_CLAW_HOME_ENV = 'CODEX_CLAW_HOME' as const;
export const CODEX_CLAW_HOST_ENV = 'CODEX_CLAW_HOST' as const;
export const CLAWD_CODEX_HOME_RELATIVE_PATH = 'codex-home' as const;
export const CLAWD_GRACEFUL_SHUTDOWN_TIMEOUT_MS = 5_000 as const;

export type ClawdHost = 'electron' | 'web' | 'cloud';

export type ClawdRuntimeFeatures = {
  computerUse: boolean;
  embeddedBrowser: boolean;
};

export const cloudClawdRuntimeFeatures: Readonly<ClawdRuntimeFeatures> = Object.freeze({
  computerUse: false,
  embeddedBrowser: false,
});

export const webClawdRuntimeFeatures: Readonly<ClawdRuntimeFeatures> = Object.freeze({
  computerUse: false,
  embeddedBrowser: false,
});

export const electronClawdRuntimeFeatures: Readonly<ClawdRuntimeFeatures> = Object.freeze({
  computerUse: true,
  embeddedBrowser: true,
});

export type CreateClawdEnvironmentLaunchOptions = {
  backendHome: string;
  command: string;
  commandArgs?: readonly string[];
  cwd?: string;
  expectedVersion: string;
  host: ClawdHost;
};

export type ClawdEnvironmentLaunchContract = {
  command: string;
  args: readonly string[];
  cwd?: string;
  env: {
    CODEX_CLAW_HOME: string;
    CODEX_CLAW_HOST: ClawdHost;
  };
  paths: {
    codexHomeRelativeToBackendHome: typeof CLAWD_CODEX_HOME_RELATIVE_PATH;
  };
  artifact: {
    expectedVersion: string;
    versionArgs: readonly string[];
  };
  readiness: {
    method: typeof backendMethods.backendHealthGet;
    expectedName: ClawBackendHealth['name'];
    expectedVersion: string;
  };
  shutdown: {
    closeStdin: true;
    signal: 'SIGTERM';
    timeoutMs: typeof CLAWD_GRACEFUL_SHUTDOWN_TIMEOUT_MS;
  };
};

/**
 * Describes one isolated stdio clawd process. The host owns process spawning,
 * authentication, and the absolute backend home; clawd derives its CODEX_HOME
 * from the `codex-home` child and never consumes an inherited global value.
 */
export function createClawdEnvironmentLaunchContract(
  options: CreateClawdEnvironmentLaunchOptions,
): ClawdEnvironmentLaunchContract {
  const command = required(options.command, 'command');
  const backendHome = required(options.backendHome, 'backendHome');
  const expectedVersion = required(options.expectedVersion, 'expectedVersion');
  return {
    command,
    args: [...(options.commandArgs ?? []), '--stdio'],
    ...(options.cwd ? { cwd: options.cwd } : {}),
    env: {
      CODEX_CLAW_HOME: backendHome,
      CODEX_CLAW_HOST: options.host,
    },
    paths: {
      codexHomeRelativeToBackendHome: CLAWD_CODEX_HOME_RELATIVE_PATH,
    },
    artifact: {
      expectedVersion,
      versionArgs: [...(options.commandArgs ?? []), '--version'],
    },
    readiness: {
      method: backendMethods.backendHealthGet,
      expectedName: 'clawd',
      expectedVersion,
    },
    shutdown: {
      closeStdin: true,
      signal: 'SIGTERM',
      timeoutMs: CLAWD_GRACEFUL_SHUTDOWN_TIMEOUT_MS,
    },
  };
}

/** Unknown named hosts fail closed; an absent host keeps desktop compatibility. */
export function clawdRuntimeFeaturesForHost(host: string | undefined): Readonly<ClawdRuntimeFeatures> {
  if (!host || host === 'electron') return electronClawdRuntimeFeatures;
  if (host === 'web') return webClawdRuntimeFeatures;
  return cloudClawdRuntimeFeatures;
}

export function assertCompatibleClawdHealth(health: ClawBackendHealth, expectedVersion: string): void {
  if (health.ok !== true || health.name !== 'clawd' || health.version !== expectedVersion) {
    throw new Error(`Incompatible clawd artifact: expected ${expectedVersion}, received ${health.version}.`);
  }
}

function required(value: string, name: string): string {
  const result = value.trim();
  if (!result) throw new TypeError(`clawd launch ${name} must be a non-empty string.`);
  return result;
}
