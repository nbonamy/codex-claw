import type { Agent, AppSnapshot, MainToRendererEvent } from '@workspace/core/contracts';
import { providerConversationEventView } from '@workspace/core/provider-conversation-event';
import { computed, ref } from 'vue';
import { appHostCapabilities, appApi } from './platform-api';

export function createAgentUnreadState(options: { getSnapshot: () => AppSnapshot }) {
  const agentIds = ref(new Set<string>());
  const rendererWindowFocused = ref(true);
  const unreadAgentIds = computed(() => [...agentIds.value]);

  function reset(): void {
    agentIds.value = new Set();
    syncDockBadge();
  }

  function setRendererWindowFocused(focused: boolean): void {
    rendererWindowFocused.value = focused;
    const activeAgentId = options.getSnapshot().activeAgentId;
    if (focused && activeAgentId) markRead(activeAgentId);
    else if (focused) syncDockBadge();
  }

  function handleMainEvent(event: MainToRendererEvent): void {
    const conversationEvent = providerConversationEventView(event);
    if (!event.agentId || !isUnreadWorthyEvent(conversationEvent.type)) return;
    const snapshot = options.getSnapshot();
    if (!snapshot.agents.some((agent) => agent.id === event.agentId)) return;
    if (rendererWindowFocused.value && snapshot.activeAgentId === event.agentId) {
      markRead(event.agentId);
      return;
    }
    markUnread(event.agentId);
  }

  function markDebugAgentsUnread(): void {
    const snapshot = options.getSnapshot();
    const activeAgent = snapshot.agents.find((agent) => agent.id === snapshot.activeAgentId) ?? null;
    const currentTeam = snapshot.teams.find((team) => team.id === snapshot.activeTeamId) ??
      snapshot.teams.find((team) => team.agentIds.includes(activeAgent?.id ?? '')) ?? null;
    const agentsById = new Map(snapshot.agents.map((agent) => [agent.id, agent]));
    const agentsForTeam = (ids: readonly string[]): Agent[] => ids
      .map((agentId) => agentsById.get(agentId))
      .filter((agent): agent is Agent => Boolean(agent));
    const currentTeamCandidates = agentsForTeam(currentTeam?.agentIds ?? [])
      .filter((agent) => agent.id !== activeAgent?.id);
    const otherTeams = snapshot.teams.filter((team) => (
      team.id !== currentTeam?.id && agentsForTeam(team.agentIds).length > 0
    ));
    const otherTeam = randomItem(otherTeams);
    const targets = [
      randomItem(currentTeamCandidates),
      randomItem(agentsForTeam(otherTeam?.agentIds ?? [])),
    ].filter((agent): agent is Agent => Boolean(agent));
    markUnread(targets.map((agent) => agent.id));
  }

  function markUnread(agentId: string): void;
  function markUnread(agentIds: readonly string[]): void;
  function markUnread(value: string | readonly string[]): void {
    const next = new Set(agentIds.value);
    for (const agentId of typeof value === 'string' ? [value] : value) next.add(agentId);
    if (next.size === agentIds.value.size) return;
    agentIds.value = next;
    syncDockBadge();
  }

  function markRead(agentId: string): void {
    if (agentIds.value.has(agentId)) {
      const next = new Set(agentIds.value);
      next.delete(agentId);
      agentIds.value = next;
    }
    syncDockBadge();
  }

  function prune(): void {
    const existingAgentIds = new Set(options.getSnapshot().agents.map((agent) => agent.id));
    const next = new Set([...agentIds.value].filter((agentId) => existingAgentIds.has(agentId)));
    if (next.size === agentIds.value.size) return;
    agentIds.value = next;
    syncDockBadge();
  }

  function syncDockBadge(): void {
    if (appHostCapabilities.dockBadge) {
      void appApi?.setDockBadgeCount?.(agentIds.value.size).catch(() => undefined);
    }
  }

  return {
    handleMainEvent,
    markDebugAgentsUnread,
    markRead,
    prune,
    reset,
    setRendererWindowFocused,
    unreadAgentIds,
  };
}

function isUnreadWorthyEvent(type: string): boolean {
  return type === 'turn.completed' ||
    type === 'approval.requested' ||
    type === 'agentRequest.created' ||
    type === 'toolInput.requested' ||
    type === 'error';
}

function randomItem<T>(items: readonly T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}
