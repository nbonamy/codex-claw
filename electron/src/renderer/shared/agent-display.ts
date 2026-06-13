import type { Agent, AgentStatus } from '@codex-claw/shared/contracts';

export function agentStatusLabel(status: AgentStatus['type']): string {
  switch (status) {
    case 'working':
      return 'Working';
    case 'starting':
      return 'Starting';
    case 'awaitingInput':
      return 'Awaiting input';
    case 'error':
      return 'Error';
    case 'idle':
      return 'Idle';
  }
}

export function agentStatusText(agent: Agent): string {
  if (agent.statusText) {
    return agent.statusText;
  }

  switch (agent.status.type) {
    case 'working':
      return agent.status.detail ?? agentStatusLabel(agent.status.type);
    case 'awaitingInput':
      return agent.status.detail ?? agentStatusLabel(agent.status.type);
    case 'error':
      return agent.status.message ?? agentStatusLabel(agent.status.type);
    case 'starting':
    case 'idle':
      return agentStatusLabel(agent.status.type);
  }
}

export function folderBasename(folder: string): string {
  return folder.trim().split(/[\\/]/).filter(Boolean).at(-1) ?? folder;
}

export function agentCanReceivePrompt(agent: Agent): boolean {
  return agent.status.type !== 'working' && agent.status.type !== 'starting';
}
