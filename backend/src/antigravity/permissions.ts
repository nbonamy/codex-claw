import { randomUUID } from 'node:crypto';
import type { AgentRequestResponse } from '@workspace/core/agent-request';
import type { ClientRequest } from '@workspace/core/contracts';
import { record } from './acp-connection';

type Option = { optionId: string; name: string; kind: string };
export function permissionRequest(params: Record<string, unknown>) {
  const call = params.toolCall;
  if (!record(call) || typeof call.toolCallId !== 'string' || !Array.isArray(params.options)) throw new Error('Invalid native permission request.');
  const options = params.options.filter((value): value is Option => record(value)
    && typeof value.optionId === 'string' && typeof value.name === 'string' && typeof value.kind === 'string');
  if (options.length !== params.options.length || !options.length) throw new Error('Invalid native permission choices.');
  const id = randomUUID();
  const question = call.toolCallId.startsWith('interaction_');
  const title = typeof call.title === 'string' ? call.title : 'Antigravity permission';
  const request: ClientRequest = question ? {
    id, kind: 'ask_user', payload: { request: { itemId: call.toolCallId, blocking: true, delivery: 'tool', questions: [{
      id: call.toolCallId, header: 'Antigravity', question: title, isOther: false, isSecret: false,
      options: options.map(option => ({ label: option.name, description: '' })),
    }] } },
  } : {
    id, kind: 'confirm_tool', payload: { confirmation: {
      integrationId: 'antigravity', integrationName: 'Antigravity', toolName: title, summary: title,
      argumentsPreview: JSON.stringify(call.rawInput ?? call.content ?? {}),
      allowAlways: options.some(option => option.kind === 'allow_always'), allowConversation: false,
    } },
  };
  return { request, answer(response: AgentRequestResponse): unknown {
    const outcome = response.outcome;
    if (outcome.kind === 'cancelled') return { outcome: { outcome: 'cancelled' } };
    let option: Option | undefined;
    if (question && outcome.kind === 'answered') {
      const answers = outcome.answers[call.toolCallId as string]?.answers;
      if (answers?.length === 1) option = options.find(candidate => candidate.name === answers[0]);
    } else if (!question && outcome.kind === 'decision') {
      const kind = { allow: 'allow_once', deny: 'reject_once', always_allow: 'allow_always', allow_conversation: '' }[outcome.decision];
      option = options.find(candidate => candidate.kind === kind);
    }
    if (!option) throw new Error('Choose one of the options supplied by Antigravity.');
    return { outcome: { outcome: 'selected', optionId: option.optionId } };
  } };
}
