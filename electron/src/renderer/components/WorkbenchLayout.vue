<template>
  <section class="workbench-layout" :class="`workbench-layout--${scrollMode}`" :style="layoutStyle">
    <div v-if="scrollMode === 'body'" class="workbench-layout__body workbench-layout__body--scroll">
      <div class="workbench-layout__body-content">
        <slot />
      </div>
    </div>

    <div v-else class="workbench-layout__body workbench-layout__body--child">
      <slot />
    </div>

    <div
      v-if="$slots.header"
      ref="headerEl"
      class="workbench-layout__header"
    >
      <slot name="header" />
    </div>

    <div
      v-if="$slots.footer"
      ref="footerEl"
      class="workbench-layout__footer"
    >
      <slot name="footer" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

withDefaults(defineProps<{
  scrollMode?: 'body' | 'child'
}>(), {
  scrollMode: 'body',
})

const headerEl = ref<HTMLElement | null>(null)
const footerEl = ref<HTMLElement | null>(null)
const headerOffset = ref(0)
const footerOffset = ref(0)

const layoutStyle = computed(() => ({
  '--workbench-layout-header-offset': `${headerOffset.value}px`,
  '--workbench-layout-footer-offset': `${footerOffset.value}px`,
}))

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  measureChrome()

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      measureChrome()
    })
    observeChrome()
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

function observeChrome() {
  if (!resizeObserver) {
    return
  }

  resizeObserver.disconnect()

  if (headerEl.value) {
    resizeObserver.observe(headerEl.value)
  }

  if (footerEl.value) {
    resizeObserver.observe(footerEl.value)
  }
}

function measureChrome() {
  headerOffset.value = headerEl.value?.offsetHeight ?? 0
  footerOffset.value = footerEl.value?.offsetHeight ?? 0
}
</script>

<style scoped>
.workbench-layout {
  height: 100%;
  min-height: 0;
  display: grid;
}

.workbench-layout__header,
.workbench-layout__footer,
.workbench-layout__body {
  grid-area: 1 / 1;
}

.workbench-layout__body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.workbench-layout__header {
  align-self: start;
  z-index: 1;
  margin-right: var(--workbench-layout-scrollbar-gutter, var(--space-8));
  padding: var(--workbench-layout-header-padding, var(--space-12) var(--space-16));
  background: var(--workbench-layout-header-background, var(--color-surface-lowest));
}

.workbench-layout__footer {
  align-self: end;
  z-index: 1;
  margin-right: var(--workbench-layout-scrollbar-gutter, var(--space-8));
  padding: var(--workbench-layout-footer-padding, var(--space-8));
  background: var(--workbench-layout-footer-background, var(--color-surface-lowest));
}

.workbench-layout__body--child {
  overflow: hidden;
}

.workbench-layout__body--scroll {
  overflow: auto;
  scrollbar-width: thin;
}

.workbench-layout__body-content {
  display: flex;
  flex-direction: column;
  gap: var(--workbench-layout-body-gap, var(--space-8));
  min-height: 100%;
  padding:
    calc(var(--workbench-layout-header-offset) + var(--workbench-layout-body-padding-top, 0px))
    var(--workbench-layout-body-padding-inline, 0px)
    calc(var(--workbench-layout-footer-offset) + var(--workbench-layout-body-padding-bottom, 0px));
}
</style>
