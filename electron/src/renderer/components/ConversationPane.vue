<template>
  <div class="conversation-pane">
    <CodexConversationPane
      ref="surface"
      class="conversation-pane__surface"
      :controller="controller"
      :transform-message="transformConversationMessage"
    >
      <template #empty>
        <div class="conversation-pane__empty">
          <h1>{{ heroHeadline }}</h1>
          <p>{{ heroSubhead }}</p>
        </div>
      </template>
      <template #message-header="{ message }">
        <span
          v-if="collaborationMessageLabel(message.id)"
          class="conversation-pane__message-header"
        >{{ collaborationMessageLabel(message.id) }}</span>
      </template>
      <template #composer-attachment-actions="{ attachments, index, disabled }">
        <el-tooltip
          v-if="attachments.length === 1 && attachments[index]?.type === 'image'"
          :content="t('chat.attachments.annotate')"
          placement="top"
          :show-after="300"
        >
          <button
            class="conversation-pane__annotate-attachment"
            type="button"
            :aria-label="t('chat.attachments.annotate')"
            :disabled="disabled"
            @click="requestAttachmentAnnotation(attachments[index])"
          >
            <PlusCircleIcon aria-hidden="true" />
          </button>
        </el-tooltip>
      </template>
    </CodexConversationPane>
    <ConversationPlanPanel
      v-if="plan && planVisible"
      :plan="plan"
      @close="emit('close-plan')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  CodexConversationPane,
  defaultCodexChatTranslate,
  provideCodexChatTranslate,
  type CodexChatMessage,
  type CodexConversationPaneController,
  type CodexNativeAttachment,
  type SurfaceMessage,
} from '@codex-app-sdk/vue';
import { PlusCircleIcon } from '../shared/icons/app-icons';
import type {
  Agent,
  RendererMessage,
  ThreadPlan,
} from '@codex-claw/shared/contracts';
import ConversationPlanPanel from './ConversationPlanPanel.vue';
import {
  presentCollaborationMessage,
  presentRendererCollaborationMessage,
  type CollaborationMessagePresentation,
} from '../shared/collaboration-message';
import { provideClawToolPresentation } from '../tool-presentation';

const { t, te } = useI18n();
const surface = ref<{ focusComposer(): void } | null>(null);
provideCodexChatTranslate((key, params) => te(key)
  ? t(key, params ?? {})
  : defaultCodexChatTranslate(key, params));

const props = withDefaults(defineProps<{
  controller: CodexConversationPaneController;
  agent: Agent | null;
  agents?: readonly Agent[];
  plan?: ThreadPlan | null;
  planVisible?: boolean;
}>(), {
  agents: () => [],
  planVisible: true,
});
provideClawToolPresentation(
  (key, params) => t(key, params ?? {}),
  (identifier) => props.agents.find((agent) => agent.id === identifier)?.name,
);

const emit = defineEmits<{
  'annotate-attachment': [attachment: CodexNativeAttachment];
  'close-plan': [];
}>();

const conversationKey = computed(() => props.agent?.id ?? 'no-agent');
const collaborationMessagePresentations = new Map<string, CollaborationMessagePresentation>();
let transformedMessageCache = new WeakMap<object, CodexChatMessage | SurfaceMessage>();
watch(conversationKey, () => {
  collaborationMessagePresentations.clear();
  transformedMessageCache = new WeakMap<object, CodexChatMessage | SurfaceMessage>();
});
const heroHeadline = computed(() => (props.agent ? `Chat with ${props.agent.name}` : 'Select an agent'));
const heroSubhead = computed(() => {
  if (!props.agent) return 'Choose an agent from the left to start a native backend session.';
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
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--color-shell-main);
}

.conversation-pane__surface {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.conversation-pane__empty {
  display: grid;
  gap: var(--space-2);
  max-width: var(--conversation-content-width);
  text-align: center;
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

.conversation-pane__annotate-attachment svg {
  width: 16px;
  height: 16px;
}

:deep(.chat-tool-call__title-target[href]:hover) {
  text-decoration: underline;
}
</style>
