<template>
  <div class="mission-ticket-board">
    <TransitionGroup
      name="mission-ticket-card"
      tag="ol"
      class="mission-ticket-board__list"
      appear
    >
      <li
        v-for="(ticket, index) in tickets"
        :key="ticketKey(ticket, index)"
        class="mission-ticket-board__item"
      >
        <button
          :ref="(element) => setCardRef(ticketKey(ticket, index), element)"
          type="button"
          class="mission-ticket-board__card"
          :class="{
            'mission-ticket-board__card--selected':
              selectedKey === ticketKey(ticket, index),
          }"
          :aria-label="t('missions.openTicketDetails', { title: ticket.title })"
          :aria-expanded="selectedKey === ticketKey(ticket, index)"
          :aria-controls="
            selectedKey === ticketKey(ticket, index)
              ? 'mission-ticket-details'
              : undefined
          "
          @click="selectTicket(ticketKey(ticket, index))"
        >
          <span class="mission-ticket-board__summary">
            <span class="mission-ticket-board__heading">
              <span class="mission-ticket-board__number">{{
                ticketNumber(index)
              }}</span>
              <strong>{{ ticket.title }}</strong>
            </span>
            <span class="mission-ticket-board__preview">{{
              ticketPreview(ticket)
            }}</span>
          </span>
          <span class="mission-ticket-board__card-footer">
            <small v-if="ticket.dependsOn?.length">
              {{
                t("missions.blockedByShort", {
                  tickets: ticket.dependsOn
                    .map((dependency) => ticketNumber(dependency))
                    .join(", "),
                })
              }}
            </small>
            <small v-else>{{
              t(
                ticket.done
                  ? "missions.ticketComplete"
                  : "missions.ticketReady",
              )
            }}</small>
            <span
              v-if="ticketCommentCount(ticketKey(ticket, index))"
              class="mission-ticket-board__comment-count"
            >{{ t('missions.ticketCommentCount', { count: ticketCommentCount(ticketKey(ticket, index)) }) }}</span>
            <span v-if="ticket.repositoryPath" class="mission-ticket-board__repository">{{ repositoryName(ticket.repositoryPath) }}</span>
            <ChevronRightIcon aria-hidden="true" />
          </span>
        </button>
      </li>
    </TransitionGroup>

    <footer v-if="comments.length" class="mission-ticket-board__review-bar">
      <span>{{ ticketCommentSummary }}</span>
      <AnnotationSendButton
        :count="comments.length"
        :disabled="disabled"
        :label="t('missions.sendTicketComments', comments.length)"
        @click="emit('sendComments', comments)"
      />
    </footer>

    <el-dialog
      class="claw-dialog mission-ticket-dialog"
      :model-value="Boolean(selectedTicket)"
      :show-close="false"
      :close-on-click-modal="false"
      :close-on-press-escape="!activeTarget"
      destroy-on-close
      width="min(720px, calc(100vw - 48px))"
      @update:model-value="onDialogVisibilityChanged"
    >
      <template #header>
        <div v-if="selectedTicket" class="mission-ticket-dialog__header">
          <span class="mission-ticket-board__number">{{
            ticketNumber(selectedTicket.index)
          }}</span>
          <div>
            <small>{{ t("missions.ticketDetails") }}</small>
            <h3>{{ selectedTicket.ticket.title }}</h3>
          </div>
          <button
            type="button"
            class="mission-ticket-board__close"
            :aria-label="t('missions.closeTicketDetails')"
            @click="closeDetails"
          >
            <X aria-hidden="true" />
          </button>
        </div>
      </template>

      <article
        v-if="selectedTicket"
        id="mission-ticket-details"
        class="mission-ticket-dialog__body"
        :aria-label="t('missions.ticketDetails')"
      >
        <div class="mission-ticket-dialog__document" @mouseup="captureSelection">
          <MarkdownPanel
            :content="selectedTicket.ticket.body?.trim() || t('missions.noTicketDescription')"
          />
          <AnnotationPopup
            v-if="activeTarget"
            :anchor="activeTarget.anchor"
            :description="activeTarget.quote"
            :initial-value="activeTarget.initialValue"
            :label="t('missions.ticketCommentLabel')"
            :placement="activeTarget.placement"
            :placeholder="t('missions.ticketCommentPlaceholder')"
            strategy="fixed"
            :submit-label="t('missions.saveTicketComment')"
            :width="activeTarget.width"
            @cancel="cancelComment"
            @submit="saveComment"
          />
        </div>

        <div
          v-if="selectedTicket.ticket.repositoryPath || selectedTicket.ticket.dependsOn?.length || selectedTicket.ticket.reference"
          class="mission-ticket-dialog__metadata"
        >
          <span v-if="selectedTicket.ticket.repositoryPath">
            {{ t("missions.repository") }}: {{ selectedTicket.ticket.repositoryPath }}
          </span>
          <span v-if="selectedTicket.ticket.dependsOn?.length">
            {{ t("missions.blockedBy") }}:
            {{ selectedTicket.ticket.dependsOn.map((dependency) => ticketNumber(dependency)).join(", ") }}
          </span>
          <a v-if="selectedTicket.ticket.reference" :href="selectedTicket.ticket.reference" target="_blank" rel="noreferrer">
            {{ t("missions.canonicalReference") }}
            <ExternalLinkIcon aria-hidden="true" />
          </a>
        </div>

        <section v-if="selectedTicketComments.length" class="mission-ticket-dialog__comments" :aria-label="t('missions.ticketComments')">
          <article v-for="comment in selectedTicketComments" :key="comment.id" class="mission-ticket-dialog__comment">
            <button type="button" :aria-label="t('missions.editTicketComment')" :disabled="disabled" @click="editComment(comment)">
              <span>{{ oneLine(comment.quote) }}</span>
              <small>{{ oneLine(comment.body) }}</small>
            </button>
            <button type="button" class="mission-ticket-dialog__comment-remove" :aria-label="t('missions.removeTicketComment')" :disabled="disabled" @click="removeComment(comment.id)">
              <Trash2Icon aria-hidden="true" />
            </button>
          </article>
        </section>
      </article>

      <template v-if="annotatable || comments.length" #footer>
        <div class="mission-ticket-dialog__footer">
          <span>{{ annotatable ? (comments.length ? ticketCommentSummary : t('missions.ticketCommentHelp')) : '' }}</span>
          <AnnotationSendButton
            v-if="comments.length"
            :count="comments.length"
            :disabled="disabled"
            :label="t('missions.sendTicketComments', comments.length)"
            @click="emit('sendComments', comments)"
          />
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
  watch,
  type ComponentPublicInstance,
} from "vue";
import { useI18n } from "vue-i18n";
import type { MissionTicket } from "@codex-claw/core/missions";
import {
  ChevronRightIcon,
  ExternalLinkIcon,
  Trash2Icon,
  X,
} from "../shared/icons/app-icons";
import AnnotationPopup, { type AnnotationPopupAnchor } from "./AnnotationPopup.vue";
import AnnotationSendButton from "./AnnotationSendButton.vue";
import MarkdownPanel from "./MarkdownPanel.vue";

