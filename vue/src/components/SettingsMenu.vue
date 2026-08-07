<template>
  <el-popover
    v-model:visible="popoverVisible"
    placement="right-end"
    popper-class="claw-popover settings-menu-popover"
    trigger="click"
    :width="220"
  >
    <template #reference>
      <button
        class="settings-menu__trigger"
        :class="{ 'settings-menu__trigger--active': active }"
        type="button"
        :aria-label="account ? 'Account menu' : 'Settings menu'"
        :aria-pressed="active"
      >
        <UserCircleIcon v-if="account" aria-hidden="true" />
        <SettingsIcon v-else aria-hidden="true" />
      </button>
    </template>

    <div class="settings-menu" aria-label="Settings menu">
      <div v-if="account" class="settings-menu__account">
        <UserCircleIcon aria-hidden="true" />
        <div>
          <strong>{{ accountLabel }}</strong>
          <span>{{ accountDescription }}</span>
        </div>
      </div>

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
        class="settings-menu__usage-divider"
        role="separator"
        aria-label="Usage actions divider"
      />

      <AppMenu
        class="app-menu--embedded settings-menu__actions"
        ariaLabel="Settings actions"
        :items="menuItems"
        @select="selectMenuItem"
      />
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AccountRateLimitWindow, AccountRateLimits, CodexAccount } from '@codex-claw/core/contracts';
import AppMenu from '../shared/menu/AppMenu.vue';
import type { AppMenuItem } from '../shared/menu/app-menu';
import { BrandSpeedTest, QuitIcon, SettingsIcon, SparklesIcon, UserCircleIcon } from '../shared/icons/app-icons';
import { clawHostCapabilities } from '../platform-api';

const props = withDefaults(defineProps<{
  active?: boolean;
  rateLimits?: AccountRateLimits;
  account?: CodexAccount | null;
}>(), {
  active: false,
});

const emit = defineEmits<{
  'open-settings': [];
  'open-whats-new': [];
  logout: [];
  quit: [];
}>();
const popoverVisible = ref(false);
const menuItems = computed<AppMenuItem[]>(() => [
  {
    id: 'open-settings',
    type: 'action',
    label: 'Settings',
    icon: SettingsIcon,
    value: '⌘,',
  },
  {
    id: 'open-whats-new',
    type: 'action',
    label: 'What’s New',
    icon: SparklesIcon,
  },
  {
    id: 'logout',
    type: 'action',
    label: 'Log out',
    icon: QuitIcon,
  },
  ...(clawHostCapabilities.appLifecycle ? [{
    id: 'quit',
    type: 'action',
    label: 'Quit',
    icon: QuitIcon,
    danger: true,
  } satisfies AppMenuItem] : []),
]);
const accountLabel = computed(() => props.account?.type === 'chatgpt'
  ? props.account.email ?? 'ChatGPT account'
  : props.account?.type === 'apiKey' ? 'OpenAI API key' : 'Codex account');
const accountDescription = computed(() => props.account?.type === 'chatgpt'
  ? props.account.planType
  : props.account?.type === 'apiKey' ? 'Usage-based billing' : '');

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

function selectMenuItem(itemId: string): void {
  popoverVisible.value = false;

  if (itemId === 'open-settings') {
    emit('open-settings');
  } else if (itemId === 'open-whats-new') {
    emit('open-whats-new');
  } else if (itemId === 'logout') {
    emit('logout');
  } else if (itemId === 'quit') {
    emit('quit');
  }
}
</script>

<style scoped>

.settings-menu__trigger {
  border: 0;
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.settings-menu__trigger:hover,
.settings-menu__trigger:focus-visible {
  color: var(--color-text);
  outline: none;
}

.settings-menu__trigger--active {
  color: var(--color-primary);
}

.settings-menu {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.settings-menu__account {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--color-border);
}

.settings-menu__account > svg {
  flex: 0 0 auto;
  width: var(--icon-lg);
  height: var(--icon-lg);
}

.settings-menu__account > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.settings-menu__account strong,
.settings-menu__account span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-menu__account span {
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
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
  font-size: var(--font-size-13);
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
  font-size: var(--font-size-13);
  padding: 0 var(--space-4) 0 var(--space-10);
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

.settings-menu__usage-divider {
  height: 1px;
  background: var(--color-border);
}

.settings-menu__actions {
  padding-bottom: var(--space-2);
}

</style>
