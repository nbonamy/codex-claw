import { homedir } from 'node:os';
import { agentFolder } from '@codex-claw/core/agent-folder';
import type { Agent } from '@codex-claw/core/contracts';

// Claude requires a cwd even for Quick Chats; this is not a project association.
export function claudeWorkingDirectory(agent: Pick<Agent, 'folder'>): string {
  return agentFolder(agent) ?? homedir();
}
