<template>
  <div
    ref="menuEl"
    class="chat-composer-file-menu"
    role="listbox"
    aria-label="Files"
  >
    <div class="chat-composer-file-menu__section">
      {{ t('chat.files.title') }}
    </div>
    <button
      v-for="(file, index) in visibleFiles"
      :key="file.path"
      class="chat-composer-file-menu__item"
      :class="{ 'chat-composer-file-menu__item--active': index === activeIndex }"
      role="option"
      type="button"
      @mousedown.prevent="$emit('select', file)"
    >
      <FileTextIcon
        class="chat-composer-file-menu__icon"
        aria-hidden="true"
      />
      <span class="chat-composer-file-menu__name">{{ file.name }}</span>
      <span class="chat-composer-file-menu__path">{{ file.path }}</span>
    </button>
    <div
      v-if="showHint"
      class="chat-composer-file-menu__hint"
    >
      {{ t('chat.files.hint') }}
    </div>
    <div
      v-else-if="visibleFiles.length === 0"
      class="chat-composer-file-menu__empty"
    >
      {{ t('chat.files.empty') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AgentFileSearchItem } from '@codex-claw/shared/contracts';
import { FileTextIcon } from '../shared/icons/app-icons';

const props = defineProps<{
  activeIndex: number;
  showHint?: boolean;
  visibleFiles: AgentFileSearchItem[];
}>();

defineEmits<{
  select: [file: AgentFileSearchItem];
}>();

const { t } = useI18n();
const menuEl = ref<HTMLElement | null>(null);

watch(
  () => [props.activeIndex, props.visibleFiles],
  async () => {
    await nextTick();
    const activeItem = menuEl.value?.querySelectorAll<HTMLButtonElement>('.chat-composer-file-menu__item')
      .item(props.activeIndex);
    if (typeof activeItem?.scrollIntoView === 'function') {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  },
);
</script>

<style scoped>
.chat-composer-file-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + var(--space-4));
  left: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  max-height: 280px;
  overflow-y: auto;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-lg);
}

.chat-composer-file-menu__section {
  padding: var(--space-3) var(--space-4) var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-medium);
  line-height: normal;
  text-transform: uppercase;
}

.chat-composer-file-menu__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-width: 0;
  padding: var(--space-3) var(--space-4);
  border: 0;
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  line-height: 1.35;
  text-align: left;
}

.chat-composer-file-menu__item:hover,
.chat-composer-file-menu__item--active {
  background: var(--color-surface);
}

.chat-composer-file-menu__icon {
  width: var(--icon-md);
  height: var(--icon-md);
  flex: 0 0 var(--icon-md);
  color: var(--color-text-muted);
}

.chat-composer-file-menu__name {
  overflow: hidden;
  font-weight: var(--font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.chat-composer-file-menu__path {
  overflow: hidden;
  min-width: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-composer-file-menu__empty,
.chat-composer-file-menu__hint {
  padding: var(--space-3) var(--space-4) var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: normal;
}
</style>
