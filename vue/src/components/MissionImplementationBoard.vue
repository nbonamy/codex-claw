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
        <span>{{ policyLabel }}</span>
        <button
          v-if="hasImplementationEvidence"
          type="button"
          class="mission-implementation__view-evidence"
          :aria-label="t('missions.viewImplementationEvidence')"
          @click="evidenceOpen = true"
        >
          <FileTextIcon aria-hidden="true" />{{ t("missions.viewEvidence") }}
        </button>
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
          <span
            v-if="workspaceBranch(lane.repositoryPath)"
            class="mission-implementation__workspace"
          >
            <GitBranchIcon aria-hidden="true" />{{
              workspaceBranch(lane.repositoryPath)
            }}
          </span>
        </header>
        <TransitionGroup name="mission-run-card" tag="ol" appear>
          <MissionImplementationTicketCard
            v-for="item in lane.tickets"
            :key="item.ticket.id ?? item.index"
            :all-tickets="mission.artifacts.tickets"
            :item="item"
            :repository-path="lane.repositoryPath"
            :selected="selectedIndex === item.index"
            @open-conversation="openConversation"
            @open-details="selectedIndex = item.index"
          />
        </TransitionGroup>
      </section>
    </div>

    <el-dialog
      v-if="hasImplementationEvidence"
      class="claw-dialog mission-implementation__evidence-dialog"
      :model-value="evidenceOpen"
      :show-close="false"
      destroy-on-close
      width="min(720px, calc(100vw - 48px))"
      @update:model-value="evidenceOpen = $event"
    >
      <template #header>
        <div class="mission-implementation__evidence-header">
          <span><FileTextIcon aria-hidden="true" /></span>
          <div>
            <small>{{ t("missions.implementation") }}</small>
            <h3>{{ t("missions.artifactTitle.implementation") }}</h3>
          </div>
          <button
            type="button"
            :aria-label="t('common.close')"
            @click="evidenceOpen = false"
          >
            <X aria-hidden="true" />
          </button>
        </div>
      </template>
      <article class="mission-implementation__aggregate" :aria-label="t('missions.acceptedArtifact')">
        <div>
          <strong>{{ t("missions.changes") }}</strong>
          <p>{{ mission.artifacts.implementation.changes }}</p>
        </div>
        <div>
          <strong>{{ t("missions.tests") }}</strong>
          <p>{{ mission.artifacts.implementation.tests }}</p>
        </div>
      </article>
    </el-dialog>

    <MissionTicketDialog
      :model-value="Boolean(selected)"
      :ticket="selected?.ticket"
      :ticket-key="selected?.ticket.id ?? ''"
      :ticket-number="selected ? ticketNumber(selected.index) : ''"
      @close="selectedIndex = -1"
    >
      <section
        v-if="selected?.run?.implementationResult"
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
      <template #footer>
        <div v-if="selected" class="mission-implementation__dialog-footer">
          <span>{{ t(`missions.ticketRunStatus.${ticketStatus(selected)}`) }}</span>
          <button
            v-if="!readOnly && selected.run?.status === 'awaitingReview' && reviewPolicy === 'reviewEachTicket'"
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
        </div>
      </template>
    </MissionTicketDialog>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { Mission } from "@codex-claw/core/missions";
import type { MissionRun } from "@codex-claw/core/mission-execution";
import {
  CheckIcon,
  FileTextIcon,
  FolderIcon,
  GitBranchIcon,
  X,
} from "../shared/icons/app-icons";
import MissionImplementationTicketCard from "./MissionImplementationTicketCard.vue";
import MissionTicketDialog from "./MissionTicketDialog.vue";
import { implementationTicketStatus, missionRepositoryName, missionTicketNumber, type MissionImplementationTicketItem } from "./mission-implementation-model";

type TicketItem = MissionImplementationTicketItem;

