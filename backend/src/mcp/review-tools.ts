import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { ReviewToolContext } from '../review/review-tool-registry';
import { errorToolResult, structuredToolResult } from './tool-result';

const priority = z.enum(['p0', 'p1', 'p2', 'p3']);

export function registerReviewTools(server: McpServer, context: ReviewToolContext): void {
  server.registerTool('report_finding', {
    description: 'Create one durable structured code review finding supported by concrete evidence.',
    inputSchema: {
      fingerprint: z.string().trim().min(1).describe('Stable semantic key for deduplication, independent of wording.'),
      priority: priority.describe('P0 critical, P1 high, P2 medium, or P3 low.'),
      summary: z.string().trim().min(1).describe('Concise statement of the defect.'),
      rationale: z.string().trim().min(1).describe('Why the behavior is incorrect and what evidence proves it.'),
      suggestedResolution: z.string().trim().min(1).describe('Concrete direction for resolving the defect.'),
      file: z.string().trim().min(1).optional().describe('Repository-relative file path when available.'),
      line: z.number().int().positive().optional().describe('One-based start line when available.'),
      endLine: z.number().int().positive().optional().describe('One-based end line when available.'),
      priorFindingId: z.string().trim().min(1).optional().describe('Stable prior finding ID when this is a re-observation.'),
      materiallyNewEvidence: z.string().trim().min(1).optional().describe('Required when raising a previously declined concern again.'),
    },
  }, (input) => reviewToolResult(() => context.reportFinding({
    fingerprint: input.fingerprint,
    priority: input.priority,
    summary: input.summary,
    rationale: input.rationale,
    suggestedResolution: input.suggestedResolution,
    ...(input.file ? { location: { file: input.file, ...(input.line ? { line: input.line } : {}), ...(input.endLine ? { endLine: input.endLine } : {}) } } : {}),
    ...(input.priorFindingId ? { priorFindingId: input.priorFindingId } : {}),
    ...(input.materiallyNewEvidence ? { materiallyNewEvidence: input.materiallyNewEvidence } : {}),
  })));

  server.registerTool('update_finding', {
    description: 'Correct or enrich a finding already stored in the current review ledger.',
    inputSchema: {
      findingId: z.string().trim().min(1).describe('Stable finding ID returned by report_finding or supplied in the ledger.'),
      priority: priority.optional(),
      summary: z.string().trim().min(1).optional(),
      rationale: z.string().trim().min(1).optional(),
      suggestedResolution: z.string().trim().min(1).optional(),
      file: z.string().trim().min(1).optional(),
      line: z.number().int().positive().optional(),
      endLine: z.number().int().positive().optional(),
      materiallyNewEvidence: z.string().trim().min(1).optional(),
    },
  }, (input) => reviewToolResult(() => context.updateFinding({
    findingId: input.findingId,
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.summary ? { summary: input.summary } : {}),
    ...(input.rationale ? { rationale: input.rationale } : {}),
    ...(input.suggestedResolution ? { suggestedResolution: input.suggestedResolution } : {}),
    ...(input.file ? { location: { file: input.file, ...(input.line ? { line: input.line } : {}), ...(input.endLine ? { endLine: input.endLine } : {}) } } : {}),
    ...(input.materiallyNewEvidence ? { materiallyNewEvidence: input.materiallyNewEvidence } : {}),
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
