<template>
  <div
    class="chat-turn-git-info"
    aria-label="Current turn git changes"
  >
    <span class="chat-turn-git-info__label">Current turn</span>
    <span class="chat-turn-git-info__diff">
      <ChatAnimatedDiffStat
        v-if="diff.addedLines"
        kind="added"
        label="Added lines"
        :value="diff.addedLines"
      />
      <ChatAnimatedDiffStat
        v-if="diff.removedLines"
        kind="deleted"
        label="Removed lines"
        :value="diff.removedLines"
      />
    </span>
  </div>
</template>

<script setup lang="ts">
import type { TurnGitDiff } from '@codex-claw/shared/contracts';
import ChatAnimatedDiffStat from './ChatAnimatedDiffStat.vue';

defineProps<{
  diff: TurnGitDiff;
}>();
</script>

<style scoped>
.chat-turn-git-info {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-8);
  padding: var(--space-6) var(--space-12);
  border: 1px solid var(--color-border);
  border-bottom: none;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  color: var(--color-text-muted);
  background: var(--color-shell-main);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.chat-turn-git-info__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-turn-git-info__diff {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: var(--space-4);
}
</style>
