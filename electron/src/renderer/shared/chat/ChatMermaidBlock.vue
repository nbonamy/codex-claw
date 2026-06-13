<template>
  <div class="chat-mermaid-block">
    <div class="chat-mermaid-block__actions">
      <ChatIconButton bordered :label="modeToggleLabel" @click="toggleMode">
        <EyeIcon v-if="showingCode" />
        <CodeIcon v-else />
      </ChatIconButton>
      <ChatIconButton bordered :label="fullscreenLabel" @click="openFullscreen">
        <Maximize2 />
      </ChatIconButton>
    </div>
    <pre v-if="showingCode" class="chat-mermaid-block__code"><code>{{ props.code }}</code></pre>
    <div
      v-else-if="rendered.svg"
      class="chat-mermaid-block__diagram"
      v-html="rendered.svg"
    />
    <pre v-else class="chat-mermaid-block__error"><code>{{ rendered.error }}</code></pre>
    <Teleport to="body">
      <div
        v-if="fullscreenOpen"
        class="chat-mermaid-block__fullscreen"
        role="dialog"
        aria-modal="true"
        :aria-label="fullscreenLabel"
        @click.self="closeFullscreen"
      >
        <div class="chat-mermaid-block__fullscreen-panel">
          <div class="chat-mermaid-block__actions chat-mermaid-block__actions--fullscreen">
            <ChatIconButton bordered :label="modeToggleLabel" @click="toggleMode">
              <EyeIcon v-if="showingCode" />
              <CodeIcon v-else />
            </ChatIconButton>
            <ChatIconButton bordered :label="closeFullscreenLabel" @click="closeFullscreen">
              <X />
            </ChatIconButton>
          </div>
          <pre v-if="showingCode" class="chat-mermaid-block__code chat-mermaid-block__code--fullscreen"><code>{{ props.code }}</code></pre>
          <div
            v-else-if="rendered.svg"
            class="chat-mermaid-block__diagram chat-mermaid-block__diagram--fullscreen"
            v-html="rendered.svg"
          />
          <pre v-else class="chat-mermaid-block__error"><code>{{ rendered.error }}</code></pre>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { renderMermaidSVG } from 'beautiful-mermaid'
import { CodeIcon, EyeIcon, Maximize2, X } from '../icons/app-icons'
import ChatIconButton from './ChatIconButton.vue'

const props = defineProps<{
  code: string
}>()

const closeFullscreenLabel = 'Close fullscreen'
const fullscreenLabel = 'Open fullscreen'
const renderLabel = 'Render diagram'
const showCodeLabel = 'Show source'
const fullscreenOpen = ref(false)
const showingCode = ref(false)
const stylesheetImportPattern = /@import\s+url\([^)]*\);\s*/g
const rawLabelAttributePattern = /\sdata-label="[^"]*"/g

const modeToggleLabel = computed(() => showingCode.value ? renderLabel : showCodeLabel)
const rendered = computed(() => {
  try {
    return {
      error: '',
      svg: renderMermaidSVG(props.code, {
        accent: 'var(--color-primary)',
        bg: 'var(--color-surface-lowest)',
        border: 'var(--color-border)',
        fg: 'var(--color-text)',
        line: 'var(--color-border-strong)',
        muted: 'var(--color-text-muted)',
        surface: 'var(--color-surface-low)',
        transparent: true,
      }).replace(stylesheetImportPattern, '').replace(rawLabelAttributePattern, ''),
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      svg: '',
    }
  }
})

function toggleMode() {
  showingCode.value = !showingCode.value
}

function openFullscreen() {
  fullscreenOpen.value = true
}

function closeFullscreen() {
  fullscreenOpen.value = false
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
.chat-mermaid-block {
  position: relative;
  max-width: 100%;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-16) var(--space-8) var(--space-8);
  background: var(--color-surface-lowest);
}

.chat-mermaid-block__actions {
  position: absolute;
  top: var(--space-4);
  right: var(--space-4);
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.chat-mermaid-block__actions--fullscreen {
  top: var(--space-6);
  right: var(--space-6);
}

.chat-mermaid-block__diagram {
  min-width: max-content;
}

.chat-mermaid-block__diagram :deep(svg) {
  display: block;
  max-width: 100%;
  height: auto;
}

.chat-mermaid-block__diagram :deep(text) {
  font-family: var(--font-family-base);
}

.chat-mermaid-block__code {
  margin: 0;
  overflow: auto;
  color: var(--color-text);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-13);
  line-height: var(--line-height-20);
  white-space: pre;
}

.chat-mermaid-block__code--fullscreen {
  flex: 1;
  min-height: 0;
}

.chat-mermaid-block__error {
  margin: 0;
  color: var(--color-error);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-13);
  line-height: var(--line-height-20);
  white-space: pre-wrap;
}

.chat-mermaid-block__fullscreen {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-12);
  background: var(--color-overlay);
}

.chat-mermaid-block__fullscreen-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-16) var(--space-12) var(--space-12);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-lg);
}

.chat-mermaid-block__diagram--fullscreen {
  flex: 1;
}
</style>
