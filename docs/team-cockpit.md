# Team Cockpit

## Status

This is a design note for a possible future feature. Do not treat it as an
approved implementation plan yet.

The decision for now is to preserve the global Cockpit and document the team
Cockpit idea so we can come back to it later without losing the architectural
shape.

## Product Shape

Codex Claw already has a global Cockpit launched from the team rail. That view
shows all teams, all agents, and a work backlog across the app.

The proposed Team Cockpit is a second entry point inside a team:

- The global Cockpit stays in the team rail and keeps showing all teams.
- The team Cockpit appears at the top of the agent sidebar as a fake agent row.
- It should look and behave like a selectable sidebar item, but it is not an
  agent and must not create backend sessions, messages, folders, or runtime
  state.
- The team Cockpit row uses `CockpitIcon`.
- For the team Cockpit icon, pass only the current team to `CockpitIcon`, so the
  icon shows only one colored cell for that team.
- Selecting the team Cockpit opens the same Cockpit surface scoped to the
  current team.

The key UX goal is that a team can become a self-contained work area: switch to
Team A and see Team A's agents and Team A's backlog filters; switch to Team B
and see Team B's agents and Team B's backlog filters.

## Component Design

Do not duplicate `CockpitView`.

`CockpitView` should get a scope prop, for example:

```ts
type CockpitScope =
  | { kind: 'global' }
  | { kind: 'team'; teamId: string };
```

Global scope:

- Used by the existing rail Cockpit.
- Shows all teams and all agents grouped by team.
- Keeps team selection and cross-team assignment controls.
- Uses global work backlog configuration.

Team scope:

- Used by the fake team Cockpit row in `AgentSidebar`.
- Shows only the current team's agents.
- Still uses the exact same `CockpitView`, `CockpitAgentCard`,
  `CockpitAddAgentTile`, `WorkBacklogPanel`, and assignment flows.
- Hides team selectors in creation dialogs because the target team is known:
  the current team.
- Sends assignments to existing agents in that team.
- Creates new agents in that team by default.

The scope should be applied before building the view model. Avoid conditionals
spread through child components. The parent or `CockpitView` should derive a
small scoped model:

- visible teams;
- visible agents;
- target team id for new/deployed agents;
- whether team-picking UI is allowed;
- which work backlog configuration to read/write.

## Sidebar Behavior

The agent sidebar should render a Team Cockpit row before regular agents.

The row should:

- be selected when the active surface is the team cockpit for the active team;
- use the current team name or a short label such as `Cockpit`;
- use `CockpitIcon` with a one-team array;
- participate visually like the first item in the agent list;
- not participate in agent reordering;
- not expose the agent context menu;
- not affect `activeAgentId`.

This implies `AppShell` probably needs a richer active surface than the current
plain global cockpit flag. A future shape could be:

```ts
type AppSurface =
  | { kind: 'agent' }
  | { kind: 'cockpit'; scope: CockpitScope }
  | { kind: 'automations' }
  | { kind: 'settings' };
```

If the implementation keeps the current string union temporarily, it should
still preserve the same semantic distinction: global Cockpit and team Cockpit
are different surfaces using the same component.

## Work Backlog Configuration

The important persistence change is that backlog filters need a scope.

Today GitHub backlog configuration is global:

```ts
workBacklog.providerConfigurations.github = {
  repositoryId,
  assigneeLogin,
  tagName,
};
```

For Team Cockpit, configuration should be remembered per team so each team can
keep its own GitHub project filter.

A good contract direction is:

```ts
type WorkBacklogScope =
  | { kind: 'global' }
  | { kind: 'team'; teamId: string };

type WorkBacklogState = {
  connections: WorkIntegrationConnection[];
  providerConfigurations: WorkBacklogProviderConfigurations;
  teamProviderConfigurations: Record<string, WorkBacklogProviderConfigurations>;
  providerSettings: Partial<Record<WorkProviderKind, WorkProviderSettings>>;
  assignments: Record<string, WorkBacklogAssignment>;
};
```

Then `WorkBacklogConfigurationInput` can accept an optional scope:

```ts
type WorkBacklogConfigurationInput = {
  provider: 'github';
  scope?: WorkBacklogScope;
  configuration: GitHubWorkBacklogConfigurationInput;
};
```

Rules:

- Missing scope means global, preserving existing behavior.
- `scope.kind === 'team'` must validate that the team exists.
- Disconnecting a provider should clear both global and team-scoped
  configurations for that provider.
- Closing a team should remove that team's scoped backlog configuration.
- Existing persisted `providerConfigurations.github` should migrate as global
  Cockpit configuration.
- Tokens remain provider-level, not team-level. Team-scoped config stores only
  safe filter metadata.

Assignments should remain provider-neutral and global by work item id. A work
item can be assigned to an agent from any cockpit scope. The current assignment
record does not need to become team-scoped because the assigned agent already
implies the team, and assignments represent local work state rather than a
filter preference.

## IPC And Backend

The renderer should not mutate scoped backlog config locally as durable state.

`clawd` should own:

- validating the requested backlog scope;
- saving global versus team-scoped provider configuration;
- clearing stale team-scoped config when teams/providers disappear;
- returning the refreshed `AppSnapshot`.

Renderer should own:

- choosing the current cockpit scope;
- passing the scope to `CockpitView`;
- passing scoped `configureWorkBacklog` requests through typed IPC;
- loading repositories/items for the selected scoped repository.

`WorkIntegrationManager.configureBacklog` is the right backend seam to
extend. The work-provider drivers do not need to know about cockpit scope.

## Dialog Behavior

When the Cockpit is team-scoped:

- `Assign to new agent` should open `AgentDialog` with the team already fixed.
- The dialog should hide team controls in this flow.
- The resulting create call should still use the normal app-owned create API
  with a concrete `teamId`.

When the Cockpit is global:

- Existing behavior remains.
- Team controls stay visible for flows where the target team is ambiguous.

## Testing Strategy

When/if implemented, cover it in small slices:

- `CockpitView` component tests for global scope versus team scope:
  - global shows all teams;
  - team scope shows only that team's agents;
  - team scope emits new/deploy assignment intents with the scoped team id;
  - global scope keeps existing cross-team behavior.
- `AgentSidebar` tests:
  - renders the team Cockpit row above agents;
  - selecting it emits a team cockpit event;
  - it does not open the agent context menu or reorder as an agent.
- `AppShell` tests:
  - global rail Cockpit still opens global scope;
  - sidebar Cockpit opens team scope;
  - switching teams keeps team Cockpit scoped to the current team;
  - team-scoped create/deploy dialogs hide team controls.
- Backend/persistence tests:
  - global backlog config persists as before;
  - team-scoped backlog config persists per team;
  - closing a team removes only that team's scoped config;
  - disconnecting a provider clears scoped configs for that provider;
  - loading old state without team configs still works.

## Open Questions

- Should team Cockpit be the default first selection when a team has no active
  agent, or should empty-team onboarding remain the default?
- Should the team Cockpit row be draggable or pinned? Current recommendation:
  pinned and not draggable.
- Should the global Cockpit show each team's scoped backlog summary, or keep
  one global backlog filter? Current recommendation: keep global Cockpit global
  and do not mix team filters into it.
- Should assignments from a team-scoped Cockpit be restricted to that team only?
  Current recommendation: yes for the visible assignment UI, but existing
  assignment records remain global and provider-neutral.
