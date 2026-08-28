# Repository-first sidebar

## Objective

Replace the active team's flat named-agent list with a repository-first session
navigator. Teams remain the collaboration boundary, agents remain the durable
runtime and MCP identity, and the sidebar presents each agent's current
conversation as a repository-scoped work session.

```text
TEAM
  Quick chats
  codex-claw
    main · Improve repository navigation
    feat/work-routing · Add work routing
  codex-app-sdk
    main · Fix queue rendering
```

Repositories are visual section headers. Branches and worktrees are familiar
software-work units. Agent names remain available internally for collaboration
and disambiguation but stop being the primary sidebar label.

## Product model

1. Keep the existing Team Rail.
2. Group the selected team's active sessions by canonical Git repository.
3. Always render a repository header, including for one session on `main`.
4. Render each active agent as one session row under its repository.
5. Treat the primary checkout and linked worktrees identically as sessions;
   distinguish them through branch/worktree metadata, not nested cards.
6. Put non-Git and not-yet-initialized sessions in a quiet **Quick chats**
   group.
7. Keep historical conversations attached to a session row through on-demand
   disclosure or a context action. Do not eagerly load every backend history.

Session rows show a branch/session icon, current conversation title when
available, branch or agent-name fallback, status/unread state, and current
selection. The UI must not return to an avatar-led employee directory.

Agent names and IDs remain canonical internally. Mentions continue inserting
`@agent:<agentId>` while showing a contextual repository/branch/title label.

## Architecture

### Backend-owned workspace identity

Add an app-owned `AgentWorkspaceIdentity` projection keyed by agent ID:

```ts
type AgentWorkspaceIdentity =
  | {
      kind: 'git';
      folder: string;
      repositoryName: string;
      repositoryRoot: string;
      branch: string | null;
      isLinkedWorktree: boolean;
      primaryWorktreeRoot: string;
      updatedAt: string;
    }
  | {
      kind: 'folder';
      folder: string;
      label: string;
      updatedAt: string;
    };
```

- Resolve identity behind `clawd`, never in Vue.
- Use lightweight Git identity commands rather than full `git status`.
- Persist the latest identity in the app snapshot.
- Reconcile when an agent is created, its folder changes, a branch/worktree
  operation completes, a team becomes active, or active Git status refreshes.
- Do not add timers or polling.
- Project identities for remote teams.
- Fall back to folder identity when Git or the checkout is unavailable.
- Remove orphan identities when agents close.

### Pure sidebar projection

Build a framework-independent projector that consumes agents, workspace
identities, current conversation metadata, unread IDs, and active agent ID.
It returns ordered repository groups and session rows. Grouping, ordering,
fallback titles, quick-switch positions, and duplicate-label disambiguation
stay out of Vue templates.

Preserve flat team-agent ordering as the stable ordering source. Repository
groups use the position of their first contained session. Reordering within a
repository remains supported; cross-repository drag must not imply a checkout
move.

### Conversation metadata

Reuse the backend/SDK current-conversation title when available and retain only
lightweight display metadata in app state. Update it on conversation creation,
summary/title changes, resume, and applicable rename. Never invoke
`listAgentConversations` for every row while rendering.

### Components

- `AgentSidebar.vue`: shell, dense repository/session list, resize, footer,
  selection, status, shortcuts, and context actions.
- `RepositoryIconPicker.vue`: persisted one-grapheme repository icon picker.
- `projectWorkspaceSidebar`: framework-independent repository/session grouping,
  ordering, kind, and label projection.

Reuse existing context menu, conversation history, New Agent, resize, collapse,
and Bench behavior. Keep repository grouping dense, borderless, and quiet.

### Work routing

The Claw-owned `prepare-work` MCP tool supplies three modes:

- **Continue here**: no structural change.
- **Continue on a branch**: same session stays selected and moves to the new
  branch identity.
- **Delegate in a worktree**: create/reuse a branch worktree, create a
  background session there, dispatch the task, and leave the caller selected.

Existing branches/worktrees are reused. Shared-folder branch switching stays
blocked. Failures remain actionable in the routing dialog.

### Mentions

Host-defined agent mention labels become contextual repository/branch/title
labels while keeping canonical `@agent:<agentId>` values and the bot icon.
Historical mentions must resolve after restart; duplicate labels receive a
deterministic disambiguator.

