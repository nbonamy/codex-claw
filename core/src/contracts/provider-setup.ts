import type { AgentBackend, ClaudeAuthentication, CodexAuthentication } from '../contracts';

export type ProviderAuthenticationAction = { action: 'check' | 'cancel' | 'logout'; loginId?: string };

/** App-owned authentication metadata, cached only for the life of the host. */
export type ProviderAuthentication =
  | { kind: 'codex'; connected: boolean; state: CodexAuthentication }
  | { kind: 'claude'; connected: boolean; state: ClaudeAuthentication };

/** Runtime observation, never persisted as an enable/disable preference. */
export type ProviderConnection = {
  backend: AgentBackend;
  installed: boolean;
  connected: boolean;
  /** Missing on older snapshots means enabled. Disabling never logs out. */
  enabled?: boolean;
  checking: boolean;
  error?: string;
  authentication?: ProviderAuthentication;
};

export function isProviderConnection(value: unknown): value is ProviderConnection {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (candidate.backend === 'codex' || candidate.backend === 'claude')
    && typeof candidate.installed === 'boolean' && typeof candidate.connected === 'boolean'
    && typeof candidate.checking === 'boolean' && (candidate.enabled === undefined || typeof candidate.enabled === 'boolean')
    && (candidate.error === undefined || typeof candidate.error === 'string')
    && (candidate.authentication === undefined || (isProviderAuthentication(candidate.authentication) && candidate.authentication.kind === candidate.backend));
}

function isProviderAuthentication(value: unknown): value is ProviderAuthentication {
  if (!record(value) || typeof value.connected !== 'boolean' || !record(value.state)) return false;
  const state = value.state;
  if (value.kind === 'claude') return typeof state.loggedIn === 'boolean'
    && (state.configDirectory === undefined || state.configDirectory === null || typeof state.configDirectory === 'string');
  if (value.kind !== 'codex' || typeof state.requiresOpenaiAuth !== 'boolean' || !record(state.login)) return false;
  const account = state.account;
  return ['idle', 'starting', 'pending', 'completed', 'cancelled', 'error'].includes(String(state.login.status))
    && (state.login.error === null || typeof state.login.error === 'string')
    && (account === null || (record(account) && (account.type === 'apiKey'
      || (account.type === 'chatgpt' && (account.email === null || typeof account.email === 'string') && typeof account.planType === 'string')
      || (account.type === 'amazonBedrock' && ['codexManaged', 'awsManaged'].includes(String(account.credentialSource))))));
}

function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

export type ProviderSetupChoice = { isolated: boolean; shareSkills: boolean };
export type ProviderHomeSettings = ProviderSetupChoice & { homePath: string };
export type ProviderSetupStatus = ProviderHomeSettings & {
  backend: AgentBackend;
  installed: boolean;
  locked: boolean;
};
