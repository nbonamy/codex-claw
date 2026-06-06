<template>
  <section
    class="conversation-pane"
    aria-label="Conversation"
  >
    <WorkbenchLayout
      v-if="started"
      class="conversation-pane__layout"
      scroll-mode="child"
    >
      <MessageList
        class="conversation-pane__messages"
        :messages="chatMessages"
        :actions-disabled="isSending"
        :answered-client-request-ids="answeredClientRequestIds"
        @copy-message="$emit('copy-message', $event)"
        @client-response="$emit('client-response', $event)"
        @delete-message="$emit('delete-message', $event)"
        @edit-message="$emit('edit-message', $event)"
        @quote-message="quoteMessage"
        @retry-message="$emit('retry-message', $event)"
      />

      <template #footer>
        <ChatQueuedPrompts
          class="conversation-pane__queued-prompts"
          :prompts="queuedPrompts"
          @delete="$emit('delete-queued-prompt', $event)"
          @steer="$emit('steer-queued-prompt', $event)"
        />
        <ChatComposer
          class="conversation-pane__composer"
          :disabled="!agent"
          :files="agentFiles"
          :is-sending="isSending"
          :placeholder="composerPlaceholder"
          :models="backendModels"
          :commands="backendCommands"
          :skills="backendSkills"
          :backend-capabilities="backendCapabilities"
          :model-catalog-status="modelCatalogStatus"
          :skill-catalog-status="skillCatalogStatus"
          :draft="composerDraft"
          :draft-revision="composerDraftRevision"
          :goal-mode="goalMode"
          :plan-mode="planMode"
          :selected-model-id="selectedModelId"
          :selected-reasoning-effort="selectedReasoningEffort"
          @attach="$emit('attach')"
          @update:goal-mode="$emit('update:goalMode', $event)"
          @update:model-id="$emit('select-model', $event)"
          @update:plan-mode="$emit('update:planMode', $event)"
          @update:reasoning-effort="$emit('select-reasoning-effort', $event)"
          @interrupt="$emit('interrupt-agent')"
          @send="$emit('sendPrompt', $event)"
          @steer="$emit('steerPrompt', $event)"
        />
      </template>
    </WorkbenchLayout>

    <ConversationHistoryLoader
      v-else-if="isHydratingHistory"
      class="conversation-pane__history-loader"
    />

    <div
      v-else
      class="conversation-pane__hero"
    >
      <div class="conversation-pane__hero-copy">
        <h1>{{ heroHeadline }}</h1>
        <p>{{ heroSubhead }}</p>
      </div>
      <ChatQueuedPrompts
        class="conversation-pane__queued-prompts"
        :prompts="queuedPrompts"
        @delete="$emit('delete-queued-prompt', $event)"
        @steer="$emit('steer-queued-prompt', $event)"
      />
      <ChatComposer
        class="conversation-pane__composer"
        :disabled="!agent"
        :files="agentFiles"
        :is-sending="isSending"
        :placeholder="composerPlaceholder"
        :models="backendModels"
        :commands="backendCommands"
        :skills="backendSkills"
        :backend-capabilities="backendCapabilities"
        :model-catalog-status="modelCatalogStatus"
        :skill-catalog-status="skillCatalogStatus"
        :draft="composerDraft"
        :draft-revision="composerDraftRevision"
        :goal-mode="goalMode"
        :plan-mode="planMode"
        :selected-model-id="selectedModelId"
        :selected-reasoning-effort="selectedReasoningEffort"
        @attach="$emit('attach')"
        @update:goal-mode="$emit('update:goalMode', $event)"
        @update:model-id="$emit('select-model', $event)"
        @update:plan-mode="$emit('update:planMode', $event)"
        @update:reasoning-effort="$emit('select-reasoning-effort', $event)"
        @interrupt="$emit('interrupt-agent')"
        @send="$emit('sendPrompt', $event)"
        @steer="$emit('steerPrompt', $event)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Agent, AgentFileSearchItem, BackendCapabilities, BackendCommandSummary, BackendModelOption, BackendSkillSummary, ClientRequestResponse, ReasoningEffort, RendererMessage } from '../../shared/contracts';
import { defaultBackendCapabilities } from '../../shared/backend-capabilities';
import WorkbenchLayout from './WorkbenchLayout.vue';
import ChatComposer from './ChatComposer.vue';
import ConversationHistoryLoader from './ConversationHistoryLoader.vue';
import ChatQueuedPrompts from '../shared/chat/ChatQueuedPrompts.vue';
import MessageList from '../shared/chat/MessageList.vue';
import { rendererMessagesToChatMessages } from '../shared/chat/renderer-message-adapter';
import type { QueuedChatPrompt } from '../shared/chat/queued-prompts';

