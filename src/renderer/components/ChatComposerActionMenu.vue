<template>
  <div
    ref="rootEl"
    class="chat-composer-action-menu__root"
  >
    <button
      class="chat-composer-action-menu__button"
      type="button"
      aria-label="Composer actions"
      :disabled="disabled"
      aria-haspopup="menu"
      :aria-expanded="menuOpen"
      @click="toggleMenu"
    >
      <PlusIcon />
    </button>

    <div
      v-if="menuOpen"
      class="chat-composer-action-menu"
      role="menu"
    >
      <button
        class="chat-composer-action-menu__item"
        type="button"
        role="menuitem"
        disabled
        @click="emit('attach')"
      >
        <PaperclipIcon />
        <span>Attach</span>
      </button>
      <button
        v-if="showPlanMode"
        class="chat-composer-action-menu__item"
        type="button"
        role="menuitemcheckbox"
        :aria-checked="planMode"
        @click="emit('update:planMode', !planMode)"
      >
        <span class="chat-composer-action-menu__label">Plan mode</span>
        <el-switch
          :model-value="planMode"
          size="small"
          @click.stop
          @change="emit('update:planMode', Boolean($event))"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { PaperclipIcon, PlusIcon } from '../shared/icons/app-icons';

const props = withDefaults(defineProps<{
  disabled?: boolean;
  planMode: boolean;
  showPlanMode?: boolean;
}>(), {
  disabled: false,
  showPlanMode: true,
});

const emit = defineEmits<{
  attach: [];
  'update:planMode': [enabled: boolean];
}>();

const rootEl = ref<HTMLElement | null>(null);
const menuOpen = ref(false);

onMounted(() => {
  document.addEventListener('click', closeOnOutsideClick);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', closeOnOutsideClick);
});

function toggleMenu(event: MouseEvent): void {
  event.stopPropagation();
  if (!props.disabled) {
    menuOpen.value = !menuOpen.value;
  }
}

function closeOnOutsideClick(event: MouseEvent): void {
  const root = rootEl.value;
  if (root && event.target && !root.contains(event.target as Node)) {
    menuOpen.value = false;
  }
}
</script>

<style scoped>
.chat-composer-action-menu__root {
  position: relative;
  flex: 0 0 auto;
}

.chat-composer-action-menu__button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--chat-composer-button-size, 36px);
  height: var(--chat-composer-button-size, 36px);
  border: 0;
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.chat-composer-action-menu__button:hover:not(:disabled) {
  color: var(--color-text);
  background: var(--color-surface-base);
}

.chat-composer-action-menu__button:disabled {
  cursor: default;
}

.chat-composer-action-menu__button svg {
  width: var(--icon-lg);
  height: var(--icon-lg);
}

.chat-composer-action-menu {
  position: absolute;
  left: 0;
  bottom: calc(100% + var(--space-4));
  z-index: 10;
  display: grid;
  gap: var(--space-1);
  min-width: 188px;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-lg);
}

.chat-composer-action-menu__item {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  width: 100%;
  min-height: 34px;
  padding: 0 var(--space-4);
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.chat-composer-action-menu__item:hover:not(:disabled) {
  background: var(--color-surface-base);
}

.chat-composer-action-menu__item:disabled {
  color: var(--color-text-muted);
  cursor: default;
}

.chat-composer-action-menu__item svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.chat-composer-action-menu__label {
  flex: 1 1 auto;
}
</style>
