<template>
  <div class="conversation-pane">
    <ConversationLoadError
      v-if="historyLoadFailed && !hasVisibleMessages"
      :loading="historyLoading"
      @retry="emit('retry-history')"
    />
    <CodexConversationPane
      v-else
      ref="surface"
      class="conversation-pane__surface"
      :controller="controller"
      :has-composer-context="textAnnotations.length > 0"
      :message-text-selection="true"
      :transform-message="transformConversationMessage"
      @message-text-selection-change="messageTextSelection = $event"
    >
      <template #empty>
        <div class="conversation-pane__empty">
          <h1>{{ heroHeadline }}</h1>
          <p v-if="heroSubhead">{{ heroSubhead }}</p>
          <div v-if="$slots['empty-actions']" class="conversation-pane__empty-actions">
            <slot name="empty-actions" />
          </div>
        </div>
      </template>
      <template #message-header="{ message }">
        <span
          v-if="collaborationMessageLabel(message.id)"
          class="conversation-pane__message-header"
        >{{ collaborationMessageLabel(message.id) }}</span>
      </template>
      <template #suggestion-item="{ group, item }">
        <AgentMention
          v-if="group.id === agentMentionGroupId"
          :label="item.label"
          surface="menu"
        />
      </template>
      <template #mention="{ group, item, surface: mentionSurface }">
        <AgentMention
          v-if="group.id === agentMentionGroupId"
          :label="item.label"
          :surface="mentionSurface"
        />
      </template>
      <template #composer-attachment-actions="{ attachments, index, disabled }">
        <el-tooltip
          v-if="attachments[index]?.type === 'image'"
          :content="annotationActionLabel(attachments[index])"
          placement="top"
          :show-after="300"
        >
          <button
            class="conversation-pane__annotate-attachment"
            :class="{ 'conversation-pane__annotate-attachment--saved': annotationCount(attachments[index]) > 0 }"
            type="button"
            :aria-label="annotationActionLabel(attachments[index])"
            :disabled="disabled"
            @click="requestAttachmentAnnotation(attachments[index])"
          >
            <PlusCircleIcon aria-hidden="true" />
          </button>
        </el-tooltip>
      </template>
      <template #composer-shelf-actions="{ disabled }">
        <div v-if="activeThreadFlags.length > 0" class="conversation-pane__thread-flags">
          <ThreadFlagAffordance
            v-for="flag in activeThreadFlags"
            :id="flag"
            :key="flag"
            :busy="threadFlagBusy || disabled"
            @execute="emit('thread-flag', { id: flag, action: 'execute' })"
            @dismiss="emit('thread-flag', { id: flag, action: 'dismiss' })"
          />
        </div>
      </template>
      <template #composer-context="{ disabled }">
        <ComposerContextCards
          v-if="composerContextCards.length > 0"
          :context-label="t('chat.composerContext.label')"
          :items="composerContextCards"
          :disabled="disabled"
          @remove="removeComposerContextCard"
        />
      </template>
    </CodexConversationPane>
    <ChatTextSelectionAnnotation
      :conversation-key="conversationKey"
      :selection="messageTextSelection"
      @dismiss="messageTextSelection = null"
      @save="emit('add-text-annotation', $event)"
    />
    <ConversationPlanPanel
      v-if="plan && planVisible"
      :plan="plan"
      @close="emit('close-plan')"
    />
  </div>
</template>

<script setup lang="ts">
import { translate } from '../i18n';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  CodexConversationPane,
  defaultCodexChatTranslate,
  provideCodexChatTranslate,
  type CodexChatMessage,
  type CodexConversationPaneController,
  type CodexMessageTextSelection,
  type CodexNativeAttachment,
  type SurfaceMessage,
} from '@codex-app-sdk/vue';
import { PlusCircleIcon } from '../shared/icons/app-icons';
import type {
  Agent,
  RendererMessage,
  ThreadPlan,
} from '@codex-claw/core/contracts';
import type { ThreadFlagId, ThreadFlagResponse } from '@codex-claw/core/thread-flags';
import { agentDisplayName } from '@codex-claw/core/agent-display';
import ConversationPlanPanel from './ConversationPlanPanel.vue';
import ConversationLoadError from './ConversationLoadError.vue';
import AgentMention from './AgentMention.vue';
import ComposerContextCards, { type ComposerContextCard } from './ComposerContextCards.vue';
import ChatTextSelectionAnnotation from './ChatTextSelectionAnnotation.vue';
import ThreadFlagAffordance from './ThreadFlagAffordance.vue';
import type { ChatTextAnnotation } from './use-chat-text-annotations';
import type { CodeReviewFinding } from '@codex-claw/core/code-review';
import {
  presentCollaborationMessage,
  presentRendererCollaborationMessage,
  type CollaborationMessagePresentation,
} from '../shared/collaboration-message';
import { provideClawToolPresentation } from '../tool-presentation';

