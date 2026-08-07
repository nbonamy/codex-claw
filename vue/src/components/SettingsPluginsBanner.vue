<template>
  <div
    class="settings-plugins-banner"
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
const bannerUrl = new URL('../../assets/settings-plugins-banner.png', import.meta.url).href;
</script>

<style scoped>
.settings-plugins-banner {
  width: 100%;
  aspect-ratio: 16 / 5;
  overflow: hidden;
  border-radius: var(--radius-2xl);
  background: var(--color-surface-low);
}

.settings-plugins-banner img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  user-select: none;
}
</style>
