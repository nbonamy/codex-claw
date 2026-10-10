import * as z from 'zod/v4';
import type { AppSnapshot } from '@workspace/core/contracts';
import type { AutomaticReviewStartInput } from '../review/code-review-service';
import { loggedToolResult, type AppMcpToolModuleProvider } from './tool-modules';
import { findingPrioritySchema } from './finding-tool-schemas';

export type StartAutomaticReview = (agentId: string, input: AutomaticReviewStartInput) => Promise<{
  success: true;
  reviewId: string;
  reviewerAgentId: string;
}>;

export function createAutomaticReviewToolModuleProvider(options: {
  snapshot: AppSnapshot;
  start: StartAutomaticReview;
}): AppMcpToolModuleProvider {
  return {
    id: 'automatic-review',
    resolve: ({ agentId }) => {
      const agent = options.snapshot.agents.find(candidate => candidate.id === agentId);
      if (!agent?.folder || agent.sessionKind === 'quickChat' || agent.codeReview) return undefined;
      return {
        id: 'automatic-review',
        register: server => {
          server.registerTool('start_automatic_review', {
            description: 'Start an independent automatic review/fix/verify workflow in this thread’s repository ONLY when the user explicitly asks for an automatic review. A generic request to review, finish, or ship is not authorization. This can modify files. Choose the requested scope explicitly. Defaults to this thread’s backend, model, and effort, with saved priority/round limits. Local commits are OFF unless the user explicitly requests them; never pushes or merges. Returns a reviewer reference immediately, not a completed review. Stop editing the reviewed files; the final or paused report returns to this thread automatically. Do not call again to poll or launch nested reviews.',
            inputSchema: z.strictObject({
              scope: z.discriminatedUnion('type', [
                z.strictObject({ type: z.literal('uncommitted') }),
                z.strictObject({ type: z.literal('branch'), baseRef: z.string().trim().min(1).max(500) }),
              ]).describe('Explicit review scope: uncommitted changes, or the current branch against a known base reference (including working changes). Ask when the user’s intended scope is unclear.'),
              backend: z.enum(['codex', 'claude', 'antigravity']).optional().describe('Override only when requested. Otherwise use the calling thread’s backend.'),
              model: z.string().trim().min(1).max(200).optional().describe('Optional requested model. Same-provider reviews inherit the caller’s model; a different provider uses its own defaults.'),
              reasoningEffort: z.string().trim().min(1).max(200).optional().describe('Optional requested effort. With no model override, same-provider reviews inherit the caller’s effort; an explicit model without effort uses that model’s default.'),
              maxPriority: findingPrioritySchema.optional().describe('Highest numerical priority to fix; defaults to saved settings or p2 (P0–P2).'),
              maxRounds: z.number().int().min(1).max(10).optional().describe('Review round limit including final verification; defaults to saved settings or 3.'),
              autoCommit: z.boolean().optional().describe('Defaults to false even if saved settings enable commits. Set true ONLY if the user explicitly requested local commits. Commits include existing reviewed working changes as well as fixes.'),
            }),
          }, input => loggedToolResult('start_automatic_review', { agentId }, () => options.start(agentId, input)));
        },
      };
    },
  };
}