const props = withDefaults(defineProps<{
  messages: RendererMessage[];
  agent: Agent | null;
  agentFiles?: AgentFileSearchItem[];
  goalMode?: boolean;
  isLoading: boolean;
  isSending: boolean;
  answeredClientRequestIds?: Set<string>;
  backendModels?: BackendModelOption[];
  backendCommands?: BackendCommandSummary[];
  backendSkills?: BackendSkillSummary[];
  backendCapabilities?: BackendCapabilities;
  modelCatalogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  skillCatalogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  selectedModelId?: string | null;
  selectedReasoningEffort?: ReasoningEffort | null;
  queuedPrompts?: QueuedChatPrompt[];
  planMode?: boolean;
}>(), {
  queuedPrompts: () => [],
  agentFiles: () => [],
  backendModels: () => [],
  backendCommands: () => [],
  backendSkills: () => [],
  backendCapabilities: () => defaultBackendCapabilities('codex'),
  skillCatalogStatus: 'notLoaded',
});

defineEmits<{
  attach: [];
  'client-response': [response: ClientRequestResponse];
  'copy-message': [index: number];
  'delete-message': [index: number];
  'delete-queued-prompt': [promptId: string];
  'edit-message': [payload: { content: string; index: number }];
  'interrupt-agent': [];
  'quote-message': [index: number];
  'retry-message': [index: number];
  'select-model': [modelId: string];
  'select-reasoning-effort': [reasoningEffort: ReasoningEffort];
  'steer-queued-prompt': [promptId: string];
  'update:goalMode': [enabled: boolean];
  'update:planMode': [enabled: boolean];
  sendPrompt: [prompt: string];
  steerPrompt: [prompt: string];
}>();

const composerPlaceholder = computed(() => {
  if (!props.agent) {
    return 'Select an agent';
  }

  return props.isSending ? `${backendLabel.value} is working...` : 'Ask for follow-up changes';
});
const backendLabel = computed(() => (props.agent?.backend === 'claude' ? 'Claude' : 'Codex'));

const chatMessages = computed(() => rendererMessagesToChatMessages(props.messages));
const composerDraft = ref('');
const composerDraftRevision = ref(0);
const started = computed(() => chatMessages.value.length > 0 || props.isSending);
const isHydratingHistory = computed(() => Boolean(props.agent?.backendSession) && props.messages.length === 0 && props.isLoading);
const heroHeadline = computed(() => (props.agent ? `Chat with ${props.agent.name}` : 'Select an agent'));
const heroSubhead = computed(() => {
  if (!props.agent) {
    return 'Choose an agent from the left to start a native backend session.';
  }

  return props.agent.folder;
});

function quoteMessage(index: number): void {
  const message = chatMessages.value[index];
  if (!message || message.role !== 'user' || !message.content.trim()) {
    return;
  }

  composerDraft.value = message.content;
  composerDraftRevision.value += 1;
}
</script>

<style scoped>
.conversation-pane {
  --conversation-content-width: 860px;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  background: var(--color-shell-main);
}

.conversation-pane__layout {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  --workbench-layout-footer-padding: var(--space-8) 0 var(--space-8);
  --workbench-layout-footer-background: linear-gradient(
    to bottom,
    rgb(255 255 255 / 0%),
    var(--color-shell-main) 24%
  );
  --workbench-layout-scrollbar-gutter: 8px;
}

.conversation-pane__messages {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  background: var(--color-shell-main);
  --message-list-content-width: var(--conversation-content-width);
  --message-list-content-padding-top: var(--space-12);
  --message-list-content-padding-bottom: calc(var(--workbench-layout-footer-offset) + var(--space-12));
  --message-list-padding-inline-start: var(--space-8);
  --message-list-padding-inline-end: var(--space-8);
}

.conversation-pane__composer {
  width: min(calc(100% - var(--space-16) * 2), var(--conversation-content-width));
  margin: 0 auto;
  margin-bottom: var(--space-8);
}

.conversation-pane__hero {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: var(--space-24);
  width: min(calc(100% - var(--space-16) * 2), var(--conversation-content-width));
  height: 100%;
  margin: 0 auto;
  padding: var(--space-8) 0;
  padding-top: 33vh;
}

.conversation-pane__hero-copy {
  display: grid;
  gap: var(--space-2);
  text-align: center;
}

.conversation-pane__hero h1,
.conversation-pane__hero p {
  margin: 0;
}

.conversation-pane__hero h1 {
  color: var(--color-text);
  font-size: var(--font-size-24);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-28);
}

.conversation-pane__hero p {
  color: var(--color-text-muted);
}
</style>