## Implementation phases

### Phase 1 — Workspace identity

- Add contracts, snapshot defaults, reducer/validation, and persistence.
- Implement lightweight Git/folder resolution.
- Add lifecycle reconciliation, remote projection, and orphan cleanup.
- Test primary checkout, linked worktree, detached HEAD, non-Git/missing folder,
  remote projection, and restore.

Checkpoint: `feat: add agent workspace identity`

### Phase 2 — Grouping model and isolated UI

- Build and test the pure projection.
- Cover main, multiple worktrees, duplicate branches, Quick chats, unread,
  working, awaiting input, error, remote, and missing metadata.
- Build isolated repository group/session row components.
- Visually compare the fixture against the supplied screenshot.

Checkpoint: `feat: add repository session sidebar components`

### Phase 3 — AppShell integration

- Replace the flat active-team list.
- Wire selection, context menus, shortcuts, unread, resize/collapse,
  create/deploy actions, history, and reorder behavior.
- Keep conversation, header, and right workspace unchanged.
- Remove old avatar-row CSS only after parity tests pass.

Checkpoint: `feat: switch sidebar to repository sessions`

### Phase 4 — Routing and live updates

- Land the existing `prepare-work` request flow.
- Feed branch/worktree results into workspace identity.
- Verify same-row branch moves and background delegated-row insertion.
- Verify existing branch/worktree reuse and dirty/shared-checkout errors.

Checkpoint: `feat: route work into branches and worktrees`

### Phase 5 — Mentions, history, and migration polish

- Contextualize mention labels.
- Finish on-demand history integration.
- Finalize compact mode and group-collapse persistence.
- Validate old snapshots and fallback states.
- Update frontend, MCP, protocol, and architecture docs.
- Remove the superseded flat sidebar.

Checkpoint: `feat: finish workspace-first navigation`

## Execution status

- [x] Workspace identity contract, persistence, reconciliation, and cleanup.
- [x] Pure repository/session projection with Quick chats fallback.
- [x] Repository-first AppShell sidebar with existing actions preserved.
- [x] Work-routing request flow for current checkout, branch, and worktree.
- [x] Dense visual pass with colored session kinds and persisted repository icons.
- [ ] Contextual mention labels and remaining history/migration polish.

## Testing

### Core

- snapshot defaults, validation, reducers, and migration;
- pure grouping, ordering, fallback titles, and disambiguation;
- identity cleanup on agent close.

### Backend

- primary checkout, worktree, detached, existing branch, non-Git, missing folder;
- refresh triggers without polling;
- remote projection;
- all routing modes and existing worktree reuse;
- no full Git-status fan-out.

### Vue

- single and multiple repository groups;
- main plus worktrees;
- Quick chats;
- active, unread, working, awaiting-input, and error rows;
- repository/session actions, history, context menu, shortcuts, reorder;
- compact/narrow layouts, resize, and collapse.

### Integration and visual QA

- existing snapshots render grouped navigation;
- selection restores the correct conversation/composer;
- branch switching moves the same row;
- delegation adds a background row without switching;
- unread team indicators and remote sessions remain correct;
- restart restores grouping and labels;
- capture light/dark, one repo, multiple worktrees, multiple repos, Quick chats,
  unread/awaiting-input, and narrow sidebar states.

Run focused tests while iterating, then the full workspace tests, coverage,
lint, typecheck, Vue style checks, diff check, and desktop visual smoke.

## Migration and non-goals

Existing agents require no destructive migration. Preserve agent IDs, names,
avatars, teams, sessions, Bench templates, unread state, and ordering. Keep the
old flat component until the new one reaches parity. Compact mode changes row
density rather than restoring avatars.

This work does not remove teams or agents, replace provider session management,
eagerly load all conversations, change Cockpit information architecture,
invent a Git project database, or expose provider protocol types to Vue.

## Definition of done

- The selected team's sidebar reads as repositories containing work sessions.
- A single main session still renders under a repository header.
- Worktrees appear beneath their canonical repository.
- Routing updates the hierarchy immediately and survives restart.
- Existing actions, shortcuts, unread, and status behavior remain available.
- Mentions remain stable and understandable.
- No periodic Git-status requests are introduced.
- Existing user data migrates without loss.
