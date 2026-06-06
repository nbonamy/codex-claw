<template>
  <el-popover
    placement="right-end"
    popper-class="claw-popover settings-menu-popover"
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

    <nav class="claw-popover__menu settings-menu" aria-label="Settings menu">

      <div class="claw-popover__action settings-menu__usage" aria-label="Usage remaining">
        <span>Usage remaining</span>
        <strong>{{ usageRemainingLabel }}</strong>
      </div>

      <div
        class="claw-popover__separator"
        role="separator"
      />

      <button type="button" class="claw-popover__action" @click="emit('open-settings')">
        <SettingsIcon aria-hidden="true" />
        <span>Settings</span>
      </button>
      <button type="button" class="claw-popover__action claw-popover__action--danger" @click="emit('quit')">
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
  width: var(--space-24);
  height: var(--space-24);
  border: 0;
  background: transparent;
  cursor: pointer;
}

.settings-menu__trigger svg {
  width: var(--icon-xl);
  height: var(--icon-xl);
}

.settings-menu__usage {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-8);
  padding: var(--space-4) var(--space-6);
  color: var(--color-text-muted);
}

.settings-menu__usage strong {
  color: var(--color-text);
  font-weight: var(--font-weight-normal);
}

</style>
