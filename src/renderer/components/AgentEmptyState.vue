<template>
  <section
    class="agent-empty-state"
    aria-label="No agents"
  >
    <div class="agent-empty-state__mark">
      <span>CC</span>
    </div>

    <div class="agent-empty-state__copy">
      <h1>Welcome to Codex Claw!</h1>
      <p>Add an agent to your team</p>
    </div>

    <el-button
      type="primary"
      class="agent-empty-state__new"
      @click="emit('new-agent')"
    >
      New Agent
    </el-button>
  </section>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  'new-agent': [];
}>();
</script>

<style scoped>
.agent-empty-state {
  width: 100%;
  height: 100%;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: var(--space-16);
  padding: var(--space-16);
  color: var(--color-text);
  background: var(--color-background);
}

.agent-empty-state__mark {
  width: 112px;
  height: 112px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-2xl);
  color: var(--color-text);
  background: var(--color-surface-low);
  box-shadow: var(--shadow-lg);
}

.agent-empty-state__mark span {
  font-size: var(--font-size-24);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-28);
}

.agent-empty-state__copy {
  display: grid;
  gap: var(--space-2);
  text-align: center;
}

.agent-empty-state__copy h1,
.agent-empty-state__copy p {
  margin: 0;
}

.agent-empty-state__copy h1 {
  font-size: var(--font-size-24);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-32);
}

.agent-empty-state__copy p {
  color: var(--color-text-muted);
  font-size: var(--font-size-20);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-28);
}

.agent-empty-state__new {
  min-width: 240px;
  min-height: 52px;
  border-radius: var(--radius-lg);
  font-weight: var(--font-weight-semibold);
}
</style>
