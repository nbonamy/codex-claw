<template>
  <section class="loop-welcome" aria-label="Loops welcome">
    <div class="loop-welcome__icon" aria-hidden="true">
      <InfinityIcon />
    </div>
    <div class="loop-welcome__copy">
      <h3>No loops yet</h3>
      <p>A loop is an automation that just works for you.</p>
      <p>Start with GitHub issues, pick a Bench agent, and let Skwad create the right agent whenever matching work appears.</p>
    </div>
    <el-button
      type="primary"
      class="loop-welcome__button"
      @click="emit('create')"
    >
      Create Loop
    </el-button>
  </section>
</template>

<script setup lang="ts">
import { InfinityIcon } from '../shared/icons/app-icons';

const emit = defineEmits<{
  create: [];
}>();
</script>

<style scoped>
.loop-welcome {
  min-height: 360px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-16);
  padding: var(--space-32);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-lowest);
  text-align: center;
}

.loop-welcome__icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-full);
  color: var(--color-primary);
  background: var(--color-surface-low);
}

.loop-welcome__icon svg {
  width: var(--icon-xl);
  height: var(--icon-xl);
  stroke-width: 1.4;
}

.loop-welcome__copy {
  max-width: 440px;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.loop-welcome__copy h3,
.loop-welcome__copy p {
  margin: 0;
}

.loop-welcome__copy h3 {
  color: var(--color-text);
  font-size: var(--font-size-20);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-28);
}

.loop-welcome__copy p {
  color: var(--color-text-muted);
  font-size: var(--font-size-14);
  line-height: var(--line-height-20);
}

.loop-welcome__button {
  min-width: 128px;
}
</style>
