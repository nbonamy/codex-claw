import type { Agent, AgentBackend, AppGeneralSettings } from './contracts';

export function enabledAgentBackends(settings: Pick<AppGeneralSettings, 'claudeCodeEnabled'>): AgentBackend[] {
  return settings.claudeCodeEnabled ? ['codex', 'claude'] : ['codex'];
}

export function resolveAgentBackend(settings: Pick<AppGeneralSettings, 'claudeCodeEnabled'>, requested?: AgentBackend): AgentBackend {
  const enabled = enabledAgentBackends(settings);
  const backend = requested ?? enabled[0]!;
  if (!enabled.includes(backend)) throw new Error(`Backend is not enabled: ${backend}`);
  return backend;
}

export function canSelectAgentBackend(agent: Agent): boolean {
  return !agent.hasSubmittedPrompt && !agent.backendSession && agent.status.type === 'idle';
}
