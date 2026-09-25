import type { AppSnapshot } from '@codex-claw/core/contracts';
import * as z from 'zod/v4';
import type { CreatedProject } from '../projects/project-creation-service';
import { loggedToolResult, type ClawMcpToolModuleProvider } from './tool-modules';

export function createQuickChatProjectToolModuleProvider(options: {
  snapshot: AppSnapshot;
  createProject: (agentId: string, name: string, prompt: string) => Promise<CreatedProject>;
}): ClawMcpToolModuleProvider {
  return {
    id: 'quick-chat-project',
    resolve: ({ agentId }) => {
      if (options.snapshot.agents.find(agent => agent.id === agentId)?.sessionKind !== 'quickChat') return undefined;
      return {
        id: 'quick-chat-project',
        register: server => {
          server.registerTool('create-project', {
            description: 'Turn this Quick Chat into a new project folder and start a project agent with a self-contained handoff. Use only when the user explicitly asks to create a project. The project is created in the configured source folder without initializing Git, and this Quick Chat remains available.',
            inputSchema: {
              name: z.string().trim().min(1).describe('A single folder name for the new project.'),
              prompt: z.string().trim().min(1).describe('Self-contained first prompt for the new project agent, summarizing the agreed outcome and relevant decisions.'),
            },
          }, ({ name, prompt }) => loggedToolResult('create-project', {
            agentId,
            name,
            promptLength: prompt.length,
          }, async () => {
            const created = await options.createProject(agentId, name, prompt);
            return {
              success: true,
              agentId: created.agent.id,
              agentName: created.agent.name ?? created.repository.name,
              folder: created.repository.path,
              promptSubmitted: created.promptSubmitted,
              message: `Created ${created.repository.name} and started its project agent.`,
            };
          }));
        },
      };
    },
  };
}