export type MissionTicketComment = {
  body: string;
  id: string;
  quote: string;
  ticketKey: string;
  ticketNumber: string;
  ticketTitle: string;
};

const props = withDefaults(defineProps<{
  annotatable?: boolean;
  disabled?: boolean;
  resetKey?: number;
  tickets: readonly MissionTicket[];
}>(), { annotatable: false, disabled: false, resetKey: 0 });
const emit = defineEmits<{ sendComments: [comments: MissionTicketComment[]] }>();
const { t } = useI18n();
const selectedKey = ref("");
const cardRefs = new Map<string, HTMLButtonElement>();
const comments = ref<MissionTicketComment[]>([]);
const activeTarget = ref<{
  anchor: AnnotationPopupAnchor;
  initialValue: string;
  placement: "above" | "below";
  quote: string;
  ticketKey: string;
  ticketNumber: string;
  ticketTitle: string;
  width?: number;
} | null>(null);
const editingId = ref<string | null>(null);
let commentId = 0;
const selectedTicket = computed(() => {
  const index = props.tickets.findIndex(
    (ticket, ticketIndex) =>
      ticketKey(ticket, ticketIndex) === selectedKey.value,
  );
  return index < 0 ? undefined : { ticket: props.tickets[index]!, index };
});
const selectedTicketComments = computed(() => comments.value.filter(comment => comment.ticketKey === selectedKey.value));
const ticketCommentSummary = computed(() => {
  const ticketCount = new Set(comments.value.map(comment => comment.ticketKey)).size;
  return ticketCount === 1
    ? t('missions.ticketCommentSummarySingle', comments.value.length)
    : t('missions.ticketCommentSummary', { comments: comments.value.length, tickets: ticketCount });
});

