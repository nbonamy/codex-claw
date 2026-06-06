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

      <div class="settings-menu__rate-limits" aria-label="Rate limits">
        <div class="settings-menu__rate-limits-header">
          <BrandSpeedTest />
          <span>Usage remaining</span>
        </div>
        <div
          v-for="row in rateLimitRows"
          :key="row.label"
          class="settings-menu__rate-limit"
        >
          <span class="settings-menu__rate-limit-label">{{ row.label }}</span>
          <span class="settings-menu__rate-limit-remaining">{{ row.remaining }}</span>
          <span class="settings-menu__rate-limit-reset">{{ row.reset }}</span>
        </div>
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
import type { AccountRateLimitWindow, AccountRateLimits } from '../../shared/contracts';
import { BrandSpeedTest, QuitIcon, SettingsIcon } from '../shared/icons/app-icons';

const props = defineProps<{
  rateLimits?: AccountRateLimits;
}>();

const emit = defineEmits<{
  'open-settings': [];
  quit: [];
}>();

type RateLimitRow = {
  label: string;
  remaining: string;
  reset: string;
};

const rateLimitRows = computed<RateLimitRow[]>(() => {
  const rows = [
    rateLimitRow(props.rateLimits?.primary ?? null, 'Usage'),
    rateLimitRow(props.rateLimits?.secondary ?? null, 'Weekly'),
  ].filter((row): row is RateLimitRow => Boolean(row));

  return rows.length > 0 ? rows : [{ label: 'Usage', remaining: 'Unknown', reset: '' }];
});

function rateLimitRow(window: AccountRateLimitWindow | null, fallbackLabel: string): RateLimitRow | null {
  if (!window) {
    return null;
  }

  return {
    label: rateLimitLabel(window, fallbackLabel),
    remaining: rateLimitRemaining(window),
    reset: rateLimitReset(window),
  };
}

function rateLimitLabel(window: AccountRateLimitWindow, fallbackLabel: string): string {
  if (window.windowDurationMins === 10_080) {
    return 'Weekly';
  }

  if (typeof window.windowDurationMins === 'number' && window.windowDurationMins > 0) {
    if (window.windowDurationMins % 60 === 0) {
      return `${window.windowDurationMins / 60}h`;
    }

    return `${window.windowDurationMins}m`;
  }

  return fallbackLabel;
}

function rateLimitRemaining(window: AccountRateLimitWindow): string {
  if (!Number.isFinite(window.usedPercent)) {
    return 'Unknown';
  }

  return `${Math.max(0, Math.min(100, Math.round(100 - window.usedPercent)))}%`;
}

function rateLimitReset(window: AccountRateLimitWindow): string {
  if (typeof window.resetsAt !== 'number') {
    return '';
  }

  const date = new Date(window.resetsAt * 1000);
  if (window.windowDurationMins === 10_080 || (window.windowDurationMins ?? 0) >= 24 * 60) {
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
    }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
</script>

<style scoped>

.settings-menu__trigger {
  border: 0;
  background: transparent;
  cursor: pointer;
}

.settings-menu__trigger svg {
  width: var(--icon-xl);
  height: var(--icon-xl);
  stroke-width: 1.25px;
  transform: scale(1.15);
}

.settings-menu__rate-limits {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
  color: var(--color-text);
}

.settings-menu__rate-limits-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-12);
  text-transform: uppercase;
  color: var(--color-text-muted);
  font-weight: var(--font-weight-medium);
  svg {
    width: var(--icon-sm);
    height: var(--icon-sm);
  }
}

.settings-menu__rate-limit {
  display: grid;
  grid-template-columns: minmax(56px, 1fr) auto auto;
  align-items: baseline;
  column-gap: var(--space-4);
  min-width: 0;
}

.settings-menu__rate-limit-label {
  min-width: 0;
  font-weight: var(--font-weight-regular);
}

.settings-menu__rate-limit-remaining,
.settings-menu__rate-limit-reset {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

</style>
