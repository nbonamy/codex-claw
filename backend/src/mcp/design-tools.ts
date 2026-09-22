import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { DesignService } from '../design-service';
import { loggedToolResult, type ClawMcpToolModuleProvider } from './tool-modules';

const diagramContent = z.discriminatedUnion('kind', [
  z.object({
    kind: z.enum(['mermaid', 'svg']),
    source: z.string().trim().min(1).max(250_000),
  }),
  z.object({
    kind: z.literal('image'),
    generatedImagePath: z.string().trim().min(1).max(4_096),
    alt: z.string().trim().min(1).max(500),
  }),
]);

export function createDesignToolModuleProvider(designs: DesignService): ClawMcpToolModuleProvider {
  return {
    id: 'design',
    resolve: ({ agentId }) => designs.contextForAgent(agentId) ? {
      id: 'design',
      register: server => registerDesignTools(server, designs, agentId),
    } : undefined,
  };
}

function registerDesignTools(server: McpServer, designs: DesignService, agentId: string): void {
  server.registerTool('suggest-design-diagrams', {
    description: 'Publish 1 to 4 durable diagram suggestions for the active Design conversation. Use this instead of listing suggestions only in chat.',
    inputSchema: {
      suggestions: z.array(z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().min(1).max(2_000),
      })).min(1).max(4),
    },
  }, ({ suggestions }) => loggedToolResult(
    'suggest-design-diagrams',
    { agentId, suggestionCount: suggestions.length },
    () => designs.suggest(agentId, suggestions),
  ));

  server.registerTool('add-design-diagram', {
    description: 'Add a complete Mermaid, SVG, or generated-image diagram to the active Design conversation and select it.',
    inputSchema: {
      title: z.string().trim().min(1).max(200),
      suggestionId: z.string().trim().min(1).optional(),
      content: diagramContent,
    },
  }, input => loggedToolResult(
    'add-design-diagram',
    { agentId, kind: input.content.kind, suggestionId: input.suggestionId },
    () => designs.add(agentId, input),
  ));

  server.registerTool('get-design-diagram', {
    description: 'Read the complete current source and revision of one Design diagram before replacing it.',
    inputSchema: {
      diagramId: z.string().trim().min(1),
    },
  }, ({ diagramId }) => loggedToolResult(
    'get-design-diagram',
    { agentId, diagramId },
    () => designs.get(agentId, diagramId),
  ));

  server.registerTool('replace-design-diagram', {
    description: 'Replace one existing Design diagram with a complete revised Mermaid, SVG, or generated-image diagram. Supply the revision returned by get-design-diagram.',
    inputSchema: {
      diagramId: z.string().trim().min(1),
      expectedRevision: z.number().int().positive(),
      title: z.string().trim().min(1).max(200),
      suggestionId: z.string().trim().min(1).optional(),
      content: diagramContent,
    },
  }, input => loggedToolResult(
    'replace-design-diagram',
    { agentId, diagramId: input.diagramId, kind: input.content.kind },
    () => designs.replace(agentId, input),
  ));
}