const { t, te } = useI18n();
const agentMentionGroupId = 'agents';
const surface = ref<{ focusComposer(): void } | null>(null);
provideCodexChatTranslate((key, params) => te(key)
  ? t(key, params ?? {})
  : defaultCodexChatTranslate(key, params));

const props = withDefaults(defineProps<{
  controller: CodexConversationPaneController;
  agent: Agent | null;
  agents?: readonly Agent[];
  attachmentAnnotationCounts?: Readonly<Record<string, number>>;
  textAnnotations?: readonly ChatTextAnnotation[];
  reviewFinding?: CodeReviewFinding | null;
  plan?: ThreadPlan | null;
  planVisible?: boolean;
  historyLoadFailed?: boolean;
  historyLoading?: boolean;
  hasVisibleMessages?: boolean;
  emptyHeadline?: string;
  emptySubhead?: string;
  threadFlagBusy?: boolean;
}>(), {
  agents: () => [],
  attachmentAnnotationCounts: () => ({}),
  textAnnotations: () => [],
  reviewFinding: null,
  planVisible: true,
  historyLoadFailed: false,
  historyLoading: false,
  hasVisibleMessages: false,
  threadFlagBusy: false,
});
provideClawToolPresentation(
  (key, params) => t(key, params ?? {}),
  (identifier) => {
    const agent = props.agents.find((candidate) => candidate.id === identifier);
    return agent ? agentDisplayName(agent) : undefined;
  },
);

const emit = defineEmits<{
  'add-text-annotation': [payload: { selection: CodexMessageTextSelection; comment: string }];
  'annotate-attachment': [attachment: CodexNativeAttachment];
  'close-plan': [];
  'remove-text-annotation': [annotationId: string];
  'remove-review-finding': [];
  'retry-history': [];
  'thread-flag': [response: ThreadFlagResponse];
}>();

const conversationKey = computed(() => props.agent?.id ?? 'no-agent');
const composerContextCards = computed<ComposerContextCard[]>(() => [
  ...props.textAnnotations.map((annotation) => ({
    id: `annotation:${annotation.id}`,
    label: t('chat.textAnnotations.annotation'),
    removeLabel: t('chat.textAnnotations.remove'),
  })),
  ...(props.reviewFinding ? [{
    id: 'review-finding',
    label: props.reviewFinding.priority.toUpperCase(),
    detail: props.reviewFinding.title,
    removeLabel: t('chat.composerContext.removeReviewFinding'),
  }] : []),
]);
const activeThreadFlags = computed<ThreadFlagId[]>(() => (
  (['ready_for_review', 'delegate_to_worktree'] as const)
    .filter((id) => props.agent?.threadFlags?.[id] === true)
));
const messageTextSelection = ref<CodexMessageTextSelection | null>(null);
const collaborationMessagePresentations = new Map<string, CollaborationMessagePresentation>();
let transformedMessageCache = new WeakMap<object, CodexChatMessage | SurfaceMessage>();
watch(conversationKey, () => {
  messageTextSelection.value = null;
  collaborationMessagePresentations.clear();
  transformedMessageCache = new WeakMap<object, CodexChatMessage | SurfaceMessage>();
});
const heroHeadline = computed(() => {
  if (props.emptyHeadline?.trim()) return props.emptyHeadline.trim();
  if (!props.agent) return translate('surface.conversationPane.selectAnAgent');
  const displayName = agentDisplayName(props.agent);
  if (
    props.agent.sessionKind === 'quickChat'
    && !props.agent.name?.trim()
    && displayName === 'Untitled conversation'
  ) {
    return t('chat.quickChatHeadline');
  }
  return `Chat with ${displayName}`;
});
const heroSubhead = computed(() => {
  if (props.emptySubhead !== undefined) return props.emptySubhead;
  if (!props.agent) return translate('surface.conversationPane.chooseAnAgentFromTheLeftToStartANativeBackendSession');
  return props.agent.folder;
});
function collaborationMessageLabel(messageId: string | undefined): string | null {
  if (!messageId) return null;
  const presentation = collaborationMessagePresentations.get(messageId);
  if (!presentation) return null;
  const names = presentation.senderNames.join(', ');
  return presentation.messageCount === 1
    ? t('chat.collaboration.messageFrom', { name: names })
    : t('chat.collaboration.messagesFrom', { names });
}

