<template>
  <img
    v-bind="$attrs"
    class="github-icon"
    :src="githubIconSrc"
    :alt="alt"
    :style="iconStyle"
  >
</template>

<script setup lang="ts">
import { computed } from 'vue';

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(defineProps<{
  alt?: string;
  size?: number | string;
}>(), {
  alt: '',
  size: 'var(--icon-md)',
});

const githubIconSrc = 'https://cdn.brandfetch.io/idZAyF9rlg/theme/dark/symbol.svg?c=1bxid64Mup7aczewSAYMX&t=1779162684348';

const iconSize = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size));

const iconStyle = computed(() => ({
  width: iconSize.value,
  height: iconSize.value,
}));
</script>

<style scoped>
.github-icon {
  display: block;
  flex: 0 0 auto;
  object-fit: contain;
}
</style>
