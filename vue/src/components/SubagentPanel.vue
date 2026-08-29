<template>
  <section class="subagent-panel" :aria-label="t('chat.subagents.detailsLabel')">
    <div class="subagent-panel__conversation">
      <div v-if="loading" class="subagent-panel__state">{{ t('chat.subagents.loadingConversation') }}</div>
      <div v-else-if="error" class="subagent-panel__state subagent-panel__state--error">
        <span>{{ t('chat.subagents.loadError') }}</span>
        <button
          class="claw-button claw-button--secondary"
          data-testid="subagent-conversation-retry"
          type="button"
          @click="refreshMessages"
        >
          {{ t('chat.subagents.retryConversation') }}
        </button>
      </div>
      <CodexMessageList
        v-else
        :messages="messages"
        :reset-key="conversationId"
        :actions-disabled="true"
        :can-delete-message="false"
        :can-edit-message="false"
        :can-fork-message="false"
        :can-retry-message="false"
        :follow-ups-disabled="true"
        :aria-label="t('chat.subagents.conversationLabel')"
        :empty-label="t('chat.subagents.emptyConversation')"
        @open-link="emit('open-link', $event)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { CodexMessageList, type CodexConversationLink } from '@codex-app-sdk/vue';
import { useI18n } from 'vue-i18n';
import type { Agent, AgentSubagentTree, RendererMessage } from '@codex-claw/core/contracts';
import { provideClawToolPresentation } from '../tool-presentation';

const props = withDefaults(defineProps<{
  agents?: readonly Agent[];
  tree: AgentSubagentTree;
  conversationId: string;
  visible?: boolean;
  loadMessages: (conversationId: string) => Promise<RendererMessage[]>;
}>(), {
  visible: true,
});

const emit = defineEmits<{
  'open-link': [link: CodexConversationLink];
}>();

const { t } = useI18n();
provideClawToolPresentation(
  (key, params) => t(key, params ?? {}),
  (identifier) => props.agents?.find((agent) => agent.id === identifier)?.name,
);

const messages = ref<RendererMessage[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
let requestId = 0;
let pollAttempts = 0;
let pollTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
const pollIntervalMs = 1_500;
const maxPollAttempts = 80;

const node = computed(() => props.tree.nodes[props.conversationId] ?? null);
const refreshKey = computed(() => `${props.conversationId}:${node.value?.updatedAt ?? ''}`);

watch(
  () => [refreshKey.value, props.visible !== false] as const,
  ([, visible]) => {
    cancelPoll();
    pollAttempts = 0;
    if (visible) void refreshMessages();
  },
  { immediate: true },
);
onBeforeUnmount(cancelPoll);

async function refreshMessages(): Promise<void> {
  const currentRequest = requestId + 1;
  requestId = currentRequest;
  loading.value = messages.value.length === 0 && pollAttempts === 0;
  error.value = null;
  try {
    const nextMessages = await props.loadMessages(props.conversationId);
    if (requestId === currentRequest) {
      messages.value = nextMessages;
      schedulePoll();
    }
  } catch (caught) {
    if (requestId === currentRequest) {
      error.value = caught instanceof Error ? caught.message : String(caught);
    }
  } finally {
    if (requestId === currentRequest) loading.value = false;
  }
}

function schedulePoll(): void {
  const current = node.value;
  if (
    props.visible === false ||
    !current ||
    (current.status !== 'pendingInit' && current.status !== 'running') ||
    pollAttempts >= maxPollAttempts
  ) {
    return;
  }
  pollAttempts += 1;
  pollTimer = globalThis.setTimeout(() => {
    pollTimer = null;
    void refreshMessages();
  }, pollIntervalMs);
}

function cancelPoll(): void {
  if (pollTimer) globalThis.clearTimeout(pollTimer);
  pollTimer = null;
}

</script>

<style scoped>
.subagent-panel {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  background: var(--color-shell-main);
}

.subagent-panel__conversation {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
}

.subagent-panel__conversation :deep(.codex-message-list) {
  min-height: 0;
  flex: 1 1 auto;
}

.subagent-panel__state {
  padding: var(--space-8);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  text-align: center;
}

.subagent-panel__state--error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  color: var(--color-error);
}
</style>
