<template>
  <span
    v-if="usagePercent !== null && usageDetails"
    class="chat-context-usage"
    :style="{ '--chat-context-usage-percent': `${usagePercent}%` }"
    :aria-label="t('chat.contextUsage.ariaLabel')"
    tabindex="0"
  >
    <span class="chat-context-usage__dot" />
    <span
      class="chat-context-usage__popover"
      role="tooltip"
    >
      <span class="chat-context-usage__title">{{ t('chat.contextUsage.title') }}</span>
      <strong>{{ t('chat.contextUsage.usedAndLeft', { used: usagePercent, left: usageDetails.leftPercent }) }}</strong>
      <span>{{ t('chat.contextUsage.tokensUsed', { used: usageDetails.usedTokens, window: usageDetails.windowTokens }) }}</span>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AgentContextUsage } from '@codex-claw/shared/contracts';

const props = defineProps<{
  contextUsage?: AgentContextUsage;
}>();
const { t } = useI18n();

const usagePercent = computed(() => {
  const percent = props.contextUsage?.usedPercent;
  if (typeof percent !== 'number') {
    return null;
  }

  return Math.round(Math.min(100, Math.max(0, percent)));
});

const usageDetails = computed(() => {
  const usage = props.contextUsage;
  if (!usage || usagePercent.value === null || typeof usage.modelContextWindow !== 'number') {
    return null;
  }

  const contextTokens = Math.min(Math.max(0, usage.lastTotalTokens), usage.modelContextWindow);
  return {
    leftPercent: Math.max(0, 100 - usagePercent.value),
    usedTokens: compactTokenCount(contextTokens),
    windowTokens: compactTokenCount(usage.modelContextWindow),
  };
});

function compactTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${Math.round(tokens / 100_000) / 10}m`;
  }

  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}k`;
  }

  return tokens.toLocaleString();
}
</script>

<style scoped>
.chat-context-usage {
  --chat-context-usage-percent: 0%;
  position: relative;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  outline: none;
}

.chat-context-usage__dot {
  position: relative;
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
  border: 3px solid var(--color-surface-high);
}

.chat-context-usage__dot::after {
  position: absolute;
  inset: -3px;
  content: '';
  border-radius: var(--radius-full);
  background: conic-gradient(
    var(--color-primary) 0 var(--chat-context-usage-percent),
    transparent var(--chat-context-usage-percent) 100%
  );
  mask: radial-gradient(circle at center, transparent 0 45%, black 47%);
}

.chat-context-usage__popover {
  position: absolute;
  z-index: 30;
  right: 50%;
  bottom: calc(100% + var(--space-2));
  display: grid;
  min-width: 184px;
  justify-items: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-8);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  color: var(--color-text);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-menu);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
  opacity: 0;
  pointer-events: none;
  text-align: center;
  transform: translateX(50%) translateY(2px);
  transition: opacity 120ms ease, transform 120ms ease;
  white-space: nowrap;
}

.chat-context-usage__title {
  color: var(--color-text-muted);
}

.chat-context-usage__popover strong {
  font-weight: var(--font-weight-medium);
}

.chat-context-usage:hover .chat-context-usage__popover,
.chat-context-usage:focus-visible .chat-context-usage__popover {
  opacity: 1;
  transform: translateX(50%) translateY(0);
}
</style>
