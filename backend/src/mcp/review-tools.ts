import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { ReviewToolContext } from '../review/review-tool-registry';
import { errorToolResult, structuredToolResult } from './tool-result';

export function registerReviewTools(server: McpServer, context: ReviewToolContext): void {
  server.registerTool('report_finding', {
    description: 'Create or update one structured code review finding. Use this only for actionable defects supported by concrete evidence.',
    inputSchema: {
      fingerprint: z.string().trim().min(1).describe('Stable semantic key for deduplication, independent of wording.'),
      priority: z.enum(['p0', 'p1', 'p2', 'p3']).describe('P0 critical, P1 high, P2 medium, or P3 low.'),
      summary: z.string().trim().min(1).describe('Concise statement of the defect.'),
      rationale: z.string().trim().min(1).describe('Why the behavior is incorrect and what evidence proves it.'),
      suggestedResolution: z.string().trim().min(1).describe('Concrete direction for resolving the defect.'),
      file: z.string().trim().min(1).optional().describe('Repository-relative file path when available.'),
      line: z.number().int().positive().optional().describe('One-based start line when available.'),
      endLine: z.number().int().positive().optional().describe('One-based end line when available.'),
      priorFindingId: z.string().trim().min(1).optional().describe('Stable prior finding ID when this is a regression check or re-observation.'),
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

  server.registerTool('verify_finding', {
    description: 'Record the verification result for an accepted finding from an earlier review round.',
    inputSchema: {
      findingId: z.string().trim().min(1).describe('Stable finding ID supplied in the review ledger.'),
      state: z.enum(['passed', 'failed']),
      evidence: z.string().trim().min(1).optional().describe('Concrete evidence, required when verification fails.'),
    },
  }, ({ findingId, state, evidence }) => reviewToolResult(() => {
    if (state === 'failed' && !evidence) throw new Error('Failed verification requires evidence.');
    return context.reportVerification({ findingId, state, ...(evidence ? { evidence } : {}) });
  }));

  server.registerTool('complete_review', {
    description: 'Mark this independent review round complete after reporting all findings and verification results.',
    inputSchema: {
      summary: z.string().trim().min(1).optional().describe('Optional concise review-round summary.'),
    },
  }, ({ summary }) => reviewToolResult(() => {
    context.complete(summary);
    return { completed: true };
  }));
}

async function reviewToolResult(run: () => unknown) {
  try {
    return structuredToolResult(await run());
  } catch (error) {
    return errorToolResult(error instanceof Error ? error.message : String(error));
  }
}
