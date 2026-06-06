<template>
  <span
    class="chat-tool-call__title"
    :class="{ 'chat-tool-call__title--running': running, 'text-shimmer': running }"
    :data-label="title"
  >
    <component v-if="icon" :is="icon" />
    <span v-if="titlePrefix && titleTarget" class="chat-tool-call__title-text">
      <span>{{ titlePrefix }}</span>
      <span class="chat-tool-call__title-target">{{ titleTarget }}</span>
    </span>
    <template v-else>
      {{ title }}
    </template>
  </span>
  <span v-if="lineDiff" class="chat-tool-call__diff" aria-label="Line changes">
    <ChatAnimatedDiffStat
      v-if="lineDiff.addedLines"
      class="chat-tool-call__diff-add"
      label="Added lines"
      sign="+"
      :value="lineDiff.addedLines"
    />
    <ChatAnimatedDiffStat
      v-if="lineDiff.removedLines"
      class="chat-tool-call__diff-delete"
      label="Removed lines"
      sign="-"
      :value="lineDiff.removedLines"
    />
  </span>
</template>

<script setup lang="ts">
import ChatAnimatedDiffStat from './ChatAnimatedDiffStat.vue'
import type { ToolLineDiff } from './tool-status'

defineProps<{
  lineDiff?: ToolLineDiff
  running?: boolean
  title: string
  titlePrefix?: string
  titleTarget?: string
  icon?: any
}>()
</script>

<style scoped>
.chat-tool-call__diff {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-13);
  line-height: var(--line-height-16);
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.chat-tool-call__diff-add {
  color: var(--color-success);
}

.chat-tool-call__diff-delete {
  color: var(--color-error);
}

.chat-tool-call__title {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-15);
  line-height: var(--line-height-20);
  font-weight: var(--font-weight-light);
}

.chat-tool-call__title svg {
  width: 15px;
  height: 15px;
}

.chat-tool-call__title--running {
  color: var(--color-text-muted);
}

.chat-tool-call__title-text {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.chat-tool-call__title-target {
  min-width: 0;
  overflow: hidden;
  color: var(--color-secondary);
  font-weight: var(--font-weight-regular);
  text-overflow: ellipsis;
}
</style>
