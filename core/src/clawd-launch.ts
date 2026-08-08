import { backendMethods } from './backend-protocol/methods';
import type { ClawBackendHealth } from './backend-protocol/rpc';

export const CODEX_CLAW_HOME_ENV = 'CODEX_CLAW_HOME' as const;
export const CODEX_CLAW_HOST_ENV = 'CODEX_CLAW_HOST' as const;
export const CODEX_CLAW_CODEX_HOME_ENV = 'CODEX_CLAW_CODEX_HOME' as const;
export const CLAWD_CODEX_HOME_RELATIVE_PATH = 'codex-home' as const;
export const CLAWD_GRACEFUL_SHUTDOWN_TIMEOUT_MS = 5_000 as const;

export type ClawdHost = string;

export type ClawdRuntimeFeatures = {
  codexResourceSharing: boolean;
  computerUse: boolean;
  embeddedBrowser: boolean;
};

export const restrictedClawdRuntimeFeatures: Readonly<ClawdRuntimeFeatures> = Object.freeze({
  codexResourceSharing: false,
  computerUse: false,
  embeddedBrowser: false,
});

export const webClawdRuntimeFeatures: Readonly<ClawdRuntimeFeatures> = Object.freeze({
  codexResourceSharing: true,
  computerUse: false,
  embeddedBrowser: false,
});

export const desktopClawdRuntimeFeatures: Readonly<ClawdRuntimeFeatures> = Object.freeze({
  codexResourceSharing: true,
  computerUse: true,
  embeddedBrowser: true,
});

export type CreateClawdEnvironmentLaunchOptions = {
  backendHome: string;
  codexHome?: string;
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
    CODEX_CLAW_CODEX_HOME?: string;
  };
  codexHome:
    | { kind: 'backend-home-relative'; relativePath: typeof CLAWD_CODEX_HOME_RELATIVE_PATH }
    | { kind: 'explicit'; path: string };
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
  const backendHome = absolutePath(options.backendHome, 'backendHome');
  const expectedVersion = required(options.expectedVersion, 'expectedVersion');
  const host = required(options.host, 'host');
  const codexHome = options.codexHome === undefined
    ? undefined
    : absolutePath(options.codexHome, 'codexHome');
  return {
    command,
    args: [...(options.commandArgs ?? []), '--stdio'],
    ...(options.cwd ? { cwd: options.cwd } : {}),
    env: {
      CODEX_CLAW_HOME: backendHome,
      CODEX_CLAW_HOST: host,
      ...(codexHome ? { CODEX_CLAW_CODEX_HOME: codexHome } : {}),
    },
    codexHome: codexHome
      ? { kind: 'explicit', path: codexHome }
      : { kind: 'backend-home-relative', relativePath: CLAWD_CODEX_HOME_RELATIVE_PATH },
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
  if (!host || host === 'desktop') return desktopClawdRuntimeFeatures;
  if (host === 'web') return webClawdRuntimeFeatures;
  return restrictedClawdRuntimeFeatures;
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

function absolutePath(value: string, name: string): string {
  const result = required(value, name);
  if (result.startsWith('/') || result.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(result)) return result;
  throw new TypeError(`clawd launch ${name} must be an absolute path.`);
}
