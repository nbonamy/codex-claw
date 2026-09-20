<template>
  <section
    class="mission-implementation"
    :aria-label="t('missions.implementationBoard')"
  >
    <header class="mission-implementation__summary">
      <div class="mission-implementation__summary-copy">
        <strong>{{ t("missions.executionBoard") }}</strong>
        <span>{{
          t("missions.executionProgress", {
            complete: completeCount,
            total: ticketItems.length,
          })
        }}</span>
      </div>
      <div
        class="mission-implementation__summary-statuses"
        :aria-label="t('missions.executionStatusSummary')"
      >
        <span v-if="activeCount" data-state="active">{{
          t("missions.activeTicketCount", { count: activeCount })
        }}</span>
        <span v-if="reviewCount" data-state="review">{{
          t("missions.reviewTicketCount", { count: reviewCount })
        }}</span>
        <span data-state="complete">{{
          t("missions.completeTicketCount", { count: completeCount })
        }}</span>
      </div>
      <div
        class="mission-implementation__progress"
        role="progressbar"
        :aria-valuenow="completeCount"
        aria-valuemin="0"
        :aria-valuemax="ticketItems.length"
      >
        <span :style="{ width: `${completionPercent}%` }" />
      </div>
      <div class="mission-implementation__summary-meta">
        <span>{{ t("missions.repositoryCount", { count: lanes.length }) }}</span>
        <span v-if="branch"
          ><GitBranchIcon aria-hidden="true" />{{ branch }}</span
        >
        <span>{{ policyLabel }}</span>
      </div>
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
              :aria-current="
                selectedIndex === item.index ? 'true' : undefined
              "
              :aria-label="
                item.run?.workerId
                  ? t('missions.openTicketThread', {
                      title: item.ticket.title,
                    })
                  : t('missions.openTicketDetails', {
                      title: item.ticket.title,
                    })
              "
              @click="selectTicket(item.index, item.run?.workerId)"
            >
              <span class="mission-implementation__ticket-heading">
                <small>{{ ticketNumber(item.index) }}</small>
                <span :data-status="ticketStatus(item)">{{
                  t(`missions.ticketRunStatus.${ticketStatus(item)}`)
                }}</span>
              </span>
              <strong class="mission-implementation__ticket-title">{{
                item.ticket.title
              }}</strong>
              <span class="mission-implementation__ticket-preview">{{
                ticketPreview(item.ticket)
              }}</span>
              <span class="mission-implementation__ticket-footer">
                <span
                  v-if="item.ticket.dependsOn?.length"
                  class="mission-implementation__dependencies"
                >
                  {{
                    t("missions.blockedByShort", {
                      tickets: item.ticket.dependsOn
                        .map(ticketNumber)
                        .join(", "),
                    })
                  }}
                </span>
                <span v-else class="mission-implementation__repository">{{
                  repositoryName(lane.repositoryPath)
                }}</span>
                <span
                  v-if="assignedAgent(item)"
                  class="mission-implementation__agent"
                >
                  <MessageCircleIcon aria-hidden="true" />{{
                    assignedAgent(item)
                  }}
                </span>
                <ChevronRightIcon aria-hidden="true" />
              </span>
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
            !readOnly &&
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
          v-else-if="!readOnly && selected.run && ['preparing', 'running'].includes(selected.run.status)"
          type="button"
          class="claw-button"
          :disabled="busy"
          @click="emit('stop', selected.run.id)"
        >
          {{ t("missions.stopTicket") }}
        </button>
        <button
          v-else-if="!readOnly && selected.run && ['failed', 'cancelled'].includes(selected.run.status)"
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
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { agentDisplayName } from "@codex-claw/core/agent-display";
import type { Agent } from "@codex-claw/core/contracts";
import type { Mission, MissionTicket } from "@codex-claw/core/missions";
import type { MissionRun } from "@codex-claw/core/mission-execution";
import {
  CheckIcon,
  ChevronRightIcon,
  FolderIcon,
  GitBranchIcon,
  MessageCircleIcon,
  X,
} from "../shared/icons/app-icons";
import MarkdownPanel from "./MarkdownPanel.vue";

