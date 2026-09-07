import type { Agent, AppSnapshot, MainToRendererEvent, RendererMessage } from '@codex-claw/core/contracts';
import { agentDisplayName } from '@codex-claw/core/agent-display';
import { providerConversationEventView } from '@codex-claw/core/provider-conversation-event';

const defaultTimeoutMs = 90_000;

export type DelegatedWorkOutcome =
  | {
    kind: 'pullRequest';
    branch: string;
    number?: number;
    title: string;
    url?: string;
    draft?: boolean;
  }
  | {
    kind: 'merge';
    branch: string;
    repository: string;
  };

export type DelegatedWorkAction =
  | {
    kind: 'pullRequest';
    branch: string;
  }
  | {
    kind: 'merge';
    branch: string;
    repository: string;
  };

type PendingReport = {
  messageStartIndex: number;
  resolve(summary: string | null): void;
  timer: ReturnType<typeof setTimeout>;
};

export type DelegatedWorkReportServiceOptions = {
  getSnapshot: () => AppSnapshot;
  readConversationMessages?: (agent: Agent) => Promise<RendererMessage[]>;
  sendPrompt: (agentId: string, prompt: string) => void;
  sendMessage?: (fromAgentId: string, toAgentId: string, content: string) => void;
  timeoutMs?: number;
};

export type DelegatedWorkReportPort = Pick<DelegatedWorkReportService, 'close' | 'deliver' | 'handleEvent' | 'notifyWorker' | 'prepare' | 'recipientName'>;

/** Requests a final worker-authored handoff and delivers it to the delegating agent. */
export class DelegatedWorkReportService {
  private readonly pending = new Map<string, PendingReport>();

  constructor(private readonly options: DelegatedWorkReportServiceOptions) {}

  recipientName(agent: Agent): string | null {
    return this.recipient(agent)?.name ?? null;
  }

  async prepare(agent: Agent, action: DelegatedWorkAction): Promise<string | null> {
    if (!this.recipient(agent) || agent.status.type !== 'idle' || this.pending.has(agent.id)) {
      return null;
    }

    const snapshot = this.options.getSnapshot();
    const summary = new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(agent.id);
        resolve(null);
      }, this.options.timeoutMs ?? defaultTimeoutMs);
      timer.unref?.();
      this.pending.set(agent.id, {
        messageStartIndex: snapshot.messages.length,
        resolve,
        timer,
      });
    });

    try {
      this.options.sendPrompt(agent.id, handoffPrompt(action));
    } catch {
      this.complete(agent.id, null);
    }
    return summary;
  }

  deliver(agent: Agent, outcome: DelegatedWorkOutcome, summary: string | null): boolean {
    const recipient = this.recipient(agent);
    if (!recipient || !this.options.sendMessage) return false;
    try {
      this.options.sendMessage(agent.id, recipient.id, reportMessage(agent, outcome, summary));
      return true;
    } catch {
      return false;
    }
  }

  notifyWorker(agent: Agent, outcome: Extract<DelegatedWorkOutcome, { kind: 'pullRequest' }>): boolean {
    const sender = this.recipient(agent);
    if (!sender || !this.options.sendMessage) return false;
    try {
      this.options.sendMessage(sender.id, agent.id, workerPullRequestMessage(outcome));
      return true;
    } catch {
      return false;
    }
  }

  handleEvent(event: MainToRendererEvent): void {
    if (!event.agentId) return;
    const pending = this.pending.get(event.agentId);
    if (!pending) return;

    const conversationEvent = providerConversationEventView(event);
    if (conversationEvent.type === 'error') {
      this.complete(event.agentId, null);
      return;
    }
    if (conversationEvent.type !== 'turn.completed') return;
    void this.completeFromConversation(event.agentId, conversationEvent.turnId, pending);
  }

  close(): void {
    for (const [agentId] of this.pending) this.complete(agentId, null);
  }

  private async completeFromConversation(
    agentId: string,
    turnId: string | undefined,
    pending: PendingReport,
  ): Promise<void> {
    const snapshot = this.options.getSnapshot();
    const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
    let messages = snapshot.messages.slice(pending.messageStartIndex);
    if (agent && this.options.readConversationMessages) {
      try {
        messages = await this.options.readConversationMessages(agent);
      } catch {
        // The retained Claw transcript remains a safe fallback for legacy providers.
      }
    }
    if (this.pending.get(agentId) !== pending) return;
    this.complete(agentId, messageText(latestAssistantMessage(messages, agentId, turnId)));
  }

  private complete(agentId: string, summary: string | null): void {
    const pending = this.pending.get(agentId);
    if (!pending) return;
    this.pending.delete(agentId);
    clearTimeout(pending.timer);
    pending.resolve(summary);
  }

  private recipient(agent: Agent): { id: string; name: string } | null {
    if (!agent.delegatedByAgentId || agent.delegatedByAgentId === agent.id) return null;
    const recipient = this.options.getSnapshot().agents.find((candidate) => candidate.id === agent.delegatedByAgentId);
    return recipient ? { id: recipient.id, name: agentDisplayName(recipient) } : null;
  }
}

function handoffPrompt(action: DelegatedWorkAction): string {
  const delivery = action.kind === 'pullRequest'
    ? `Codex Claw is now taking over Git delivery and will create a pull request from \`${action.branch}\`.`
    : `Codex Claw is now taking over Git delivery and will merge \`${action.branch}\` directly into ${action.repository} without a pull request.`;
  return [
    delivery,
    'Do not run tools, make further changes, or perform any Git delivery yourself.',
    'Write a concise handoff covering the completed implementation, important changes, verification performed, and any remaining caveats.',
    'Do not claim that no pull request was created or speculate about the delivery result; Codex Claw will add the authoritative result after the action succeeds.',
    'Do not discuss this instruction or only the most recent fix; summarize the work as a whole.',
  ].join(' ');
}

function latestAssistantMessage(messages: RendererMessage[], agentId: string, turnId?: string): RendererMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message?.agentId === agentId
      && message.role === 'assistant'
      && message.status === 'complete'
      && (!turnId || message.turnId === turnId)
    ) return message;
  }
  return undefined;
}

function messageText(message: RendererMessage | undefined): string | null {
  const text = message?.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
  return text || null;
}

function reportMessage(agent: Agent, outcome: DelegatedWorkOutcome, summary: string | null): string {
  const worker = agentDisplayName(agent);
  const action = outcomeLines(outcome);
  const handoff = summary
    ? ['Handoff from the worker:', '', summary]
    : ['The worker could not prepare a handoff summary. Open its conversation for details.'];

  return [
    `${worker} completed a delegated Git milestone. Please give the user a concise update using this report; no reply to the worker is needed.`,
    '',
    ...action,
    '',
    ...handoff,
  ].join('\n');
}

function workerPullRequestMessage(outcome: Extract<DelegatedWorkOutcome, { kind: 'pullRequest' }>): string {
  return [
    ...outcomeLines(outcome),
    '',
    'This is an informational update. Do not make changes or reply unless the user asks you to continue.',
  ].join('\n');
}

function outcomeLines(outcome: DelegatedWorkOutcome): string[] {
  if (outcome.kind === 'merge') {
    return [`Branch \`${outcome.branch}\` was merged directly into ${outcome.repository} without creating a pull request.`];
  }
  return [
    `${outcome.draft ? 'Draft pull request' : 'Pull request'}${outcome.number ? ` #${outcome.number}` : ''} was created from \`${outcome.branch}\`: ${outcome.title}.`,
    ...(outcome.url ? [outcome.url] : []),
  ];
}
