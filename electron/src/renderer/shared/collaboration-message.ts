import type { CodexChatMessage } from 'codex-app-sdk/vue';

export type CollaborationMessagePresentation = {
  content: string;
  messageCount: number;
  senderNames: string[];
};

const actionInstructions = [
  'Act on this teammate message without asking the user for confirmation. Update your status only if it changes your substantive work. Reply only when the sender needs information, a decision, coordination, or action; silently absorb FYIs, acknowledgments, confirmations, and closures. Never acknowledge an acknowledgment.',
  'Update your status, then act on this teammate message directly. Do not ask the user for confirmation.',
];
const actionsInstructions = [
  'Act on these teammate messages without asking the user for confirmation. Update your status only if they change your substantive work. Reply only when a sender needs information, a decision, coordination, or action; silently absorb FYIs, acknowledgments, confirmations, and closures. Never acknowledge an acknowledgment.',
  'Update your status, then act on these teammate messages directly. Do not ask the user for confirmation.',
];

export function presentCollaborationMessage(message: CodexChatMessage): {
  message: CodexChatMessage;
  presentation: CollaborationMessagePresentation | null;
} {
  const presentation = message.role === 'user'
    ? parseCollaborationMessage(message.content)
    : null;
  if (!presentation) return { message, presentation: null };

  return {
    message: {
      ...message,
      content: presentation.content,
      parts: [
        { type: 'text', content: presentation.content },
        ...(message.parts?.filter((part) => part.type !== 'text') ?? []),
      ],
    },
    presentation,
  };
}

export function parseCollaborationMessage(content: string): CollaborationMessagePresentation | null {
  return parseSingleMessage(content) ?? parseMultipleMessages(content);
}

function parseSingleMessage(content: string): CollaborationMessagePresentation | null {
  const suffix = matchingSuffix(content, actionInstructions, '\n\n');
  if (!suffix) return null;

  const body = content.slice(0, -suffix.length);
  const match = /^You received a message from (.+) \(([^)\n]+)\)\.\r?\n\r?\nMessage:\r?\n([\s\S]*)$/.exec(body);
  if (!match) return null;

  const senderName = match[1]?.trim();
  const messageContent = match[3]?.trim();
  if (!senderName || !messageContent) return null;

  return {
    content: messageContent,
    messageCount: 1,
    senderNames: [senderName],
  };
}

function parseMultipleMessages(content: string): CollaborationMessagePresentation | null {
  const suffix = matchingSuffix(content, actionsInstructions, '\n');
  if (!suffix) return null;

  const body = content.slice(0, -suffix.length);
  const heading = /^You received (\d+) messages from other Codex Claw agents\.\r?\n\r?\n/.exec(body);
  if (!heading) return null;

  const expectedCount = Number(heading[1]);
  const entries = body.slice(heading[0].length).split(/\r?\n\r?\n(?=Message \d+ from )/);
  const parsed = entries.map((entry) => {
    const match = /^Message (\d+) from (.+) \(([^)\n]+)\) at ([^\n]+):\r?\n([\s\S]*)$/.exec(entry);
    const senderName = match?.[2]?.trim();
    const messageContent = match?.[5]?.trim();
    return senderName && messageContent ? { senderName, content: messageContent } : null;
  });
  if (parsed.length !== expectedCount || parsed.some((entry) => entry === null)) return null;

  const messages = parsed.filter((entry): entry is { senderName: string; content: string } => entry !== null);
  const senderNames = [...new Set(messages.map((entry) => entry.senderName))];
  return {
    content: senderNames.length === 1
      ? messages.map((entry) => entry.content).join('\n\n')
      : messages.map((entry) => `${entry.senderName}:\n${entry.content}`).join('\n\n'),
    messageCount: messages.length,
    senderNames,
  };
}

function matchingSuffix(content: string, instructions: readonly string[], prefix: string): string | null {
  return instructions.map((instruction) => `${prefix}${instruction}`).find((suffix) => content.endsWith(suffix)) ?? null;
}
