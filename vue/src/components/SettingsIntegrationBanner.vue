<template>
  <div
    class="settings-integrations-banner"
    aria-hidden="true"
  >
    <img
      :src="bannerUrl"
      alt=""
      draggable="false"
    >
  </div>
</template>

<script setup lang="ts">
const bannerUrl = new URL('../../assets/settings-integrations-banner.png', import.meta.url).href;
</script>

<style scoped>
.settings-integrations-banner {
  width: 100%;
  aspect-ratio: 16 / 5;
  overflow: hidden;
  border-radius: var(--radius-2xl);
  background: var(--color-surface-low);
}

.settings-integrations-banner img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  user-select: none;
}
</style>
