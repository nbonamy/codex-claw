import { randomUUID } from 'node:crypto';
import type { CodeReviewFindingInput } from '@codex-claw/core/code-review';

export type ReviewFindingReport = CodeReviewFindingInput & {
  id: string;
};

export type ReviewVerificationReport = {
  findingId: string;
  state: 'passed' | 'failed';
  evidence?: string;
};

export type ReviewToolContext = {
  id: string;
  agentId: string;
  reportFinding(input: CodeReviewFindingInput): ReviewFindingReport;
  reportVerification(input: ReviewVerificationReport): ReviewVerificationReport;
  complete(summary?: string): void;
};

export type CompletedReviewToolContext = {
  findings: ReviewFindingReport[];
  verifications: ReviewVerificationReport[];
  summary?: string;
};

type StoredReviewToolContext = ReviewToolContext & {
  result: CompletedReviewToolContext;
  completed: boolean;
};

export class ReviewToolRegistry {
  private readonly contexts = new Map<string, StoredReviewToolContext>();

  create(agentId: string): ReviewToolContext {
    const id = randomUUID();
    const result: CompletedReviewToolContext = { findings: [], verifications: [] };
    const context: StoredReviewToolContext = {
      id,
      agentId,
      result,
      completed: false,
      reportFinding: (input) => {
        this.requireOpen(context);
        const prior = input.priorFindingId
          ? result.findings.find((finding) => finding.id === input.priorFindingId)
          : result.findings.find((finding) => finding.fingerprint === input.fingerprint);
        const finding: ReviewFindingReport = {
          ...input,
          id: prior?.id ?? input.priorFindingId ?? randomUUID(),
        };
        const existingIndex = result.findings.findIndex((candidate) => candidate.id === finding.id);
        if (existingIndex >= 0) result.findings.splice(existingIndex, 1, finding);
        else result.findings.push(finding);
        return structuredClone(finding);
      },
      reportVerification: (input) => {
        this.requireOpen(context);
        const verification = { ...input };
        const existingIndex = result.verifications.findIndex((candidate) => candidate.findingId === input.findingId);
        if (existingIndex >= 0) result.verifications.splice(existingIndex, 1, verification);
        else result.verifications.push(verification);
        return structuredClone(verification);
      },
      complete: (summary) => {
        this.requireOpen(context);
        context.completed = true;
        if (summary?.trim()) result.summary = summary.trim();
      },
    };
    this.contexts.set(id, context);
    return context;
  }

  resolve(agentId: string, contextId: string | null): ReviewToolContext | null {
    if (!contextId) return null;
    const context = this.contexts.get(contextId);
    return context?.agentId === agentId ? context : null;
  }

  finish(contextId: string): CompletedReviewToolContext {
    const context = this.contexts.get(contextId);
    if (!context) throw new Error('Review context is no longer available.');
    if (!context.completed) throw new Error('Reviewer did not complete the review round.');
    this.contexts.delete(contextId);
    return structuredClone(context.result);
  }

  discard(contextId: string): void {
    this.contexts.delete(contextId);
  }

  private requireOpen(context: StoredReviewToolContext): void {
    if (!this.contexts.has(context.id)) throw new Error('Review context is no longer available.');
    if (context.completed) throw new Error('Review round is already complete.');
  }
}
