import { randomUUID } from 'node:crypto';
import type {
  CodeReviewFinding,
  CodeReviewFindingInput,
  CodeReviewFindingUpdateInput,
} from '@codex-claw/core/code-review';

export type ReviewFindingCompletionInput = {
  findingId: string;
  evidence?: string;
};

export type ReviewToolHandlers = {
  reportFinding(input: CodeReviewFindingInput): Promise<CodeReviewFinding> | CodeReviewFinding;
  updateFinding(input: CodeReviewFindingUpdateInput): Promise<CodeReviewFinding> | CodeReviewFinding;
  markFindingComplete(input: ReviewFindingCompletionInput): Promise<CodeReviewFinding> | CodeReviewFinding;
};

export type ReviewToolContext = ReviewToolHandlers & {
  id: string;
  agentId: string;
};

export class ReviewToolRegistry {
  private readonly contexts = new Map<string, ReviewToolContext>();

  create(agentId: string, handlers: ReviewToolHandlers): ReviewToolContext {
    const context: ReviewToolContext = {
      id: randomUUID(),
      agentId,
      reportFinding: (input) => this.run(context, () => handlers.reportFinding(input)),
      updateFinding: (input) => this.run(context, () => handlers.updateFinding(input)),
      markFindingComplete: (input) => this.run(context, () => handlers.markFindingComplete(input)),
    };
    this.contexts.set(context.id, context);
    return context;
  }

  resolve(agentId: string, contextId: string | null): ReviewToolContext | null {
    if (!contextId) return null;
    const context = this.contexts.get(contextId);
    return context?.agentId === agentId ? context : null;
  }

  close(contextId: string): void {
    this.contexts.delete(contextId);
  }

  private run<T>(context: ReviewToolContext, action: () => Promise<T> | T): Promise<T> | T {
    if (!this.contexts.has(context.id)) throw new Error('Review context is no longer available.');
    return action();
  }
}
