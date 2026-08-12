<template>
  <section class="browser-panel" aria-label="In-app browser">
    <header class="browser-panel__toolbar" :class="{ 'browser-panel__toolbar--visualization': visualization }">
      <div v-if="!visualization" class="browser-panel__navigation" aria-label="Browser navigation">
        <button type="button" aria-label="Go back" title="Go back" :disabled="!state.canGoBack || loading" @click="goBack"><IconArrowLeft /></button>
        <button type="button" aria-label="Go forward" title="Go forward" :disabled="!state.canGoForward || loading" @click="goForward"><IconArrowRight /></button>
        <button type="button" aria-label="Reload page" title="Reload" :disabled="loading" @click="reload"><IconRefresh /></button>
      </div>
      <form v-if="!annotationMode && !visualization" class="browser-panel__address" @submit.prevent="navigate">
        <input v-model="address" aria-label="Browser address" spellcheck="false" :title="state.title || address" />
      </form>
      <div v-else-if="visualization" class="browser-panel__visualization-title">{{ visualization.title }}</div>
      <div v-else class="browser-panel__annotation-title"><strong>Annotating</strong><span>•</span><span>{{ displayHost }}</span></div>
      <div class="browser-panel__actions">
        <button v-if="!visualization" class="browser-panel__annotate" type="button" :aria-label="annotationMode ? 'Exit annotation mode' : 'Annotate page'" :title="annotationMode ? 'Exit annotation mode' : 'Annotate page'" :aria-pressed="annotationMode" @click="toggleAnnotation"><IconX v-if="annotationMode" /><IconCirclePlus v-else /></button>
        <AnnotationSendButton
          v-if="annotations.length"
          :count="annotations.length"
          :label="`Send ${annotations.length} annotations`"
          @click="sendAnnotations"
        />
        <button type="button" aria-label="Browser menu" title="Browser menu" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen"><IconDotsVertical /></button>
        <div v-if="menuOpen" class="browser-panel__menu" role="menu">
          <button type="button" role="menuitem" @click="close">Close browser</button>
        </div>
      </div>
    </header>
    <p v-if="error" class="browser-panel__error" role="alert">{{ error }}</p>
    <div class="browser-panel__surface">
      <div ref="viewport" class="browser-panel__viewport">
        <div v-if="loading" class="browser-panel__loading">Opening browser…</div>
      </div>
    </div>

  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { IconArrowLeft, IconArrowRight, IconCirclePlus, IconDotsVertical, IconRefresh, IconX } from '@tabler/icons-vue';
import { PRIMARY_BROWSER_ID, type BrowserAnnotation, type BrowserBounds, type BrowserState, type MainToRendererEvent } from '@codex-claw/core/contracts';
import { codexClawApi } from '../platform-api';
import AnnotationSendButton from './AnnotationSendButton.vue';

const props = withDefaults(defineProps<{
  agentId: string;
  browserId?: string;
  initialUrl?: string;
  openRequestId?: number;
  visible?: boolean;
  visualization?: { path: string; title: string } | null;
}>(), {
  initialUrl: '',
  browserId: PRIMARY_BROWSER_ID,
  openRequestId: 0,
  visible: true,
  visualization: null,
});
const emit = defineEmits<{ close: []; 'send-prompt': [prompt: string] }>();

const viewport = ref<HTMLElement | null>(null);
const address = ref(props.initialUrl ?? '');
const loading = ref(true);
const error = ref<string | null>(null);
const annotationMode = ref(false);
const annotations = ref<BrowserAnnotation[]>([]);
const state = ref<BrowserState>({ url: '', title: '', canGoBack: false, canGoForward: false });
const menuOpen = ref(false);
const displayHost = computed(() => {
  try {
    return new URL(state.value.url || address.value).host;
  } catch {
    return address.value;
  }
});
let resizeObserver: ResizeObserver | null = null;
let unsubscribe: (() => void) | null = null;

onMounted(async () => {
  unsubscribe = codexClawApi?.onEvent(handleEvent) ?? null;
  resizeObserver = new ResizeObserver(() => void syncBounds());
  window.addEventListener('resize', syncBoundsAfterWindowResize);
  if (viewport.value) resizeObserver.observe(viewport.value);
  try {
    state.value = await openInitialContent();
    if (state.value.url) address.value = state.value.url;
  } catch (reason) {
    error.value = messageFor(reason);
  } finally {
    loading.value = false;
    await nextTick();
    await syncBounds();
  }
});