watch(
  () => props.tickets,
  () => {
    if (selectedKey.value && !selectedTicket.value) selectedKey.value = "";
    const validKeys = new Set(props.tickets.map(ticketKey));
    comments.value = comments.value.filter(comment => validKeys.has(comment.ticketKey));
  },
  { deep: true },
);
watch(() => props.resetKey, () => {
  comments.value = [];
  cancelComment();
});

function ticketKey(ticket: MissionTicket, index: number): string {
  return ticket.id ?? `ticket-${index}-${ticket.title}`;
}

function ticketNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

function ticketPreview(ticket: MissionTicket): string {
  const body = ticket.body?.replace(/```[\s\S]*?```/g, " ") ?? "";
  const whatToBuild = body.match(/(?:^|\n)\s*(?:#{1,6}\s+)?(?:\*\*)?What to build(?:\*\*)?\s*:?\s*([\s\S]*)/iu)?.[1];
  const previewSource = (whatToBuild ?? body).split(/\n\s*(?:#{1,6}\s+)?(?:\*\*)?(?:Acceptance criteria|Verification|Dependencies)(?:\*\*)?\s*:?\s*/iu)[0] ?? "";
  const plainText = previewSource
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+.*$/gm, " ")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[*_~`>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plainText || t("missions.noTicketDescription");
}

function repositoryName(repositoryPath: string): string {
  return repositoryPath.split(/[\\/]/u).filter(Boolean).at(-1) ?? repositoryPath;
}

function setCardRef(
  key: string,
  element: Element | ComponentPublicInstance | null,
): void {
  if (element instanceof HTMLButtonElement) cardRefs.set(key, element);
  else cardRefs.delete(key);
}

function selectTicket(key: string): void {
  cancelComment();
  selectedKey.value = key;
}

async function closeDetails(): Promise<void> {
  const key = selectedKey.value;
  cancelComment();
  selectedKey.value = "";
  await nextTick();
  cardRefs.get(key)?.focus();
}

function onDialogVisibilityChanged(visible: boolean): void {
  if (!visible) void closeDetails();
}

function ticketCommentCount(key: string): number {
  return comments.value.filter(comment => comment.ticketKey === key).length;
}

function captureSelection(event: MouseEvent): void {
  if (!props.annotatable || props.disabled || !selectedTicket.value) return;
  const selection = window.getSelection?.();
  const quote = selection?.toString().trim() ?? "";
  if (!selection || !quote || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  const documentElement = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  if (!documentElement?.contains(range.commonAncestorContainer)) return;
  const rangeRect = range.getBoundingClientRect();
  activeTarget.value = {
    quote: quote.length > 180 ? `${quote.slice(0, 177)}...` : quote,
    initialValue: "",
    placement: "below",
    ticketKey: selectedKey.value,
    ticketNumber: ticketNumber(selectedTicket.value.index),
    ticketTitle: selectedTicket.value.ticket.title,
    anchor: {
      x: Math.min(Math.max(12, rangeRect.left), Math.max(12, window.innerWidth - 332)),
      y: Math.max(12, rangeRect.top),
      width: rangeRect.width,
      height: rangeRect.height,
    },
  };
}

function saveComment(body: string): void {
  const target = activeTarget.value;
  if (!target) return;
  commentId += 1;
  const next: MissionTicketComment = {
    id: editingId.value ?? `ticket-comment-${commentId}`,
    body,
    quote: target.quote,
    ticketKey: target.ticketKey,
    ticketNumber: target.ticketNumber,
    ticketTitle: target.ticketTitle,
  };
  comments.value = editingId.value
    ? comments.value.map(comment => comment.id === editingId.value ? next : comment)
    : [...comments.value, next];
  cancelComment();
  window.getSelection?.()?.removeAllRanges();
}

function editComment(comment: MissionTicketComment): void {
  if (props.disabled) return;
  const dialog = document.querySelector<HTMLElement>(".mission-ticket-dialog .el-dialog__footer");
  const dialogRect = dialog?.getBoundingClientRect();
  editingId.value = comment.id;
  activeTarget.value = {
    ...comment,
    initialValue: comment.body,
    placement: "above",
    ...(dialogRect && dialogRect.width > 24 ? { width: dialogRect.width - 24 } : {}),
    anchor: {
      x: (dialogRect?.left ?? 0) + 12,
      y: dialogRect?.top ?? 72,
      width: 0,
      height: 0,
    },
  };
}

function removeComment(id: string): void {
  if (props.disabled) return;
  comments.value = comments.value.filter(comment => comment.id !== id);
  if (editingId.value === id) cancelComment();
}

function cancelComment(): void {
  activeTarget.value = null;
  editingId.value = null;
}

function oneLine(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}
</script>

<style scoped>
.mission-ticket-board {
  display: grid;
  gap: var(--space-10);
}

.mission-ticket-board__list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-6);
  margin: 0;
  padding: 0;
  list-style: none;
}

.mission-ticket-board__item {
  min-width: 0;
}

.mission-ticket-board__card {
  display: grid;
  width: 100%;
  height: 196px;
  grid-template-rows: 1fr auto;
  gap: var(--space-4);
  padding: var(--space-8);
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  color: var(--color-text);
  background: var(--color-surface-lowest);
  text-align: left;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease,
    background 160ms ease;
}

.mission-ticket-board__card:hover {
  border-color: var(--color-border-strong);
  background: var(--color-surface-low);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.mission-ticket-board__card:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.mission-ticket-board__card--selected {
  border-color: var(--color-primary);
  background: var(--color-primary-container);
  box-shadow: var(--shadow-md);
}

.mission-ticket-board__number {
  display: inline-grid;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  place-items: center;
  border-radius: var(--radius-md);
  color: var(--color-on-primary-container);
  background: var(--color-primary-container);
  font-size: var(--font-size-11);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.04em;
}

.mission-ticket-board__card--selected .mission-ticket-board__number {
  color: var(--color-on-primary);
  background: var(--color-primary);
}

.mission-ticket-board__summary {
  display: grid;
  min-height: 0;
  align-content: start;
  gap: var(--space-4);
}

.mission-ticket-board__heading {
  display: grid;
  min-width: 0;
  grid-template-columns: auto 1fr;
  align-items: start;
  gap: var(--space-4);
}

.mission-ticket-board__heading strong {
  display: -webkit-box;
  overflow: hidden;
  font-size: var(--font-size-16);
  line-height: var(--line-height-22);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.mission-ticket-board__preview {
  display: -webkit-box;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.mission-ticket-board__card-footer {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
  color: var(--color-text-muted);
}

.mission-ticket-board__card-footer small {
  overflow: hidden;
  font-size: var(--font-size-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mission-ticket-board__repository {
  max-width: 42%;
  margin-left: auto;
  overflow: hidden;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  color: var(--color-on-primary-container);
  background: var(--color-primary-container);
  font-size: var(--font-size-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mission-ticket-board__comment-count {
  flex: 0 0 auto;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  color: var(--color-on-warning-container);
  background: var(--color-warning-container);
  font-size: var(--font-size-11);
  white-space: nowrap;
}

.mission-ticket-board__card-footer svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
  flex: 0 0 auto;
  transition: transform 160ms ease;
}

.mission-ticket-board__card:hover .mission-ticket-board__card-footer svg,
.mission-ticket-board__card--selected .mission-ticket-board__card-footer svg {
  transform: translateX(3px);
}

.mission-ticket-board__review-bar,
.mission-ticket-dialog__footer {
  --annotation-send-button-height: var(--space-16);
  display: flex;
  min-height: 52px;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-6);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}

.mission-ticket-board__review-bar {
  position: sticky;
  bottom: 0;
  z-index: 2;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-md);
}

:global(.mission-ticket-dialog.el-dialog) {
  display: grid;
  max-height: min(82vh, 780px);
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
}

:global(.mission-ticket-dialog.el-dialog > .el-dialog__header) {
  margin: 0;
  padding: 0;
}

:global(.mission-ticket-dialog.el-dialog > .el-dialog__body) {
  min-height: 0;
  padding: 0;
  overflow: auto;
}

:global(.mission-ticket-dialog.el-dialog > .el-dialog__footer) {
  padding: 0;
  border-top: 1px solid var(--color-border);
}

.mission-ticket-dialog__header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: var(--space-6);
  padding: var(--space-8);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-low);
}

.mission-ticket-dialog__header > div {
  display: grid;
  gap: var(--space-1);
}

.mission-ticket-dialog__header h3 {
  margin: 0;
  font-size: var(--font-size-18);
  line-height: var(--line-height-24);
}

.mission-ticket-dialog__header small {
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.mission-ticket-dialog__body {
  min-height: 0;
}

.mission-ticket-dialog__document :deep(.markdown-panel) {
  max-height: none;
  padding: var(--space-10);
  overflow: visible;
}

.mission-ticket-dialog__metadata {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  padding: var(--space-6) var(--space-8);
  border-top: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}

.mission-ticket-dialog__metadata a {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-primary);
  text-decoration: none;
}

.mission-ticket-dialog__metadata a:hover {
  text-decoration: underline;
}

.mission-ticket-dialog__metadata svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.mission-ticket-dialog__comments {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-6) var(--space-8);
  border-top: 1px solid var(--color-border);
  background: var(--color-surface-low);
}

.mission-ticket-dialog__comment {
  display: flex;
  min-width: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-primary) 20%, var(--color-border));
  border-radius: var(--radius-md);
  background: var(--color-surface-lowest);
}

.mission-ticket-dialog__comment > button:first-child {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 1px;
  padding: var(--space-3) var(--space-4);
  overflow: hidden;
  border: 0;
  color: var(--color-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.mission-ticket-dialog__comment span,
.mission-ticket-dialog__comment small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mission-ticket-dialog__comment span {
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-semibold);
}

.mission-ticket-dialog__comment small {
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
}

.mission-ticket-dialog__comment-remove {
  display: grid;
  width: 34px;
  flex: 0 0 34px;
  place-items: center;
  border: 0;
  border-left: 1px solid var(--color-border);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.mission-ticket-dialog__comment-remove svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.mission-ticket-dialog__comment button:disabled {
  opacity: 0.5;
  cursor: default;
}

.mission-ticket-board__close {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.mission-ticket-board__close:hover,
.mission-ticket-board__close:focus-visible {
  color: var(--color-text);
  background: var(--color-surface-high);
}

.mission-ticket-board__close svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.mission-ticket-card-enter-active {
  transition:
    opacity 220ms ease,
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.mission-ticket-card-leave-active {
  position: absolute;
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.mission-ticket-card-move {
  transition: transform 220ms ease;
}

.mission-ticket-card-enter-from,
.mission-ticket-card-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

@media (max-width: 700px) {
  .mission-ticket-board__list {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mission-ticket-board__card,
  .mission-ticket-board__card-footer svg,
  .mission-ticket-card-enter-active,
  .mission-ticket-card-leave-active,
  .mission-ticket-card-move {
    transition-duration: 1ms;
    transition-delay: 0ms;
  }
}
</style>
