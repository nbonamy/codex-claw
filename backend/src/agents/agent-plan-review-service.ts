import type { Agent } from '@workspace/core/contracts';
import type { BackendEvent } from '@workspace/core/backend-driver';
import { agentConversationId, type PlanReviewResponse } from '@workspace/core/plan-review';

/** App-owned decisions; provider transcripts remain owned by their adapters. */
export class AgentPlanReviewService {
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(private readonly options: {
    submit: (agent: Agent, prompt: string, planMode: boolean) => Promise<void>;
    emit: (event: BackendEvent) => void;
  }) {}

  respond(agent: Agent, response: PlanReviewResponse): Promise<void> {
    const review = agent.planReview;
    if (!review || review.id !== response.reviewId || review.conversationId !== agentConversationId(agent)) {
      return Promise.reject(new Error('This plan review no longer belongs to the active conversation.'));
    }
    if (review.status !== 'pending') {
      return review.status === response.resolution ? Promise.resolve()
        : Promise.reject(new Error('This plan review has already been resolved.'));
    }
    if (!['accept', 'revise', 'cancel'].includes(response.resolution)) return Promise.reject(new Error('Invalid review resolution.'));
    if (response.resolution === 'revise' && !response.feedback?.trim()) return Promise.reject(new Error('Revision feedback is required.'));
    if (this.inFlight.has(review.id)) return Promise.reject(new Error('A decision for this plan review is already being submitted.'));
    const request = Promise.resolve().then(async () => {
      if (response.resolution !== 'cancel') {
        await this.options.submit(agent, response.resolution === 'accept' ? 'implement the plan' : response.feedback!.trim(), response.resolution === 'revise');
      }
      if (agent.planReview?.id !== review.id || agentConversationId(agent) !== review.conversationId) {
        throw new Error('The conversation changed while the plan decision was being submitted.');
      }
      this.options.emit({ type: 'plan.reviewResolved', agentId: agent.id, conversationId: review.conversationId ?? undefined, payload: { reviewId: review.id, resolution: response.resolution } });
    }).finally(() => this.inFlight.delete(review.id));
    this.inFlight.set(review.id, request);
    return request;
  }
}