type TicketItem = { ticket: MissionTicket; index: number; run?: MissionRun };

const props = withDefaults(
  defineProps<{ agents?: Agent[]; mission: Mission; busy?: boolean; readOnly?: boolean }>(),
  { agents: () => [] },
);
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
const ticketItems = computed(() =>
  lanes.value.flatMap((lane) => lane.tickets),
);
const selected = computed(() =>
  ticketItems.value.find((item) => item.index === selectedIndex.value),
);
const completeCount = computed(
  () =>
    ticketItems.value.filter((item) => ticketStatus(item) === "accepted")
      .length,
);
const activeCount = computed(
  () =>
    ticketItems.value.filter((item) =>
      ["preparing", "running"].includes(ticketStatus(item)),
    ).length,
);
const reviewCount = computed(
  () =>
    ticketItems.value.filter(
      (item) => ticketStatus(item) === "awaitingReview",
    ).length,
);
const completionPercent = computed(() =>
  ticketItems.value.length
    ? Math.round((completeCount.value / ticketItems.value.length) * 100)
    : 0,
);

watch(ticketItems, () => {
  if (selectedIndex.value >= 0 && !selected.value) selectedIndex.value = -1;
});

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
function assignedAgent(item: TicketItem): string {
  const agent =
    props.agents.find((agent) => agent.id === item.run?.workerId) ??
    props.agents.find((agent) => agent.id === item.run?.memberId);
  return agent ? agentDisplayName(agent) : "";
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--space-4) var(--space-8);
  padding: var(--space-6) var(--space-8);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-sm);
}

.mission-implementation__summary-copy {
  display: grid;
  gap: var(--space-1);
}

.mission-implementation__summary-copy span,
.mission-implementation__summary-meta span {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}

.mission-implementation__summary-meta svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.mission-implementation__summary-statuses {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

.mission-implementation__summary-statuses span {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: var(--color-surface-high);
  font-size: var(--font-size-11);
  white-space: nowrap;
}

.mission-implementation__summary-statuses span[data-state="active"] {
  color: var(--color-on-primary-container);
  background: var(--color-primary-container);
}

.mission-implementation__summary-statuses span[data-state="review"] {
  color: var(--color-on-warning-container);
  background: var(--color-warning-container);
}

.mission-implementation__summary-statuses span[data-state="complete"] {
  color: var(--color-on-success-container);
  background: var(--color-success-container);
}

.mission-implementation__progress {
  height: 5px;
  grid-column: 1 / -1;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: var(--color-surface-high);
}

.mission-implementation__progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-success);
  transition: width 220ms ease;
}

.mission-implementation__summary-meta {
  display: flex;
  grid-column: 1 / -1;
  flex-wrap: wrap;
  gap: var(--space-6);
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
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: var(--space-6);
  list-style: none;
}

.mission-implementation__ticket {
  display: grid;
  width: 100%;
  min-height: 164px;
  grid-template-rows: auto auto 1fr auto;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.mission-implementation__ticket-heading small {
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
  font-weight: var(--font-weight-semibold);
}

.mission-implementation__ticket-title {
  display: -webkit-box;
  overflow: hidden;
  font-size: var(--font-size-14);
  line-height: var(--line-height-20);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
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
  display: -webkit-box;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  line-height: var(--line-height-18);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.mission-implementation__ticket-footer {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
}

.mission-implementation__ticket-footer > span:first-child {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mission-implementation__ticket-footer > svg,
.mission-implementation__agent svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.mission-implementation__agent {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
  overflow: hidden;
  color: var(--color-text);
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
  .mission-implementation__progress span,
  .mission-run-card-enter-active,
  .mission-run-card-leave-active {
    transition-duration: 1ms;
  }
}
</style>
