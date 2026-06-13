<template>
  <section class="conversation-history" aria-label="Conversation history">
    <button
      class="conversation-history__header"
      type="button"
      :aria-expanded="expanded"
      @click="toggleExpanded"
    >
      <span>CONVERSATIONS</span>
      <ChevronRightIcon
        class="conversation-history__chevron"
        :class="{ 'conversation-history__chevron--expanded': expanded }"
      />
    </button>

    <div
      v-if="expanded"
      class="conversation-history__body"
    >
      <div
        v-if="isLoading && conversations.length === 0"
        class="conversation-history__state"
      >
        Loading...
      </div>
      <div
        v-else-if="error"
        class="conversation-history__state conversation-history__state--error"
      >
        {{ error }}
      </div>
      <div
        v-else-if="conversations.length === 0"
        class="conversation-history__state"
      >
        No conversations yet
      </div>
      <div
        v-else
        class="conversation-history__list"
      >
        <button
          v-for="conversation in conversations"
          :key="conversation.id"
          class="conversation-history__row"
          :class="{ 'conversation-history__row--current': isCurrentConversation(conversation) }"
          type="button"
          :disabled="!canResume(conversation)"
          @click="resumeConversation(conversation)"
          @mouseenter="hoveredConversationId = conversation.id"
          @mouseleave="hoveredConversationId = null"
        >
          <span class="conversation-history__row-text">
            <strong :class="{ 'conversation-history__title--empty': !conversation.title }">
              {{ conversationTitle(conversation) }}
            </strong>
            <span>{{ relativeDate(conversation.updatedAt) }}</span>
          </span>
          <span class="conversation-history__row-action" aria-hidden="true">
            <span
              v-if="isCurrentConversation(conversation)"
              class="conversation-history__current-dot"
            />
            <PlayerPlayIcon
              v-else-if="hoveredConversationId === conversation.id && agent.status.type === 'idle'"
              class="conversation-history__play"
            />
          </span>
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Agent, BackendConversationRef, ConversationSummary } from '@codex-claw/shared/contracts';
import { ChevronRightIcon, PlayerPlayIcon } from '../shared/icons/app-icons';

const STORAGE_KEY = 'conversationHistoryExpanded';

const props = withDefaults(defineProps<{
  agent: Agent;
  listConversations?: (agentId: string) => Promise<ConversationSummary[]>;
  resumeConversation?: (agentId: string, ref: BackendConversationRef) => Promise<void>;
}>(), {
  listConversations: async () => [],
  resumeConversation: async () => undefined,
});

const expanded = ref(readExpandedPreference());
const conversations = ref<ConversationSummary[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);
const hoveredConversationId = ref<string | null>(null);
let requestId = 0;

watch(
  () => [props.agent.id, props.agent.folder, props.agent.status.type, expanded.value] as const,
  () => {
    if (expanded.value) {
      void refreshConversations();
    }
  },
  { immediate: true },
);

function toggleExpanded(): void {
  expanded.value = !expanded.value;
  writeExpandedPreference(expanded.value);
}

async function refreshConversations(): Promise<void> {
  const currentRequestId = requestId + 1;
  requestId = currentRequestId;
  isLoading.value = true;
  error.value = null;

  try {
    const nextConversations = await props.listConversations(props.agent.id);
    if (requestId === currentRequestId) {
      conversations.value = nextConversations;
    }
  } catch (caught) {
    if (requestId === currentRequestId) {
      error.value = caught instanceof Error ? caught.message : 'Unable to load conversations';
    }
  } finally {
    if (requestId === currentRequestId) {
      isLoading.value = false;
    }
  }
}

async function resumeConversation(conversation: ConversationSummary): Promise<void> {
  if (!canResume(conversation)) {
    return;
  }

  await props.resumeConversation(props.agent.id, conversation.ref);
  conversations.value = conversations.value.map((candidate) => (
    candidate.id === conversation.id
      ? { ...candidate, updatedAt: new Date().toISOString() }
      : candidate
  ));
}

function canResume(conversation: ConversationSummary): boolean {
  return props.agent.status.type === 'idle' && !isCurrentConversation(conversation);
}

function isCurrentConversation(conversation: ConversationSummary): boolean {
  const session = props.agent.backendSession;
  if (conversation.ref.backend === 'codex') {
    return session?.kind === 'codex' && session.threadId === conversation.ref.threadId;
  }

  return session?.kind === 'claude' &&
    conversation.ref.folder === props.agent.folder &&
    (session.transcriptSessionId ?? session.sessionId) === conversation.ref.sessionId;
}

function conversationTitle(conversation: ConversationSummary): string {
  return conversation.title.trim() || (isCurrentConversation(conversation) ? 'Current conversation' : 'Untitled conversation');
}

function relativeDate(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return '';
  }

  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) {
    return 'now';
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }

  return new Date(timestamp).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

function readExpandedPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeExpandedPreference(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // localStorage can be unavailable in tests or hardened browser contexts.
  }
}
</script>

<style scoped>
.conversation-history {
  border-top: 1px solid var(--color-border);
  padding-left: var(--space-8);
}

.conversation-history__header {
  width: 100%;
  height: var(--space-16);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-8);
  padding: 0;
  padding-left: var(--space-4);
  padding-right: var(--space-8);
  border: none;
  color: var(--color-text-muted);
  background: transparent;
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-16);
  text-align: left;
}

.conversation-history__chevron {
  width: var(--icon-sm);
  height: var(--icon-sm);
  flex: 0 0 auto;
  transition: transform 100ms ease;
}

.conversation-history__chevron--expanded {
  transform: rotate(90deg);
}

.conversation-history__body {
  max-height: 190px;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.conversation-history__list {
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding-bottom: var(--space-8);
}

.conversation-history__row {
  width: calc(100% - 1 * var(--space-8));
  height: auto;
  display: flex;
  align-items: center;
  gap: var(--space-8);
  border: none;
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-4);
  color: var(--color-text);
  background: transparent;
  text-align: left;
}

.conversation-history__row:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-primary) 7%, transparent);
}

.conversation-history__row:disabled {
  cursor: default;
}

.conversation-history__row-text {
  min-width: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-1);
}

.conversation-history__row-text strong,
.conversation-history__row-text span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-history__row-text strong {
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-regular);
  line-height: var(--line-height-16);
}

.conversation-history__title--empty,
.conversation-history__row-text span {
  color: var(--color-text-muted);
}

.conversation-history__title--empty {
  font-style: italic;
}

.conversation-history__row-text span {
  font-size: var(--font-size-11);
  line-height: var(--line-height-16);
}

.conversation-history__row-action {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
}

.conversation-history__current-dot {
  width: var(--space-4);
  height: var(--space-4);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-text-muted) 48%, transparent);
}

.conversation-history__play {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.conversation-history__state {
  padding: var(--space-8);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  line-height: var(--line-height-16);
  text-align: center;
}

.conversation-history__state--error {
  color: var(--color-error);
}
</style>
