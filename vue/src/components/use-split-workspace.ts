import { computed, ref, watch } from 'vue';

export type SplitLayout =
  | 'single'
  | '2-vertical'
  | '2-horizontal'
  | '4-quadrant';
export type SplitPane = { id: number; agentId: string | null };
type TeamWorkspace = {
  layout: SplitLayout;
  panes: SplitPane[];
  focusedPaneId: number;
};

/** Layout is client-local. Agents never own other agents or their workspace tabs. */
export function useSplitWorkspace(options: {
  agentIds: () => string[];
  currentAgentId: () => string | undefined;
  teamId: () => string | undefined;
  selectAgent: (agentId: string) => void;
}) {
  const layout = ref<SplitLayout>('single');
  const panes = ref<SplitPane[]>([
    { id: 0, agentId: options.currentAgentId() ?? null },
  ]);
  const focusedPaneId = ref(0);
  let nextPaneId = 1;
  let activeTeamId = options.teamId();
  const teamWorkspaces = new Map<string | undefined, TeamWorkspace>();
  const focusedPane = computed(
    () =>
      panes.value.find((pane) => pane.id === focusedPaneId.value) ??
      panes.value[0]!,
  );

  function select(agentId: string): void {
    if (!options.agentIds().includes(agentId)) return;
    const existing = panes.value.find((pane) => pane.agentId === agentId);
    if (existing) focusedPaneId.value = existing.id;
    else focusedPane.value.agentId = agentId;
  }

  function focus(paneId: number): void {
    const pane = panes.value.find((candidate) => candidate.id === paneId);
    if (!pane) return;
    focusedPaneId.value = pane.id;
    if (pane.agentId && pane.agentId !== options.currentAgentId())
      options.selectAgent(pane.agentId);
  }

  function setLayout(value: SplitLayout): void {
    const count = value === 'single' ? 1 : value === '4-quadrant' ? 4 : 2;
    const current = focusedPane.value;
    if (panes.value.indexOf(current) >= count) {
      panes.value = [
        current,
        ...panes.value.filter((pane) => pane !== current),
      ];
    }
    panes.value = panes.value.slice(0, count);
    const available = options
      .agentIds()
      .filter((id) => !panes.value.some((pane) => pane.agentId === id));
    while (panes.value.length < count)
      panes.value.push({
        id: nextPaneId++,
        agentId: available.shift() ?? null,
      });
    layout.value = value;
  }

  watch(
    [options.teamId, options.currentAgentId, options.agentIds],
    ([teamId, agentId, ids], [, previousAgentId]) => {
      const teamChanged = teamId !== activeTeamId;
      let restoringEmptyFocus = false;
      if (teamChanged) {
        teamWorkspaces.set(activeTeamId, {
          layout: layout.value,
          panes: panes.value.map(pane => ({ ...pane })),
          focusedPaneId: focusedPaneId.value,
        });
        activeTeamId = teamId;
        const saved = teamWorkspaces.get(teamId);
        layout.value = saved?.layout ?? 'single';
        panes.value = saved?.panes.map(pane => ({ ...pane })) ?? [
          { id: nextPaneId++, agentId: agentId ?? null },
        ];
        focusedPaneId.value = saved?.focusedPaneId ?? panes.value[0]!.id;
        restoringEmptyFocus = Boolean(saved) && focusedPane.value.agentId === null;
      }
      for (const pane of panes.value)
        if (pane.agentId && !ids.includes(pane.agentId)) pane.agentId = null;
      const followCurrent = teamChanged
        ? !restoringEmptyFocus
        : agentId !== previousAgentId || !panes.value.some(pane => pane.agentId);
      if (agentId && followCurrent) select(agentId);
    },
    { immediate: true },
  );

  return {
    layout,
    panes,
    focusedPaneId,
    focusedPane,
    focus,
    select,
    setLayout,
  };
}
