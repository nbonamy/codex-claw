import * as z from 'zod/v4';
import { product } from '@workspace/core/product';
import { readBundledSkill } from '../bundled-skills/catalog';
import type { AppMcpAgentCoordinator } from './agent-coordinator';
import { loggedToolResult, type AppMcpToolModuleProvider } from './tool-modules';

export function createSkillToolModuleProvider(
  coordinator: AppMcpAgentCoordinator,
  computerUseEnabled: () => boolean,
): AppMcpToolModuleProvider {
  return {
    id: 'bundled-skills',
    resolve: ({ agentId }) => ({
      id: 'bundled-skills',
      register: server => server.registerTool('read-skill', {
        description: `Load a bundled ${product.name} skill by its catalog name before using that capability. Returns instructions, not authorization to act. Only skills available to this caller are readable; paths and personal skills are not accepted.`,
        inputSchema: { name: z.string().min(1).max(100) },
        annotations: { readOnlyHint: true, openWorldHint: false },
      }, async ({ name }) => {
        let markdown = '';
        const result = await loggedToolResult('read-skill', { agentId, name }, () => {
          const mission = coordinator.missionContext(agentId);
          const definition = readBundledSkill(name, { computerUseEnabled: computerUseEnabled(), missionStage: mission?.stage });
          markdown = definition.markdown;
          return { name: definition.name, loaded: true };
        });
        if (!result.isError) result.content = [{ type: 'text', text: markdown }];
        return result;
      }),
    }),
  };
}
