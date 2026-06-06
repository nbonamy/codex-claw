<template>
  <div
    class="conversation-history-loader"
    role="status"
    aria-live="polite"
    aria-label="Loading conversation"
  >
    <div class="conversation-history-loader__inner">
      <div class="conversation-history-loader__block conversation-history-loader__block--user" />
      <div class="conversation-history-loader__group">
        <div class="conversation-history-loader__block conversation-history-loader__block--wide" />
        <div class="conversation-history-loader__block conversation-history-loader__block--medium" />
        <div class="conversation-history-loader__block conversation-history-loader__block--short" />
      </div>
      <div class="conversation-history-loader__group">
        <div class="conversation-history-loader__block conversation-history-loader__block--tool" />
        <div class="conversation-history-loader__block conversation-history-loader__block--wide" />
        <div class="conversation-history-loader__block conversation-history-loader__block--medium" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.conversation-history-loader {
  --conversation-history-loader-shine: rgb(255 255 255 / 64%);
  display: grid;
  align-items: center;
  height: 100%;
  padding: var(--space-8) var(--space-32);
}

.conversation-history-loader__inner {
  display: grid;
  gap: var(--space-8);
}

.conversation-history-loader__group {
  display: grid;
  gap: var(--space-3);
  max-width: 560px;
}

.conversation-history-loader__block {
  position: relative;
  overflow: hidden;
  height: 16px;
  border-radius: var(--radius-full);
  background: var(--color-surface-base);
}

.conversation-history-loader__block::after {
  position: absolute;
  inset: 0;
  content: '';
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--conversation-history-loader-shine) 48%,
    transparent 100%
  );
  transform: translateX(-100%);
  animation: conversation-history-loader-shine 1.35s ease-in-out infinite;
}

.conversation-history-loader__block--user {
  justify-self: end;
  width: min(260px, 55%);
  height: 34px;
  border-radius: var(--radius-xl);
}

.conversation-history-loader__block--wide {
  width: min(520px, 100%);
}

.conversation-history-loader__block--medium {
  width: min(420px, 82%);
}

.conversation-history-loader__block--short {
  width: min(280px, 58%);
}

.conversation-history-loader__block--tool {
  width: min(340px, 72%);
  height: 28px;
  border-radius: var(--radius-lg);
}

@keyframes conversation-history-loader-shine {
  to {
    transform: translateX(100%);
  }
}
</style>
