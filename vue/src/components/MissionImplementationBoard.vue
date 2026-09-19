<template>
  <section
    class="mission-implementation"
    :aria-label="t('missions.implementationBoard')"
  >
    <header class="mission-implementation__summary">
      <div>
        <strong>{{
          t("missions.repositoryCount", { count: lanes.length })
        }}</strong>
        <span v-if="branch"
          ><GitBranchIcon aria-hidden="true" />{{ branch }}</span
        >
      </div>
      <span class="mission-implementation__policy">{{ policyLabel }}</span>
    </header>

    <div class="mission-implementation__lanes">
      <section
        v-for="lane in lanes"
        :key="lane.repositoryPath"
        class="mission-implementation__lane"
      >
        <header>
          <FolderIcon aria-hidden="true" />
          <div>
            <strong>{{ repositoryName(lane.repositoryPath) }}</strong>
            <span>{{ laneProgress(lane.tickets) }}</span>
          </div>
        </header>
        <TransitionGroup name="mission-run-card" tag="ol" appear>
          <li v-for="item in lane.tickets" :key="item.ticket.id ?? item.index">
            <button
              type="button"
              class="mission-implementation__ticket"
              :class="{
                'mission-implementation__ticket--selected':
                  selectedIndex === item.index,
              }"
              :aria-expanded="selectedIndex === item.index"
              @click="selectTicket(item.index, item.run?.workerId)"
            >
              <span class="mission-implementation__ticket-heading">
                <small>{{ ticketNumber(item.index) }}</small>
                <strong>{{ item.ticket.title }}</strong>
                <span :data-status="ticketStatus(item)">{{
                  t(`missions.ticketRunStatus.${ticketStatus(item)}`)
                }}</span>
              </span>
              <span class="mission-implementation__ticket-preview">{{
                ticketPreview(item.ticket)
              }}</span>
            </button>
          </li>
        </TransitionGroup>
      </section>
    </div>

    <article
      v-if="!selected && mission.artifacts.implementation.changes.trim()"
      class="mission-implementation__aggregate"
      :aria-label="t('missions.acceptedArtifact')"
    >
      <h3>{{ t("missions.artifactTitle.implementation") }}</h3>
      <div>
        <strong>{{ t("missions.changes") }}</strong>
        <p>{{ mission.artifacts.implementation.changes }}</p>
      </div>
      <div>
        <strong>{{ t("missions.tests") }}</strong>
        <p>{{ mission.artifacts.implementation.tests }}</p>
      </div>
    </article>

    <article
      v-if="selected"
      class="mission-implementation__details"
      :aria-label="t('missions.implementationTicketDetails')"
    >
      <header>
        <div>
          <small
            >{{ repositoryName(selected.ticket.repositoryPath ?? "") }} ·
            {{ ticketNumber(selected.index) }}</small
          >
          <h3>{{ selected.ticket.title }}</h3>
        </div>
        <button
          type="button"
          :aria-label="t('missions.closeTicketDetails')"
          @click="selectedIndex = -1"
        >
          <X aria-hidden="true" />
        </button>
      </header>
      <MarkdownPanel
        :content="
          selected.ticket.body?.trim() || t('missions.noTicketDescription')
        "
      />
      <section
        v-if="selected.run?.implementationResult"
        class="mission-implementation__evidence"
      >
        <div>
          <strong>{{ t("missions.changes") }}</strong>
          <p>{{ selected.run.implementationResult.changes }}</p>
        </div>
        <div>
          <strong>{{ t("missions.tests") }}</strong>
          <p>{{ selected.run.implementationResult.tests }}</p>
        </div>
      </section>
      <footer>
        <span>{{
          t(`missions.ticketRunStatus.${ticketStatus(selected)}`)
        }}</span>
        <button
          v-if="
            selected.run?.status === 'awaitingReview' &&
            reviewPolicy === 'reviewEachTicket'
          "
          type="button"
          class="claw-button claw-button--primary"
          :disabled="busy"
          @click="emit('approve', selected.run.id)"
        >
          <CheckIcon aria-hidden="true" />{{ t("missions.approveTicket") }}
        </button>
        <button
          v-else-if="selected.run && ['preparing', 'running'].includes(selected.run.status)"
          type="button"
          class="claw-button"
          :disabled="busy"
          @click="emit('stop', selected.run.id)"
        >
          {{ t("missions.stopTicket") }}
        </button>
        <button
          v-else-if="selected.run && ['failed', 'cancelled'].includes(selected.run.status)"
          type="button"
          class="claw-button claw-button--primary"
          :disabled="busy"
          @click="emit('retry', selected.index)"
        >
          {{ t("missions.retryTicket") }}
        </button>
      </footer>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { Mission, MissionTicket } from "@codex-claw/core/missions";
