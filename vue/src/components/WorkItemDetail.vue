<template>
  <section class="work-item-detail">
    <a :href="item.url" target="_blank" rel="noopener noreferrer">{{ workItemDisplayIdentifier(item) }} · {{ item.title }}</a>
    <p>{{ item.nativeState ?? item.state }}<span v-if="item.assignees?.length"> · {{ item.assignees.join(', ') }}</span></p>
    <p v-if="item.labels.length">{{ item.labels.map(label => label.name).join(', ') }}</p>
    <p class="work-item-detail__body">{{ item.body }}</p>
  </section>
</template>
<script setup lang="ts">
import { workItemDisplayIdentifier } from '@workspace/core/work-item-prompts';
import type { WorkItem } from '@workspace/core/contracts';
defineProps<{ item: WorkItem }>();
</script>
<style scoped>
.work-item-detail {
  padding: var(--space-8);
  color: var(--color-text);
}

.work-item-detail a {
  color: var(--color-primary);
}

.work-item-detail__body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
