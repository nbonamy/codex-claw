<template>
  <section
    class="conversation-pane"
    aria-label="Conversation"
  >
    <div class="conversation-pane__messages">
      <article
        v-for="message in messages"
        :key="message.id"
        class="conversation-pane__message"
        :data-role="message.role"
      >
        <header>{{ message.role }}</header>
        <div
          v-for="(part, index) in message.parts"
          :key="`${message.id}-${index}`"
          class="conversation-pane__part"
          :data-part="part.type"
        >
          <template v-if="part.type === 'text'">{{ part.text }}</template>
          <template v-else-if="part.type === 'tool'">
            <strong>{{ part.title }}</strong>
            <span>{{ part.status }}</span>
            <pre v-if="part.body">{{ part.body }}</pre>
          </template>
          <template v-else>{{ part.text }}</template>
        </div>
      </article>
    </div>

    <form
      class="conversation-pane__composer"
      @submit.prevent
    >
      <span aria-hidden="true">&gt;</span>
      <input
        :placeholder="composerPlaceholder"
        aria-label="Prompt"
        disabled
      />
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Agent, RendererMessage } from '../../shared/contracts';

const props = defineProps<{
  messages: RendererMessage[];
  agent: Agent | null;
}>();

const composerPlaceholder = computed(() => {
  return props.agent ? `Prompt ${props.agent.name}` : 'Select an agent';
});
</script>

<style scoped>
.conversation-pane {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  background: var(--cc-conversation-bg);
}

.conversation-pane__messages {
  min-height: 0;
  overflow: auto;
  padding: var(--cc-space-5);
}

.conversation-pane__message {
  max-width: 860px;
  margin-bottom: var(--cc-space-4);
  color: var(--cc-text);
}

.conversation-pane__message header {
  margin-bottom: var(--cc-space-2);
  color: var(--cc-text-muted);
  font: var(--cc-font-caption);
  text-transform: uppercase;
}

.conversation-pane__part {
  padding: var(--cc-space-3) var(--cc-space-4);
  border: 1px solid var(--cc-border);
  border-radius: var(--cc-radius-2);
  background: var(--cc-message-bg);
  line-height: 1.5;
}

.conversation-pane__part + .conversation-pane__part {
  margin-top: var(--cc-space-2);
}

.conversation-pane__part[data-part='status'] {
  color: var(--cc-text-muted);
  background: var(--cc-status-surface);
}

.conversation-pane__part[data-part='tool'] {
  display: grid;
  gap: var(--cc-space-2);
  background: var(--cc-tool-bg);
}

.conversation-pane__part pre {
  overflow: auto;
  margin: 0;
  color: var(--cc-code-text);
  font: var(--cc-font-code);
}

.conversation-pane__composer {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--cc-space-2);
  align-items: center;
  min-height: 64px;
  padding: 0 var(--cc-space-5);
  color: var(--cc-text);
  background: var(--cc-composer-bg);
  border-top: 1px solid var(--cc-border-muted);
}

.conversation-pane__composer input {
  min-width: 0;
  border: 0;
  outline: 0;
  color: var(--cc-text);
  background: transparent;
  font: var(--cc-font-body);
}
</style>
