<script setup lang="ts">
import { translate } from '../i18n';
import type { DesktopUpdateStatus } from '@codex-claw/core/contracts';

const props = defineProps<{
  status: DesktopUpdateStatus;
}>();

const emit = defineEmits<{
  install: [];
}>();

function isVisible(): boolean {
  return props.status.state === 'downloaded';
}

function title(): string {
  if (props.status.version) {
    return `Update ${props.status.version} available. Restart Codex Claw to install.`;
  }
  return translate('surface.updateAvailableBadge.updateAvailableRestartCodexClawToInstall');
}
</script>

<template>
  <button
    v-if="isVisible()"
    class="update-available-badge"
    type="button"
    :title="title()"
    :aria-label="title()"
    @click="emit('install')"
  > {{ $t('surface.updateAvailableBadge.updateAvailable') }} </button>
</template>

<style scoped>
.update-available-badge {
  position: static;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  height: 24px;
  padding: 0 var(--space-4);
  border: 1px solid var(--color-success);
  border-radius: var(--radius-full);
  color: var(--color-on-success);
  background: var(--color-success);
  font-family: var(--font-family-base);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-16);
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.update-available-badge:hover,
.update-available-badge:focus-visible {
  color: var(--color-on-success);
  background: color-mix(in srgb, var(--color-success) 86%, #000);
}

.update-available-badge:focus-visible {
  outline: 2px solid var(--color-success);
  outline-offset: 2px;
}
</style>
