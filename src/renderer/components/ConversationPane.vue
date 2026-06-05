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
        :answered-client-request-ids="answeredClientRequestIds"
        @client-response="$emit('client-response', $event)"
      />

      <template #footer>
        <ChatComposer
          class="conversation-pane__composer"
          :disabled="!agent"
          :is-sending="isSending"
          :placeholder="composerPlaceholder"
          :models="codexModels"
          :model-catalog-status="modelCatalogStatus"
          :selected-model-id="selectedModelId"
          :selected-reasoning-effort="selectedReasoningEffort"
          @update:model-id="$emit('select-model', $event)"
          @update:reasoning-effort="$emit('select-reasoning-effort', $event)"
          @send="$emit('sendPrompt', $event)"
        />
      </template>
    </WorkbenchLayout>

    <div
      v-else
      class="conversation-pane__hero"
    >
      <div class="conversation-pane__hero-copy">
        <h1>{{ heroHeadline }}</h1>
        <p>{{ heroSubhead }}</p>
      </div>
      <ChatComposer
        class="conversation-pane__composer"
        :disabled="!agent"
        :is-sending="isSending"
        :placeholder="composerPlaceholder"
        :models="codexModels"
        :model-catalog-status="modelCatalogStatus"
        :selected-model-id="selectedModelId"
        :selected-reasoning-effort="selectedReasoningEffort"
        @update:model-id="$emit('select-model', $event)"
        @update:reasoning-effort="$emit('select-reasoning-effort', $event)"
        @send="$emit('sendPrompt', $event)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Agent, ClientRequestResponse, CodexModelOption, ReasoningEffort, RendererMessage } from '../../shared/contracts';
import WorkbenchLayout from './WorkbenchLayout.vue';
import ChatComposer from './ChatComposer.vue';
import MessageList from '../shared/chat/MessageList.vue';
import { rendererMessagesToChatMessages } from '../shared/chat/renderer-message-adapter';

const props = defineProps<{
  messages: RendererMessage[];
  agent: Agent | null;
  isSending: boolean;
  answeredClientRequestIds?: Set<string>;
  codexModels?: CodexModelOption[];
  modelCatalogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  selectedModelId?: string | null;
  selectedReasoningEffort?: ReasoningEffort | null;
}>();

defineEmits<{
  'client-response': [response: ClientRequestResponse];
  'select-model': [modelId: string];
  'select-reasoning-effort': [reasoningEffort: ReasoningEffort];
  sendPrompt: [prompt: string];
}>();

const composerPlaceholder = computed(() => {
  if (!props.agent) {
    return 'Select an agent';
  }

  return props.isSending ? 'Codex is working...' : 'Ask for follow-up changes';
});

const chatMessages = computed(() => rendererMessagesToChatMessages(props.messages));
const started = computed(() => chatMessages.value.length > 0 || props.isSending);
const heroHeadline = computed(() => (props.agent ? `Chat with ${props.agent.name}` : 'Select an agent'));
const heroSubhead = computed(() => {
  if (!props.agent) {
    return 'Choose an agent from the left to start a native Codex session.';
  }

  return props.agent.folder;
});
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
  background: var(--color-surface-lowest);
}

.conversation-pane__layout {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  --workbench-layout-footer-padding: var(--space-8) 0 var(--space-8);
  --workbench-layout-footer-background: linear-gradient(
    to bottom,
    rgb(255 255 255 / 0%),
    var(--color-surface-lowest) 24%
  );
  --workbench-layout-scrollbar-gutter: 0px;
}

.conversation-pane__messages {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  background: var(--color-surface-lowest);
  --message-list-content-width: var(--conversation-content-width);
  --message-list-content-padding-top: var(--space-12);
  --message-list-content-padding-bottom: calc(var(--workbench-layout-footer-offset) + var(--space-12));
  --message-list-padding-inline-start: var(--space-8);
  --message-list-padding-inline-end: var(--space-8);
}

.conversation-pane__composer {
  width: min(100%, var(--conversation-content-width));
  margin: 0 auto;
}

.conversation-pane__hero {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-12);
  width: min(100%, var(--conversation-content-width));
  height: 100%;
  margin: 0 auto;
  padding: var(--space-8);
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