onBeforeUnmount(() => {
  unsubscribe?.();
  resizeObserver?.disconnect();
  window.removeEventListener('resize', syncBoundsAfterWindowResize);
  void codexClawApi?.browserClose(props.agentId, props.browserId);
});

watch(() => props.visible, async (visible) => {
  if (!codexClawApi) return;
  await codexClawApi.browserSetVisible(props.agentId, props.browserId, visible);
  if (visible) {
    await nextTick();
    await syncBounds();
  }
});

watch(() => props.openRequestId, async (requestId, previousRequestId) => {
  if (!requestId || requestId === previousRequestId) return;
  if (props.visualization) {
    await runNavigation(openInitialContent);
    return;
  }
  if (!props.initialUrl) return;
  address.value = props.initialUrl;
  await navigate();
});

function openInitialContent(): Promise<BrowserState> {
  const api = requireBrowserApi();
  if (props.visualization) {
    return api.browserOpenVisualization(
      props.agentId,
      props.browserId,
      props.visualization.path,
      props.visualization.title,
    );
  }
  address.value = props.initialUrl;
  return api.browserOpen(props.agentId, props.browserId, address.value);
}

async function navigate(): Promise<void> {
  await runNavigation(() => requireBrowserApi().browserNavigate(props.agentId, props.browserId, address.value));
}

async function goBack(): Promise<void> {
  await runNavigation(() => requireBrowserApi().browserGoBack(props.agentId, props.browserId));
}

async function goForward(): Promise<void> {
  await runNavigation(() => requireBrowserApi().browserGoForward(props.agentId, props.browserId));
}

async function reload(): Promise<void> {
  await runNavigation(() => requireBrowserApi().browserReload(props.agentId, props.browserId));
}

async function runNavigation(action: () => Promise<BrowserState>): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    state.value = await action();
    address.value = state.value.url;
  } catch (reason) {
    error.value = messageFor(reason);
  } finally {
    loading.value = false;
  }
}

async function toggleAnnotation(): Promise<void> {
  const enabled = !annotationMode.value;
  annotationMode.value = enabled;
  try {
    const api = requireBrowserApi();
    await api.browserSetAnnotationMode(props.agentId, props.browserId, enabled);
    if (!enabled) {
      annotations.value = [];
      await api.browserClearAnnotations(props.agentId, props.browserId);
    }
  } catch (reason) {
    annotationMode.value = false;
    error.value = messageFor(reason);
  }
}

async function syncBounds(): Promise<void> {
  const element = viewport.value;
  if (!element || loading.value || !props.visible) return;
  const rect = element.getBoundingClientRect();
  const bounds: BrowserBounds = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  await codexClawApi?.browserSetBounds(props.agentId, props.browserId, bounds);
}

function syncBoundsAfterWindowResize(): void {
  requestAnimationFrame(() => void syncBounds());
}

function handleEvent(event: MainToRendererEvent): void {
  if (
    event.type !== 'browser.annotationCreated' ||
    !isBrowserAnnotation(event.payload) ||
    event.payload.agentId !== props.agentId ||
    event.payload.browserId !== props.browserId
  ) return;
  annotations.value = [...annotations.value, event.payload];
  annotationMode.value = true;
  void requireBrowserApi().browserSetAnnotationMode(props.agentId, props.browserId, true).catch((reason) => {
    annotationMode.value = false;
    error.value = messageFor(reason);
  });
}

async function sendAnnotations(): Promise<void> {
  if (annotations.value.length === 0) return;
  emit('send-prompt', annotationBatchPrompt(annotations.value));
  annotations.value = [];
  annotationMode.value = false;
  await requireBrowserApi().browserSetAnnotationMode(props.agentId, props.browserId, false);
  await requireBrowserApi().browserClearAnnotations(props.agentId, props.browserId);
}

async function close(): Promise<void> {
  menuOpen.value = false;
  await codexClawApi?.browserClose(props.agentId, props.browserId);
  emit('close');
}

function requireBrowserApi() {
  if (!codexClawApi) throw new Error('Browser is unavailable.');
  return codexClawApi;
}

