<template>
  <aside class="conversation-plan" aria-live="polite" :aria-label="t('chat.planProgress.title')">
    <header class="conversation-plan__header">
      <ListDetailsIcon :size="16" stroke-width="1.8" aria-hidden="true" />
      <h2>{{ t('chat.planProgress.title') }}</h2>
    </header>
    <p v-if="plan.explanation" class="conversation-plan__explanation">
      {{ plan.explanation }}
    </p>
    <ol class="conversation-plan__steps">
      <li
        v-for="(entry, index) in plan.steps"
        :key="`${index}:${entry.step}`"
        class="conversation-plan__step"
        :class="`conversation-plan__step--${entry.status}`"
      >
        <CheckIcon
          v-if="entry.status === 'completed'"
          class="conversation-plan__status-icon"
          :size="15"
          stroke-width="2.2"
          aria-hidden="true"
        />
        <Circle
          v-else
          class="conversation-plan__status-icon"
          :size="13"
          :stroke-width="entry.status === 'inProgress' ? 2.4 : 1.6"
          aria-hidden="true"
        />
        <span>{{ entry.step }}</span>
        <span class="conversation-plan__sr-only">
          {{ t(`chat.planProgress.status.${entry.status}`) }}
        </span>
      </li>
    </ol>
  </aside>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { ThreadPlan } from '@codex-claw/shared/contracts';
import { CheckIcon, Circle, ListDetailsIcon } from '../shared/icons/app-icons';

defineProps<{
  plan: ThreadPlan;
}>();

const { t } = useI18n();
</script>

<style scoped>
.conversation-plan {
  position: absolute;
  z-index: 2;
  top: var(--space-12);
  right: var(--space-12);
  box-sizing: border-box;
  width: min(280px, calc(100% - var(--space-24)));
  max-height: min(42%, 360px);
  overflow: auto;
  padding: var(--space-10) var(--space-12);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-surface-lowest) 94%, transparent);
  box-shadow: var(--shadow-menu);
  backdrop-filter: blur(18px);
}

.conversation-plan__header {
  display: flex;
  align-items: center;
  gap: var(--space-6);
}

.conversation-plan__header h2 {
  margin: 0;
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-16);
}

.conversation-plan__explanation {
  margin: var(--space-6) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  line-height: var(--line-height-16);
}

.conversation-plan__steps {
  display: grid;
  gap: var(--space-6);
  margin: var(--space-8) 0 0;
  padding: 0;
  list-style: none;
}

.conversation-plan__step {
  display: grid;
  grid-template-columns: var(--space-10) minmax(0, 1fr);
  align-items: start;
  gap: var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  line-height: var(--line-height-16);
}

.conversation-plan__step--inProgress {
  color: var(--color-text);
  font-weight: var(--font-weight-medium);
}

.conversation-plan__step--completed {
  color: var(--color-text-muted);
}

.conversation-plan__status-icon {
  margin-top: 1px;
}

.conversation-plan__step--completed .conversation-plan__status-icon {
  color: var(--color-success);
}

.conversation-plan__step--inProgress .conversation-plan__status-icon {
  color: var(--color-primary);
  fill: color-mix(in srgb, var(--color-primary) 14%, transparent);
}

.conversation-plan__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
</style>
