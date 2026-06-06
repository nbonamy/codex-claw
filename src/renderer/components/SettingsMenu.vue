<template>
  <el-popover
    placement="right-end"
    popper-class="settings-menu-popover"
    trigger="click"
    :width="220"
  >
    <template #reference>
      <button
        class="settings-menu__trigger"
        type="button"
        aria-label="Settings menu"
      >
        <SettingsIcon aria-hidden="true" />
      </button>
    </template>

    <nav class="settings-menu" aria-label="Settings menu">
      <div class="settings-menu__usage" aria-label="Usage remaining">
        <span>Usage remaining</span>
        <strong>{{ usageRemainingLabel }}</strong>
      </div>
      <button type="button" @click="emit('open-settings')">
        <SettingsIcon aria-hidden="true" />
        <span>Settings</span>
      </button>
      <button type="button" @click="emit('quit')">
        <QuitIcon aria-hidden="true" />
        <span>Quit</span>
      </button>
    </nav>
  </el-popover>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AccountRateLimits } from '../../shared/contracts';
import { QuitIcon, SettingsIcon } from '../shared/icons/app-icons';

const props = defineProps<{
  rateLimits?: AccountRateLimits;
}>();

const emit = defineEmits<{
  'open-settings': [];
  quit: [];
}>();

const usageRemainingLabel = computed(() => {
  const usedPercent = props.rateLimits?.primary?.usedPercent;
  if (typeof usedPercent !== 'number' || !Number.isFinite(usedPercent)) {
    return 'Unknown';
  }

  return `${Math.max(0, Math.round(100 - usedPercent))}%`;
});
</script>

<style scoped>
.settings-menu__trigger {
  width: var(--space-16);
  height: var(--space-16);
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.settings-menu__trigger:hover,
.settings-menu__trigger:focus-visible {
  color: var(--color-text);
  background: var(--color-surface-low);
}

.settings-menu__trigger svg {
  width: var(--icon-lg);
  height: var(--icon-lg);
}

.settings-menu {
  display: grid;
  gap: var(--space-2);
}

.settings-menu__usage {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-8);
  padding: var(--space-4) var(--space-6);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
}

.settings-menu__usage strong {
  color: var(--color-text);
  font-weight: var(--font-weight-medium);
}

.settings-menu button {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  width: 100%;
  border: 0;
  border-radius: var(--radius-md);
  padding: var(--space-4) var(--space-6);
  color: var(--color-text);
  background: transparent;
  font-size: var(--font-size-14);
  text-align: left;
  cursor: pointer;
}

.settings-menu button:hover,
.settings-menu button:focus-visible {
  background: var(--color-surface-base);
}

.settings-menu button svg {
  width: var(--icon-md);
  height: var(--icon-md);
  color: var(--color-text-muted);
}
</style>
