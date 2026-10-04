<template>
  <section class="linear-issue-detail">
    <a :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.identifier }} · {{ item.title }}</a>
    <p>{{ item.nativeState }}<span v-if="item.assignees?.length"> · {{ item.assignees.join(', ') }}</span></p>
    <p v-if="item.labels.length">{{ item.labels.map(label => label.name).join(', ') }}</p>
    <p class="linear-issue-detail__body">{{ item.body }}</p>
  </section>
</template>
<script setup lang="ts">
import type { WorkItem } from '@codex-claw/core/contracts';
defineProps<{ item: WorkItem }>();
</script>
<style scoped>
.linear-issue-detail {
  padding: var(--space-8);
  color: var(--color-text);
}

.linear-issue-detail a {
  color: var(--color-primary);
}

.linear-issue-detail__body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