function requestAttachmentAnnotation(attachment: CodexNativeAttachment | undefined): void {
  if (attachment?.type === 'image') emit('annotate-attachment', attachment);
}

function removeComposerContextCard(itemId: string): void {
  if (itemId === 'review-finding') {
    emit('remove-review-finding');
    return;
  }
  if (itemId.startsWith('annotation:')) {
    emit('remove-text-annotation', itemId.slice('annotation:'.length));
  }
}

function annotationCount(attachment: CodexNativeAttachment | undefined): number {
  return attachment ? props.attachmentAnnotationCounts[attachment.reference] ?? 0 : 0;
}

function annotationActionLabel(attachment: CodexNativeAttachment | undefined): string {
  if (!attachment) return t('chat.attachments.annotate', { name: 'image' });
  const count = annotationCount(attachment);
  return count > 0
    ? t('chat.attachments.editAnnotations', { count, name: attachment.name })
    : t('chat.attachments.annotate', { name: attachment.name });
}

function transformConversationMessage(
  message: CodexChatMessage | SurfaceMessage,
): CodexChatMessage | SurfaceMessage {
  const cached = transformedMessageCache.get(message);
  if (cached) return cached;

  const result = 'content' in message
    ? presentCollaborationMessage(message)
    : presentRendererCollaborationMessage(message as RendererMessage);
  if (message.id && result.presentation) {
    collaborationMessagePresentations.set(message.id, result.presentation);
  }
  const transformed = result.message as CodexChatMessage | SurfaceMessage;
  transformedMessageCache.set(message, transformed);
  return transformed;
}

function focusComposer(): void {
  surface.value?.focusComposer?.();
}

defineExpose({ focusComposer });
</script>

<style scoped>
.conversation-pane {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-width: 360px;
  min-height: 0;
  overflow: hidden;
  background: var(--color-shell-main);
}

.conversation-pane__surface {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.conversation-pane__thread-flags {
  width: 100%;
  display: grid;
  gap: var(--space-4);
}

.conversation-pane__empty {
  display: grid;
  gap: var(--space-2);
  max-width: var(--conversation-content-width);
  text-align: center;
}

.conversation-pane__empty-actions {
  width: min(360px, 100%);
  margin: var(--space-8) auto 0;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-sm);
}

.conversation-pane__empty-actions :deep(.app-menu__item) {
  min-height: 42px;
  padding-inline: var(--space-6);
  border-radius: var(--radius-lg);
}

.conversation-pane__message-header {
  color: inherit;
  font: inherit;
}

.conversation-pane__annotate-attachment {
  display: grid;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-full);
  place-items: center;
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.conversation-pane__annotate-attachment:hover:not(:disabled) {
  color: var(--color-text);
  background: var(--color-surface-low);
}

.conversation-pane__annotate-attachment:disabled {
  color: var(--color-text-muted);
  cursor: default;
}

.conversation-pane__annotate-attachment--saved {
  color: var(--color-primary);
}

.conversation-pane__annotate-attachment--saved svg {
  stroke-width: 2.5;
}

.conversation-pane__annotate-attachment svg {
  width: 16px;
  height: 16px;
}

:deep(.chat-tool-call__title-target[href]:hover) {
  text-decoration: underline;
}
</style>
