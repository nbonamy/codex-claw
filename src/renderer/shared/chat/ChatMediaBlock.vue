<template>
  <figure class="chat-media-block">
    <button
      class="chat-media-block__image-button"
      type="button"
      :aria-label="fullscreenLabel"
      @click="openFullscreen"
    >
      <img
        class="chat-media-block__image"
        :alt="media.alt || generatedAltLabel"
        :src="media.url"
      >
    </button>
    <figcaption class="chat-media-block__footer">
      <span class="chat-media-block__title">{{ media.title || generatedLabel }}</span>
      <span class="chat-media-block__actions">
        <ChatIconButton :label="fullscreenLabel" @click="openFullscreen">
          <Maximize2 />
        </ChatIconButton>
        <ChatIconButton :href="media.url" download :label="downloadLabel">
          <Download />
        </ChatIconButton>
        <ChatIconButton v-if="media.prompt" :label="promptLabel" @click="toggleDetails">
          <Info />
        </ChatIconButton>
      </span>
    </figcaption>
    <ChatFoldTransition v-if="media.prompt" :open="detailsOpen">
      <div class="chat-media-block__details">
        <div class="chat-media-block__details-title">{{ promptLabel }}</div>
        <p class="chat-media-block__prompt">{{ media.prompt }}</p>
      </div>
    </ChatFoldTransition>
    <Teleport to="body">
      <div
        v-if="fullscreenOpen"
        class="chat-media-block__fullscreen"
        role="dialog"
        aria-modal="true"
        :aria-label="media.title || generatedLabel"
        @click.self="closeFullscreen"
      >
        <ChatIconButton
          bordered
          class="chat-media-block__fullscreen-close"
          :label="closeFullscreenLabel"
          @click="closeFullscreen"
        >
          <X />
        </ChatIconButton>
        <img
          class="chat-media-block__fullscreen-image"
          :alt="media.alt || generatedAltLabel"
          :src="media.url"
        >
      </div>
    </Teleport>
  </figure>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Download, Info, Maximize2, X } from '../icons/app-icons'
import ChatFoldTransition from './ChatFoldTransition.vue'
import ChatIconButton from './ChatIconButton.vue'
import type { MessageMedia } from './types'

defineProps<{
  media: MessageMedia
}>()

const closeFullscreenLabel = 'Close fullscreen'
const downloadLabel = 'Download media'
const fullscreenLabel = 'Open fullscreen'
const generatedAltLabel = 'Generated media'
const generatedLabel = 'Generated media'
const promptLabel = 'Prompt'
const detailsOpen = ref(false)
const fullscreenOpen = ref(false)

function openFullscreen() {
  fullscreenOpen.value = true
}

function closeFullscreen() {
  fullscreenOpen.value = false
}

function toggleDetails() {
  detailsOpen.value = !detailsOpen.value
}

function handleFullscreenKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeFullscreen()
  }
}

watch(fullscreenOpen, (open) => {
  if (open) {
    window.addEventListener('keydown', handleFullscreenKeydown)
  } else {
    window.removeEventListener('keydown', handleFullscreenKeydown)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleFullscreenKeydown)
})
</script>

<style scoped>
.chat-media-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 60%;
  margin: var(--space-3) var(--space-6);
}

.chat-media-block__image-button {
  display: block;
  width: 100%;
  padding: 0;
  overflow: hidden;
  border: none;
  border-radius: var(--radius-lg);
  appearance: none;
  background: var(--color-surface-low);
  cursor: pointer;
}

.chat-media-block__image {
  display: block;
  width: 100%;
  height: auto;
}

.chat-media-block__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-20);
}

.chat-media-block__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-media-block__actions {
  display: inline-flex;
  align-items: center;
  gap: 0;
}

.chat-media-block__details {
  color: var(--color-text-muted);
}

.chat-media-block__details-title {
  margin-bottom: var(--space-2);
  color: var(--color-text);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-16);
}

.chat-media-block__prompt {
  margin: 0;
  font-size: var(--font-size-13);
  line-height: var(--line-height-20);
  white-space: pre-wrap;
}

.chat-media-block__fullscreen {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-12);
  background: var(--color-overlay);
}

.chat-media-block__fullscreen-close {
  position: absolute;
  top: var(--space-6);
  right: var(--space-6);
}

.chat-media-block__fullscreen-image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  object-fit: contain;
}
</style>
