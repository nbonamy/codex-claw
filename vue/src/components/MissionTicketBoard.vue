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
            <ChevronRightIcon aria-hidden="true" />
          </span>
        </button>
      </li>
    </TransitionGroup>

    <Transition name="mission-ticket-details" mode="out-in">
      <article
        v-if="selectedTicket"
        id="mission-ticket-details"
        :key="selectedKey"
        class="mission-ticket-board__details"
        :aria-label="t('missions.ticketDetails')"
      >
        <header>
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
        </header>
        <MarkdownPanel
          :content="
            selectedTicket.ticket.body?.trim() ||
            t('missions.noTicketDescription')
          "
        />
        <footer
          v-if="
            selectedTicket.ticket.dependsOn?.length ||
            selectedTicket.ticket.reference
          "
        >
          <span v-if="selectedTicket.ticket.dependsOn?.length">
            {{ t("missions.blockedBy") }}:
            {{
              selectedTicket.ticket.dependsOn
                .map((dependency) => ticketNumber(dependency))
                .join(", ")
            }}
          </span>
          <a
            v-if="selectedTicket.ticket.reference"
            :href="selectedTicket.ticket.reference"
            target="_blank"
            rel="noreferrer"
          >
            {{ t("missions.canonicalReference") }}
            <ExternalLinkIcon aria-hidden="true" />
          </a>
        </footer>
      </article>
    </Transition>
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
  X,
} from "../shared/icons/app-icons";
import MarkdownPanel from "./MarkdownPanel.vue";

const props = defineProps<{ tickets: readonly MissionTicket[] }>();
const { t } = useI18n();
const selectedKey = ref("");
const cardRefs = new Map<string, HTMLButtonElement>();
const selectedTicket = computed(() => {
  const index = props.tickets.findIndex(
    (ticket, ticketIndex) =>
      ticketKey(ticket, ticketIndex) === selectedKey.value,
  );
  return index < 0 ? undefined : { ticket: props.tickets[index]!, index };
});

watch(
  () => props.tickets,
  () => {
    if (selectedKey.value && !selectedTicket.value) selectedKey.value = "";
  },
  { deep: true },
);

function ticketKey(ticket: MissionTicket, index: number): string {
  return ticket.id ?? `ticket-${index}-${ticket.title}`;
}

function ticketNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

function ticketPreview(ticket: MissionTicket): string {
  const plainText = ticket.body
    ?.replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+.*$/gm, " ")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[*_~`>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plainText || t("missions.noTicketDescription");
}

function setCardRef(
  key: string,
  element: Element | ComponentPublicInstance | null,
): void {
  if (element instanceof HTMLButtonElement) cardRefs.set(key, element);
  else cardRefs.delete(key);
}

function selectTicket(key: string): void {
  selectedKey.value = key;
}

async function closeDetails(): Promise<void> {
  const key = selectedKey.value;
  selectedKey.value = "";
  await nextTick();
  cardRefs.get(key)?.focus();
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
  line-height: var(--line-height-20);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
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

.mission-ticket-board__details {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-md);
}

.mission-ticket-board__details > header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: var(--space-6);
  padding: var(--space-8);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-low);
}

.mission-ticket-board__details header > div {
  display: grid;
  gap: var(--space-1);
}

.mission-ticket-board__details h3 {
  margin: 0;
  font-size: var(--font-size-18);
  line-height: var(--line-height-24);
}

.mission-ticket-board__details header small {
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.mission-ticket-board__details :deep(.markdown-panel) {
  max-height: none;
  padding: var(--space-10);
  overflow: visible;
}

.mission-ticket-board__details > footer {
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

.mission-ticket-board__details > footer a {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-primary);
  text-decoration: none;
}

.mission-ticket-board__details > footer a:hover {
  text-decoration: underline;
}

.mission-ticket-board__details > footer svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
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

.mission-ticket-details-enter-active,
.mission-ticket-details-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.mission-ticket-details-enter-from,
.mission-ticket-details-leave-to {
  opacity: 0;
  transform: translateY(-6px);
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
  .mission-ticket-card-move,
  .mission-ticket-details-enter-active,
  .mission-ticket-details-leave-active {
    transition-duration: 1ms;
    transition-delay: 0ms;
  }
}
</style>