import type { MissionRun } from "@codex-claw/core/mission-execution";
import {
  CheckIcon,
  FolderIcon,
  GitBranchIcon,
  X,
} from "../shared/icons/app-icons";
import MarkdownPanel from "./MarkdownPanel.vue";

type TicketItem = { ticket: MissionTicket; index: number; run?: MissionRun };

const props = defineProps<{ mission: Mission; busy?: boolean }>();
const emit = defineEmits<{
  approve: [runId: string];
  "open-conversation": [agentId: string];
  retry: [ticketIndex: number];
  stop: [runId: string];
}>();
const { t } = useI18n();
const selectedIndex = ref(-1);
const reviewPolicy = computed(
  () => props.mission.execution?.reviewPolicy ?? "reviewEachTicket",
);
const policyLabel = computed(() =>
  t(`missions.reviewPolicy.${reviewPolicy.value}`),
);
const branch = computed(
  () => props.mission.execution?.workspaces?.[0]?.branch ?? "",
);
const implementationRuns = computed(
  () =>
    props.mission.execution?.runs.filter(
      (run) => run.stage === "implementation",
    ) ?? [],
);
const lanes = computed(() => {
  const grouped = new Map<string, TicketItem[]>();
  for (const [index, ticket] of props.mission.artifacts.tickets.entries()) {
    const repositoryPath =
      ticket.repositoryPath ?? t("missions.repositoryUnassigned");
    const runs = implementationRuns.value.filter(
      (run) => run.ticketIndex === index,
    );
    const item = { ticket, index, run: runs.at(-1) };
    const lane = grouped.get(repositoryPath) ?? [];
    lane.push(item);
    grouped.set(repositoryPath, lane);
  }
  return [...grouped.entries()].map(([repositoryPath, tickets]) => ({
    repositoryPath,
    tickets,
  }));
});
const selected = computed(() =>
  lanes.value
    .flatMap((lane) => lane.tickets)
    .find((item) => item.index === selectedIndex.value),
);