function annotationBatchPrompt(annotations: BrowserAnnotation[]): string {
  const entries = annotations.map((annotation, index) => {
    const target = annotation.kind === 'element'
      ? `element ${annotation.selector ?? annotation.label ?? 'selected on the page'}`
      : `selected area at ${Math.round(annotation.rect.x)},${Math.round(annotation.rect.y)} (${Math.round(annotation.rect.width)}×${Math.round(annotation.rect.height)})`;
    return `${index + 1}. Target: ${target}\n   Feedback: ${annotation.comment?.trim() || 'No comment provided.'}`;
  }).join('\n\n');
  return `Browser annotations on ${annotations[0]?.url}\n\n${entries}\n\nInspect the rendered page and make the smallest changes that address every annotation.`;
}

function isBrowserAnnotation(value: unknown): value is BrowserAnnotation {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as BrowserAnnotation).id === 'string' &&
    typeof (value as BrowserAnnotation).agentId === 'string' &&
    typeof (value as BrowserAnnotation).browserId === 'string' &&
    (value as BrowserAnnotation).kind &&
    (value as BrowserAnnotation).rect
  );
}

function messageFor(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Could not load this page.';
}
</script>

<style scoped>
.browser-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--color-shell-main);
}

.browser-panel__toolbar {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  height: 32px;
  min-height: 32px;
  max-height: 32px;
  box-sizing: border-box;
  padding: 0 var(--space-3);
  border-bottom: 1px solid var(--color-outline-subtle);
  background: var(--color-shell-main);
}

.browser-panel__toolbar--visualization {
  grid-template-columns: minmax(0, 1fr) auto;
}

.browser-panel button {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-muted);
}

.browser-panel button:hover:not(:disabled),
.browser-panel button[aria-pressed="true"] {
  background: var(--color-surface-high);
  color: var(--color-text);
}

.browser-panel button:disabled {
  opacity: 0.38;
}

.browser-panel button :deep(svg) {
  width: 15px;
  height: 15px;
  stroke-width: 1.8;
}

.browser-panel__navigation {
  display: flex;
  gap: var(--space-3);
  justify-self: start;
}

.browser-panel__address,
.browser-panel__annotation-title,
.browser-panel__visualization-title {
  width: 100%;
  min-width: 0;
}

.browser-panel__visualization-title {
  overflow: hidden;
  padding: 0 var(--space-4);
  color: var(--color-text-muted);
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.browser-panel__address {
  padding: 0 var(--space-8);
}

.browser-panel__address input {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-16);
  text-align: center;
  outline: none;
  padding: 0 var(--space-3);
}

.browser-panel__address input:focus {
  border-color: var(--color-border);
  background: var(--color-surface-lowest);
}

.browser-panel__annotation-title {
  display: flex;
  justify-content: center;
  gap: var(--space-2);
  color: var(--color-text);
  font-size: var(--font-size-13);
}

.browser-panel__annotation-title span:last-child {
  color: var(--color-text-muted);
}

.browser-panel__actions {
  position: relative;
  display: flex;
  gap: var(--space-3);
  justify-self: end;
}

.browser-panel__annotate[aria-pressed="true"] {
  background: var(--color-primary-container);
  color: var(--color-on-primary-container);
}

.browser-panel__menu {
  position: absolute;
  z-index: 3;
  top: calc(100% + var(--space-3));
  right: 0;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-shell-main);
  box-shadow: var(--shadow-menu);
}

.browser-panel__menu button {
  display: block;
  width: auto;
  height: auto;
  border-radius: var(--radius-sm);
  padding: var(--space-4) var(--space-6);
  color: var(--color-text);
  white-space: nowrap;
}

.browser-panel__surface {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.browser-panel__viewport {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  background: var(--color-surface-low);
}

.browser-panel__loading {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--color-text-muted);
}

.browser-panel__error {
  margin: 0;
  padding: var(--space-4) var(--space-8);
  color: var(--color-error);
  background: var(--color-error-container);
}

@media (max-width: 760px) {
  .browser-panel__toolbar {
    grid-template-columns: 1fr auto;
  }
  .browser-panel__address,
  .browser-panel__annotation-title {
    display: none;
  }
}
</style>
