import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { ReviewToolContext } from '../review/review-tool-registry';
import { errorToolResult, structuredToolResult } from './tool-result';

const priority = z.enum(['p0', 'p1', 'p2', 'p3']);
const findingTitle = z.string().trim().min(1).max(80).describe('Imperative finding title, at most 80 characters.');
const findingBody = z.string().trim().min(1).describe('One concise Markdown paragraph explaining why this is a problem.');

export function registerReviewTools(server: McpServer, context: ReviewToolContext): void {
  server.registerTool('report_finding', {
    description: 'Create one durable structured code review finding supported by concrete evidence.',
    inputSchema: {
      priority: priority.describe('P0 critical, P1 high, P2 medium, or P3 low.'),
      title: findingTitle,
      body: findingBody,
      file: z.string().trim().min(1).optional().describe('Repository-relative file path when available.'),
      line: z.number().int().positive().optional().describe('One-based start line when available.'),
      endLine: z.number().int().positive().optional().describe('One-based end line when available.'),
      priorFindingId: z.string().trim().min(1).optional().describe('Stable prior finding ID when this is a re-observation.'),
    },
  }, (input) => reviewToolResult(() => context.reportFinding({
    priority: input.priority,
    title: input.title,
    body: input.body,
    ...(input.file ? { location: { file: input.file, ...(input.line ? { line: input.line } : {}), ...(input.endLine ? { endLine: input.endLine } : {}) } } : {}),
    ...(input.priorFindingId ? { priorFindingId: input.priorFindingId } : {}),
  })));

  server.registerTool('update_finding', {
    description: 'Correct or enrich a finding already stored in the current review ledger.',
    inputSchema: {
      findingId: z.string().trim().min(1).describe('Stable finding ID returned by report_finding or supplied in the ledger.'),
      priority: priority.optional(),
      title: findingTitle.optional(),
      body: findingBody.optional(),
      file: z.string().trim().min(1).optional(),
      line: z.number().int().positive().optional(),
      endLine: z.number().int().positive().optional(),
    },
  }, (input) => reviewToolResult(() => context.updateFinding({
    findingId: input.findingId,
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.title ? { title: input.title } : {}),
    ...(input.body ? { body: input.body } : {}),
    ...(input.file ? { location: { file: input.file, ...(input.line ? { line: input.line } : {}), ...(input.endLine ? { endLine: input.endLine } : {}) } } : {}),
  })));

  server.registerTool('mark_finding_complete', {
    description: 'Mark a prior accepted finding as successfully verified in the current review pass.',
    inputSchema: {
      findingId: z.string().trim().min(1).describe('Stable finding ID supplied in the regression-check ledger.'),
      evidence: z.string().trim().min(1).optional().describe('Concrete verification evidence when useful.'),
    },
  }, ({ findingId, evidence }) => reviewToolResult(() => context.markFindingComplete({
    findingId,
    ...(evidence ? { evidence } : {}),
  })));
}

async function reviewToolResult(run: () => unknown) {
  try {
    return structuredToolResult(await run());
  } catch (error) {
    return errorToolResult(error instanceof Error ? error.message : String(error));
  }
}
