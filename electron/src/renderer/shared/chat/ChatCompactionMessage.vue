<template>
  <div
    class="chat-message chat-message--compaction"
    :class="{ 'chat-message--compaction-running': running }"
  >
    <div class="chat-message__compaction-line" />
    <span class="chat-message__compaction-title" :data-label="title">
      <span
        class="chat-message__compaction-label"
        :class="{ 'text-shimmer': running }"
      >
        {{ title }}
      </span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  completedTitle: string
  runningTitle: string
  status?: 'completed' | 'running'
}>()

const running = computed(() => props.status === 'running')
const title = computed(() => running.value ? props.runningTitle : props.completedTitle)
</script>

<style scoped>
.chat-message {
  display: flex;
}

.chat-message--compaction {
  position: relative;
  align-items: center;
  justify-content: center;
  min-height: 28px;
}

.chat-message--compaction-running .chat-message__compaction-line {
  opacity: 0.64;
}

.chat-message__compaction-line {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  border-top: 1px solid var(--color-border);
}

.chat-message__compaction-title {
  z-index: 1;
  display: inline-block;
  padding: 0 var(--space-6);
  background: var(--color-surface-lowest);
}

.chat-message__compaction-label {
  color: var(--color-text-muted);
  font-size: var(--font-size-14);
}
</style>