const props = defineProps<{ mission: Mission; busy?: boolean; readOnly?: boolean }>();
const emit = defineEmits<{
  approve: [runId: string];
  "open-conversation": [agentId: string];
  retry: [ticketIndex: number];
  stop: [runId: string];
}>();
const { t } = useI18n();
const selectedIndex = ref(-1);
const evidenceOpen = ref(false);
const hasImplementationEvidence = computed(() => Boolean(
  props.mission.artifacts.implementation.changes.trim()
  || props.mission.artifacts.implementation.tests.trim(),
));
const reviewPolicy = computed(
  () => props.mission.execution?.reviewPolicy ?? "reviewEachTicket",
);
const policyLabel = computed(() =>
  t(`missions.reviewPolicy.${reviewPolicy.value}`),
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

function openConversation(workerId?: string): void {
  if (workerId) emit("open-conversation", workerId);
}
function repositoryName(repositoryPath: string): string {
  return missionRepositoryName(repositoryPath);
}
function workspaceBranch(repositoryPath: string): string {
  return (
    props.mission.execution?.workspaces?.find(
      (workspace) => workspace.repositoryPath === repositoryPath,
    )?.branch ??
    (lanes.value.length === 1
      ? (props.mission.execution?.workspace?.branch ?? "")
      : "")
  );
}
function ticketNumber(index: number): string {
  return missionTicketNumber(index);
}
function ticketStatus(
  item: TicketItem,
): "queued" | "blocked" | MissionRun["status"] {
  return implementationTicketStatus(item, props.mission.artifacts.tickets);
}
function laneProgress(tickets: TicketItem[]): string {
  return t("missions.repositoryProgress", {
    complete: tickets.filter((item) => item.ticket.done).length,
    total: tickets.length,
  });
}
</script>

<style scoped>
.mission-implementation {
  display: grid;
  max-width: 860px;
  gap: var(--space-8);
  margin: 0 auto;
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
  align-items: center;
  gap: var(--space-6);
}

.mission-implementation__view-evidence {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: auto;
  padding: 0;
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font: inherit;
  font-size: var(--font-size-12);
  cursor: pointer;
}

.mission-implementation__view-evidence:hover,
.mission-implementation__view-evidence:focus-visible {
  color: var(--color-text);
}

.mission-implementation__view-evidence svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
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

.mission-implementation__lane > header .mission-implementation__workspace {
  display: inline-flex;
  min-width: 0;
  align-self: flex-start;
  align-items: center;
  gap: var(--space-2);
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mission-implementation__lane > header .mission-implementation__workspace svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
  flex: 0 0 auto;
  color: var(--color-text-muted);
}

.mission-implementation__lane ol {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: var(--space-6);
  list-style: none;
}

:global(.mission-implementation__evidence-dialog.el-dialog) {
  display: grid;
  max-height: min(82vh, 780px);
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

:global(.mission-implementation__evidence-dialog.el-dialog > .el-dialog__header) {
  margin: 0;
  padding: 0;
}

:global(.mission-implementation__evidence-dialog.el-dialog > .el-dialog__body) {
  min-height: 0;
  padding: 0;
  overflow: auto;
}

.mission-implementation__evidence-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: var(--space-6);
  padding: var(--space-8);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-low);
}

.mission-implementation__evidence-header > span {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: var(--radius-md);
  color: var(--color-on-primary-container);
  background: var(--color-primary-container);
}

.mission-implementation__evidence-header > span svg,
.mission-implementation__evidence-header > button svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.mission-implementation__evidence-header > div {
  display: grid;
  gap: var(--space-1);
}

.mission-implementation__evidence-header h3,
.mission-implementation__evidence-header small,
.mission-implementation__aggregate p {
  margin: 0;
}

.mission-implementation__evidence-header h3 {
  font-size: var(--font-size-18);
  line-height: var(--line-height-24);
}

.mission-implementation__evidence-header small {
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.mission-implementation__evidence-header > button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.mission-implementation__evidence-header > button:hover,
.mission-implementation__evidence-header > button:focus-visible {
  color: var(--color-text);
  background: var(--color-surface-high);
}

.mission-implementation__aggregate {
  display: grid;
  gap: var(--space-8);
  padding: var(--space-10);
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

.mission-implementation__dialog-footer {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
}

.mission-implementation__dialog-footer button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.mission-implementation__dialog-footer svg {
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
  .mission-implementation__progress span,
  .mission-run-card-enter-active,
  .mission-run-card-leave-active {
    transition-duration: 1ms;
  }
}
</style>
