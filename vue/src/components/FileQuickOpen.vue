<template>
  <div class="file-quick-open" role="presentation" @mousedown.self="emit('close')">
    <section class="file-quick-open__panel" role="dialog" aria-modal="true" aria-label="Open workspace file">
      <div class="file-quick-open__search">
        <input
          ref="input"
          v-model="query"
          type="search"
          aria-label="Quick open workspace file"
          placeholder="Open file…"
          @keydown.escape.prevent="emit('close')"
          @keydown.enter.prevent="selectCurrent"
          @keydown.up.prevent="move(-1)"
          @keydown.down.prevent="move(1)"
        />
      </div>
      <div class="file-quick-open__results">
        <button
          v-for="(file, index) in matches"
          :key="file.path"
          type="button"
          :class="{ 'file-quick-open__item--selected': index === selectedIndex }"
          @click="select(file.path)"
          @mouseenter="selectedIndex = index"
        >
          <FileTextIcon aria-hidden="true" />
          <span>{{ file.name }}</span>
          <small>{{ file.path }}</small>
        </button>
        <p v-if="matches.length === 0">No matching files.</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { AgentFileSearchItem } from '@codex-claw/core/contracts';
import { FileTextIcon } from '../shared/icons/app-icons';

const props = defineProps<{ files: AgentFileSearchItem[] }>();
const emit = defineEmits<{ close: []; select: [path: string] }>();
const input = ref<HTMLInputElement | null>(null);
const query = ref('');
const selectedIndex = ref(0);
const matches = computed(() => {
  const terms = query.value.toLocaleLowerCase().trim().split(/\s+/u).filter(Boolean);
  return props.files.filter((file) => terms.every((term) => file.path.toLocaleLowerCase().includes(term))).slice(0, 100);
});
watch(query, () => { selectedIndex.value = 0; });
onMounted(() => void nextTick(() => input.value?.focus()));
function move(delta: number): void {
  if (matches.value.length) selectedIndex.value = (selectedIndex.value + delta + matches.value.length) % matches.value.length;
}
function selectCurrent(): void { const file = matches.value[selectedIndex.value]; if (file) select(file.path); }
function select(path: string): void { emit('select', path); emit('close'); }
</script>

<style scoped>
.file-quick-open {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  background: color-mix(in srgb, var(--color-surface-highest), transparent 30%);
}

.file-quick-open__panel {
  width: min(560px, calc(100vw - var(--space-16)));
  max-height: min(440px, 70vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-lg);
}

.file-quick-open__search {
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--color-border);
}

.file-quick-open__search input {
  width: 100%;
  border: 0;
  outline: 0;
  color: var(--color-text);
  background: transparent;
  font-size: var(--font-size-16);
}

.file-quick-open__results {
  min-height: 0;
  overflow: auto;
  padding: var(--space-2);
}

.file-quick-open__results button {
  width: 100%;
  display: grid;
  grid-template-columns: var(--icon-md) minmax(80px, auto) minmax(0, 1fr);
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: transparent;
  text-align: left;
}

.file-quick-open__results button:hover,
.file-quick-open__item--selected {
  background: var(--color-primary-container) !important;
}

.file-quick-open__results svg {
  width: var(--icon-md);
  height: var(--icon-md);
  color: var(--color-text-muted);
}

.file-quick-open__results span,
.file-quick-open__results small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-quick-open__results small {
  color: var(--color-text-muted);
}

.file-quick-open__results p {
  padding: var(--space-12);
  color: var(--color-text-muted);
  text-align: center;
}
</style>
