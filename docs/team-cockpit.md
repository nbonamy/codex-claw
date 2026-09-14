# Team Cockpit

## Status

The global navigation shape is implemented. A team-scoped Cockpit remains a
possible future feature and is not an approved implementation plan.

## Global Surfaces

The team rail exposes two separate global surfaces, with Backlog before
Cockpit:

- **Backlog** is the operator inbox for connected work providers.
- **Cockpit** is the all-agent overview. It can group cards by team or flatten
  them into a single list sorted by recent agent activity.

Keep these as distinct surfaces. Opening Cockpit must not initialize or load
Backlog data. `CockpitView` owns the small Agents surface shell,
`CockpitAgentsView` owns agent cards and actions, and `BacklogView` owns work
provider navigation and the inbox. Projection and sorting logic belongs in a
focused view-model module rather than `AppShell` or either large visual
component.

Team rail state is also deliberately app-owned and cheap to derive:

- the existing corner dot is red when the team has unread activity;
- the same dot is orange when agents are working;
- unread takes visual precedence when both states apply;
- the selected team never shows the dot.

Agent activity is stored separately from metadata updates so startup hydration
does not make every idle agent appear newly active. The selected Teams/Recent
ordering is part of general settings and survives restarts too.

## Possible Team Cockpit

A future Team Cockpit would be a second entry point inside a team:

- It appears at the top of the agent sidebar as a selectable fake agent row.
- It is not an agent and must not create backend sessions, messages, folders,
  or runtime state.
- It uses `CockpitIcon` with only the current team, producing one colored cell.
- Selecting it opens the Agents Cockpit scoped to the current team.
- It reuses `CockpitView`, `CockpitAgentsView`, `CockpitAgentCard`, and
  `CockpitAddAgentTile`; it does not fork a second agent-overview stack.

The scope should be applied before building the view model. Avoid conditionals
spread through child components. A future contract could be:

```ts
type CockpitScope =
  | { kind: 'global' }
  | { kind: 'team'; teamId: string };
```

Global scope shows every agent and both existing layout modes. Team scope shows
only that team's agents, fixes the target team for new agents, and hides team
selection when the target is already known.

## Sidebar Behavior

The future team Cockpit row should:

- be pinned before regular agents and excluded from agent reordering;
- be selected when the active surface is the team Cockpit for that team;
- use the current team name or a short `Cockpit` label;
- not expose the agent context menu;
- not affect `activeAgentId`.

This will require a richer active-surface model than today's string union, for
example:

```ts
type AppSurface =
  | { kind: 'agent' }
  | { kind: 'cockpit'; scope: CockpitScope }
  | { kind: 'backlog' }
  | { kind: 'automations' }
  | { kind: 'settings' };
```

## Team-Scoped Backlog

If a team-scoped Backlog is added later, its filter configuration should be
remembered per team while provider credentials and assignment records remain
global. `clawd` should own validation and persistence; renderer should only
choose a scope and route typed requests.

Do not couple this to the Team Cockpit. Agent overview scope and work-provider
scope are separate product decisions now that Cockpit and Backlog are separate
global surfaces.

## Testing Strategy

For the implemented global surfaces, keep coverage at the narrow seams:

- Team rail tests cover independent navigation, unread, and working states.
- `CockpitView` tests cover the persisted Teams/Recent choice and event forwarding.
- The projection module tests grouping and recent ordering without mounting UI.
- `BacklogView` tests own work-provider navigation and inbox behavior.
- `AppShell` tests prove Cockpit does not load Backlog and Backlog initializes
  only when selected.

If the team-scoped Cockpit is implemented, add tests for scoping, pinned
sidebar behavior, team selection changes, and fixed-team creation flows.

## Open Questions

- Should Team Cockpit be the default selection when a team has no active agent?
- Should the fake sidebar row say the team name or `Cockpit`?
