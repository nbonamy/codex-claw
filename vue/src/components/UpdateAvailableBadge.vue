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

function isBusy(): boolean {
  return props.status.state === 'checking' || props.status.state === 'downloading';
}

function busyLabel(): string {
  return props.status.state === 'downloading'
    ? translate('surface.updateAvailableBadge.downloadingUpdate')
    : translate('surface.updateAvailableBadge.checkingForUpdates');
}

function title(): string {
  if (props.status.version) {
    return `Update ${props.status.version} available. Restart Codex Claw to install.`;
  }
  return translate('surface.updateAvailableBadge.updateAvailableRestartCodexClawToInstall');
}
</script>

<template>
  <span
    v-if="isBusy()"
    class="update-status-badge--busy"
    role="status"
    aria-live="polite"
  >
    <span
      class="update-status-badge__spinner"
      aria-hidden="true"
    />
    {{ busyLabel() }}
  </span>
  <button
    v-else-if="isVisible()"
    class="update-available-badge"
    type="button"
    :title="title()"
    :aria-label="title()"
    @click="emit('install')"
  > {{ $t('surface.updateAvailableBadge.updateAvailable') }} </button>
</template>

<style scoped>
.update-status-badge--busy,
.update-available-badge {
  position: static;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  height: 24px;
  padding: 0 var(--space-4);
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  font-family: var(--font-family-base);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-16);
  -webkit-app-region: no-drag;
}

.update-status-badge--busy {
  color: var(--color-on-primary);
  background: var(--color-primary);
}

.update-status-badge__spinner {
  width: 10px;
  height: 10px;
  margin-right: var(--space-3);
  border: 1.5px solid color-mix(in srgb, currentColor 38%, transparent);
  border-top-color: currentColor;
  border-radius: var(--radius-full);
  animation: update-status-spin 800ms linear infinite;
}

.update-available-badge {
  border-color: var(--color-success);
  color: var(--color-on-success);
  background: var(--color-success);
  cursor: pointer;
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

@keyframes update-status-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .update-status-badge__spinner {
    animation: none;
  }
}
</style>
