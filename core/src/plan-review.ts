import type { Agent,MainToRendererEvent } from './contracts';

export type PlanReviewResolution = 'accept' | 'revise' | 'cancel';
export type PlanReview = {
  id: string;
  conversationId: string | null;
  turnId: string;
  itemId?: string;
  markdown: string;
  status: 'pending' | PlanReviewResolution;
};
export type PlanReviewResponse = {
  reviewId: string;
  resolution: PlanReviewResolution;
  feedback?: string;
};

export function agentConversationId(agent: Agent): string | null {
  const session = agent.backendSession;
  return session?.kind === 'codex' ? session.threadId : session?.sessionId ?? null;
}

export function planReviewFromEvent(agent: Agent, event: Extract<MainToRendererEvent, { type: 'plan.readyForReview' }>): PlanReview {
  const conversationId = event.conversationId ?? agentConversationId(agent);
  return {
    id: JSON.stringify([agent.id, conversationId, event.turnId, event.payload.itemId ?? null]),
    conversationId,
    turnId: event.turnId,
    ...(event.payload.itemId ? { itemId: event.payload.itemId } : {}),
    markdown: event.payload.markdown,
    status: 'pending',
  };
}

export function isPlanReview(value: unknown): value is PlanReview {
  if (!value || typeof value !== 'object') return false;
  const review = value as Record<string, unknown>;
  return typeof review.id === 'string' && (review.conversationId === null || typeof review.conversationId === 'string')
    && typeof review.turnId === 'string' && typeof review.markdown === 'string'
    && (review.itemId === undefined || typeof review.itemId === 'string')
    && ['pending', 'accept', 'revise', 'cancel'].includes(review.status as string);
}
