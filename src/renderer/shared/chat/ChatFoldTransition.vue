<template>
  <div class="chat-fold" :class="{ 'chat-fold--open': open }">
    <div class="chat-fold__inner">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  open: boolean
}>()
</script>

<style scoped>
.chat-fold {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows 180ms ease,
    opacity 140ms ease;
}

.chat-fold--open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.chat-fold__inner {
  min-height: 0;
  overflow: hidden;
}
</style>
