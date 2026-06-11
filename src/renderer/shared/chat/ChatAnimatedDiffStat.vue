<template>
  <span
    class="chat-animated-diff-stat"
    :class="`chat-animated-diff-stat--${kind}`"
    :aria-label="labelText"
  >
    <span class="chat-animated-diff-stat__sign">{{ sign }}</span>
    <span class="chat-animated-diff-stat__digits">
      <span
        v-for="column in digitColumns"
        :key="column.place"
        class="chat-animated-diff-stat__digit-column"
      >
        <Transition name="chat-animated-diff-stat__digit">
          <span
            :key="`${column.place}-${column.digit}`"
            class="chat-animated-diff-stat__digit"
          >
            {{ column.digit }}
          </span>
        </Transition>
      </span>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  kind: 'added' | 'deleted'
  label: string
  value: number
}>()

const sign = computed(() => (props.kind === 'added' ? '+' : '-'))

const normalizedValue = computed(() => {
  if (!Number.isFinite(props.value)) {
    return 0
  }
  return Math.max(0, Math.trunc(props.value))
})

const digitColumns = computed(() => {
  const digits = String(normalizedValue.value).split('')
  return digits.map((digit, index) => ({
    digit,
    place: digits.length - index - 1,
  }))
})

const labelText = computed(() => `${props.label}: ${sign.value}${normalizedValue.value}`)
</script>

<style scoped>
.chat-animated-diff-stat {
  display: inline-flex;
  align-items: center;
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-13);
  line-height: var(--line-height-16);
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.chat-animated-diff-stat--added {
  color: var(--color-success);
}

.chat-animated-diff-stat--deleted {
  color: var(--color-error);
}

.chat-animated-diff-stat__sign {
  flex: 0 0 auto;
}

.chat-animated-diff-stat__digits {
  display: inline-flex;
  align-items: center;
}

.chat-animated-diff-stat__digit-column {
  position: relative;
  display: inline-block;
  width: 1ch;
  height: 1.25em;
  overflow: hidden;
  vertical-align: top;
}

.chat-animated-diff-stat__digit {
  position: absolute;
  inset: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.chat-animated-diff-stat__digit-enter-active,
.chat-animated-diff-stat__digit-leave-active {
  transition:
    transform 180ms ease-out,
    opacity 180ms ease-out;
}

.chat-animated-diff-stat__digit-enter-from {
  opacity: 0;
  transform: translateY(100%);
}

.chat-animated-diff-stat__digit-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}

@media (prefers-reduced-motion: reduce) {
  .chat-animated-diff-stat__digit-enter-active,
  .chat-animated-diff-stat__digit-leave-active {
    transition: none;
  }
}
</style>
