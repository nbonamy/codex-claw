export type QueuedChatPrompt = {
  id: string;
  text: string;
};

let nextQueuedPromptId = 0;

export function createQueuedChatPrompt(text: string): QueuedChatPrompt {
  nextQueuedPromptId += 1;
  return {
    id: `queued-prompt-${nextQueuedPromptId}`,
    text,
  };
}