function selectTicket(index: number, workerId?: string): void {
  selectedIndex.value = index;
  if (workerId) emit("open-conversation", workerId);
}
function repositoryName(repositoryPath: string): string {
  return (
    repositoryPath.split(/[\\/]/u).filter(Boolean).at(-1) ?? repositoryPath
  );
}
function ticketNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}
function ticketStatus(
  item: TicketItem,
): "queued" | "blocked" | MissionRun["status"] {
  if (item.ticket.done) return "accepted";
  if (item.run) return item.run.status;
  return (item.ticket.dependsOn ?? []).every(
    (index) => props.mission.artifacts.tickets[index]?.done,
  )
    ? "queued"
    : "blocked";
}
function laneProgress(tickets: TicketItem[]): string {
  return t("missions.repositoryProgress", {
    complete: tickets.filter((item) => item.ticket.done).length,
    total: tickets.length,
  });
}
function ticketPreview(ticket: MissionTicket): string {
  return (
    ticket.body
      ?.replace(/```[\s\S]*?```/gu, " ")
      .replace(/[*_~`>|#]/gu, "")
      .replace(/\s+/gu, " ")
      .trim() || t("missions.noTicketDescription")
  );
}
</script>

<style scoped>
.mission-implementation {
  display: grid;
  max-width: 860px;
  gap: var(--space-8);
  margin: var(--space-10) auto 0;
}

.mission-implementation__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  padding: var(--space-6) var(--space-8);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-low);
}

.mission-implementation__summary > div {
  display: grid;
  gap: var(--space-2);
}

.mission-implementation__summary span {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}

.mission-implementation__summary svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.mission-implementation__policy {
  padding: var(--space-2) var(--space-6);
  border-radius: var(--radius-full);
  color: var(--color-on-primary-container) !important;
  background: var(--color-primary-container);
  white-space: nowrap;
}

.mission-implementation__lanes {
  display: grid;
  gap: var(--space-8);
}

.mission-implementation__lane {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface-lowest);
}

.mission-implementation__lane > header {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-6) var(--space-8);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-low);
}

.mission-implementation__lane > header svg {
  width: var(--icon-lg);
  height: var(--icon-lg);
  color: var(--color-primary);
}

.mission-implementation__lane > header div {
  display: grid;
  gap: var(--space-1);
}

.mission-implementation__lane > header span {
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
}

.mission-implementation__lane ol {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: var(--space-6);
  list-style: none;
}

.mission-implementation__ticket {
  display: grid;
  width: 100%;
  gap: var(--space-3);
  padding: var(--space-6);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  color: var(--color-text);
  background: var(--color-surface-lowest);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    transform 160ms ease;
}

.mission-implementation__ticket:hover,
.mission-implementation__ticket:focus-visible {
  border-color: var(--color-border-strong);
  background: var(--color-surface-low);
  transform: translateY(-1px);
}

.mission-implementation__ticket--selected {
  border-color: var(--color-primary);
  background: var(--color-primary-container);
}

.mission-implementation__ticket-heading {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-4);
}

.mission-implementation__ticket-heading small {
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
  font-weight: var(--font-weight-semibold);
}

.mission-implementation__ticket-heading strong {
  overflow: hidden;
  font-size: var(--font-size-14);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mission-implementation__ticket-heading > span {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: var(--color-surface-high);
  font-size: var(--font-size-11);
  white-space: nowrap;
}

.mission-implementation__ticket-heading > span[data-status="running"],
.mission-implementation__ticket-heading > span[data-status="preparing"] {
  color: var(--color-on-primary-container);
  background: var(--color-primary-container);
}

.mission-implementation__ticket-heading > span[data-status="awaitingReview"] {
  color: var(--color-on-warning-container);
  background: var(--color-warning-container);
}

.mission-implementation__ticket-heading > span[data-status="accepted"] {
  color: var(--color-on-success-container);
  background: var(--color-success-container);
}

.mission-implementation__ticket-heading > span[data-status="failed"],
.mission-implementation__ticket-heading > span[data-status="cancelled"] {
  color: var(--color-on-error-container);
  background: var(--color-error-container);
}

.mission-implementation__ticket-preview {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mission-implementation__details {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-md);
}

.mission-implementation__aggregate {
  display: grid;
  gap: var(--space-6);
  padding: var(--space-8);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface-lowest);
}

.mission-implementation__aggregate h3,
.mission-implementation__aggregate p {
  margin: 0;
}

.mission-implementation__aggregate h3 {
  font-size: var(--font-size-16);
}

.mission-implementation__aggregate div {
  display: grid;
  gap: var(--space-2);
}

.mission-implementation__aggregate p {
  color: var(--color-text-muted);
  line-height: var(--line-height-20);
  white-space: pre-wrap;
}

.mission-implementation__details > header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-6);
  padding: var(--space-8);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-low);
}

.mission-implementation__details > header div {
  display: grid;
  flex: 1;
  gap: var(--space-1);
}

.mission-implementation__details h3,
.mission-implementation__details p {
  margin: 0;
}

.mission-implementation__details h3 {
  font-size: var(--font-size-18);
}

.mission-implementation__details header small {
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
}

.mission-implementation__details header button {
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

.mission-implementation__details header button:hover {
  background: var(--color-surface-high);
}

.mission-implementation__details header svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.mission-implementation__details :deep(.markdown-panel) {
  max-height: none;
  padding: var(--space-8);
  overflow: visible;
}

.mission-implementation__evidence {
  display: grid;
  gap: var(--space-6);
  padding: var(--space-8);
  border-top: 1px solid var(--color-border);
}

.mission-implementation__evidence div {
  display: grid;
  gap: var(--space-2);
}

.mission-implementation__evidence p {
  color: var(--color-text-muted);
  line-height: var(--line-height-20);
  white-space: pre-wrap;
}

.mission-implementation__details > footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  padding: var(--space-6) var(--space-8);
  border-top: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}

.mission-implementation__details > footer button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.mission-implementation__details > footer svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.mission-run-card-enter-active,
.mission-run-card-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}

.mission-run-card-enter-from,
.mission-run-card-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (prefers-reduced-motion: reduce) {
  .mission-implementation__ticket,
  .mission-run-card-enter-active,
  .mission-run-card-leave-active {
    transition-duration: 1ms;
  }
}
</style>
