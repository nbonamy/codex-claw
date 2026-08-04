<template>
  <el-dialog
    class="claw-dialog whats-new-dialog"
    :model-value="visible"
    :teleported="false"
    width="680px"
    :show-close="false"
    destroy-on-close
    @update:model-value="onVisibilityChanged"
  >
    <template #header>
      <div class="claw-dialog__header whats-new-dialog__header">
        <div class="whats-new-dialog__heading">
          <span class="whats-new-dialog__version">Version {{ releaseNotes.version }}</span>
          <h2 class="claw-dialog__title">What’s new in Codex Claw</h2>
          <p class="claw-dialog__subtitle">Released {{ formattedReleaseDate }}</p>
        </div>
        <button
          class="claw-dialog__icon-button"
          type="button"
          aria-label="Close What’s New"
          @click="emit('close')"
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </template>

    <MarkdownPanel
      class="whats-new-dialog__notes"
      :content="releaseNotes.markdown"
    />
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import releaseNotes from '../generated/release-notes.json';
import { X } from '../shared/icons/app-icons';
import MarkdownPanel from './MarkdownPanel.vue';

defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const formattedReleaseDate = computed(() => new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
}).format(new Date(`${releaseNotes.releasedAt}T00:00:00Z`)));

function onVisibilityChanged(visible: boolean): void {
  if (!visible) emit('close');
}
</script>

<style scoped>
.whats-new-dialog__header {
  align-items: flex-start;
}

.whats-new-dialog__heading {
  display: grid;
  gap: var(--space-1);
}

.whats-new-dialog__version {
  width: fit-content;
  margin-bottom: var(--space-2);
  padding: var(--space-1) var(--space-4);
  border-radius: var(--radius-full);
  color: var(--color-on-primary-container);
  background: var(--color-primary-container);
  font-size: var(--font-size-11);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-18);
}

.whats-new-dialog__notes {
  max-height: min(64vh, 620px);
  padding: var(--space-12) var(--space-8) var(--space-8);
}

.whats-new-dialog__notes :deep(.codex-markdown) {
  max-width: 72ch;
  margin: 0 auto;
}
</style>
