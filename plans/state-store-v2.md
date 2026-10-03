# State store v2

Status: implemented on `feat/state-store-v2` (see Learnings for where the build
differs from this plan).

## Goal

Replace the unversioned, 1.1 MB `~/.codex-claw/state.json` with a small,
versioned, type-checked store. Every field has one home. Everything an entity
owns is removed with the entity, at the moment it is removed.

Measured on the real file: 1.13 MB becomes roster 67 KB (indented), settings
4 KB, and visualizations (about 250 KB in two files) written only when edited.
Of today's bytes, `subagentTrees` is 55% (94% of that is operations and
activities that no consumer reads), `repositoryVisualizations` is 20%, and all
agents together are 5%.

## Target layout

```
~/.codex-claw/
  roster.json                  # activeTeamId, teams, agents, automations, missions, workAssignments, subagent nodes
  settings.json                # settings, theme, sourceFolder, remoteConnections, workIntegrations
  visualizations/<repo>-<hash>/<id>.json
  backups/                     # automatic pre-migration copies, last few kept
```

Each JSON file is `{ schemaVersion, writtenBy: "clawd x.y.z", ... }`.
`<hash>` is the first 8 hex characters of the SHA-1 of the repository key; the
`repository` field inside each file stays authoritative. A reference mock
generated from the real file lives outside the repo (`~/Desktop/claw`).

## Data changes

- Dropped (derived, stale or unread): subagent `operations` and `activities`,
  `agent.teamId`, the global `activeAgentId`, Codex `approvalPolicy` /
  `approvalsReviewer` / `sandboxMode` (derived from `approvalPreset`), finished
  `plan`s, `goal`s that are `complete`, and `planReview`s that are resolved.
- Kept after checking the code: `statusText` and `contextUsage` (restoring them on
  load is deliberate and tested), `accountRateLimits`, `workspace`, and the
  remote connection and work integration probe fields. There is no startup
  probe, so remote teams depend on the last stored `status`.
- Kept narrowly: subagent `rootConversationId` and `nodes` for live agents;
  `planReview` while `pending`; `goal` while not complete.
- Restructured: `backend` + `backendSession` + `backendDefaults` become one
  `agent.engine { kind, session, settings }`. Team membership is persisted once
  (`team.agentIds`; its order is the display order).
- `clientPreferences` is removed entirely. Codex Claw is designed for a single
  client: order, theme, icons, favorites, view settings and selection are all
  shared. `externalApplications` moves to `agent.openInApplication`.
- `agent.workspace` stays persisted for now. It is the git identity of the
  agent's folder (repository name and root, branch, origin URL, linked-worktree
  flag); the sidebar grouping and the visualization repository key read it.
  Dropping it needs proof that it can be rebuilt from `folder` plus git.

## Type safety

The migration leans on TypeScript instead of hand-checked `unknown`.

- One frozen schema per version (`v1.ts`, `v2.ts`, ...) in the backend. Each is
  a Zod schema (`zod` is already a backend dependency) with its type from
  `z.infer`, so runtime validation and the type cannot drift. Frozen files
  import nothing from the live contracts; a lint rule enforces that.
- Migration steps are typed `(from: V1) => V2`. The compiler rejects a missing
  field, a wrong type or a renamed key; dropped fields are dropped explicitly.
- A typed mapper at the boundary: `toSnapshot(persisted: Latest): AppSnapshot`
  and `fromSnapshot(snapshot: AppSnapshot): Latest`.
- A field classification table forces a decision on every field:
  `{ id: 'persisted', teamId: 'derived', status: 'runtime', ... } satisfies
  Record<keyof Agent, 'persisted' | 'derived' | 'runtime'>`. Adding a field to
  `Agent` fails the build until it is classified. The same applies to the keys of
  the general settings. This is the direct fix for fields such as
  `providerModelDefaults` changing the file format with no version bump.
- Runtime validation stays: files can be hand-edited, written by an older
  build, or corrupt. The existing lenient `sanitize*` code survives only as the
  v0 reader (legacy unknown shapes). From v1 on, schemas are strict, and a
  failure stops startup with a clear error instead of silently dropping data.
- Types do not cover semantics (completed goals are dropped), cross-file
  consistency or old-build behavior; fixtures and tests cover those.

## Migration strategy

1. A runner of ordered, typed steps. An unversioned file is v0.
2. All `legacy*` handling in `state-persistence.ts` (design to visualize,
   diagrams, legacy work assignments, thread plan status, Codex conversation
   ref, `shareCodexSkillsAndPlugins`) becomes migration steps and leaves the hot
   loader.
3. Backup before migrating, always. Copy the old file to
   `backups/state-v<N>-<timestamp>.json`, read the copy back and compare its
   size and SHA-256 with the original. If the backup cannot be written and
   verified, the migration aborts and nothing else is touched. The first
   backup of each schema version (the v0 file above all) is never pruned;
   only later duplicates are. Log the backup path at start.
4. Crash safety: write the new files first, then retire `state.json` into
   `backups/` as the commit point. If `state.json` is still present at start,
   redo the migration from it, overwriting partial output.
5. Forward-compat guard: if a file's `schemaVersion` is higher than this build
   supports, refuse to write and name the build that wrote it. The home is
   shared with dev builds, so an older branch must never strip a newer file.
6. A file that fails to parse stops startup. It is never replaced by an empty
   state.
7. Dev branches that change the schema should use an isolated
   `CODEX_CLAW_HOME`.

## Cleanup (just in time)

- Mission delete keeps removing `missions/<id>` before the mission leaves the
  state. That order is deliberate: if the file removal fails, the mission stays
  listed and the delete can be retried, whereas deleting after the save would
  leak the files with no way to retry.
- Quick chat close deletes the provider session instead of archiving it. Claude
  uses the SDK session delete already used for reviewers. For Codex, use a
  delete call if the app-server has one and fall back to archive otherwise;
  confirm during that commit. Approved by Nicolas.
- Agent close also removes its subagent nodes and any references.
- Visualizations are user content and are removed only by explicit delete.
- No startup sweep and no Storage pane.
- One-off, by Nicolas, not code, listed with sizes in the handoff: `history/`
  (2.2 GB, no reader or writer in any commit or in the SDK), 6 empty
  `quick-chats/` folders, 6 `missions/` folders for missions that no longer
  exist, 17 hand-made `state.*before*` files and one 0-byte
  `state.json.recovery.*` (11.7 MB), and `recovery-backups/` (1.2 GB).
  `codex-home/`, `claude-home/`, `logs/` and `provider-tokens.json` are not on
  the list.

## Decisions made

- Single client. Selection is shared and persisted as `activeTeamId` and
  `teams[].activeAgentId`. All client-profile code goes: the `_clientId`
  parameter, the remote controller profile, `projectClientSnapshot`,
  `splitSettingsInput`, `sanitizeClientPreferences` and the client preferences
  service. Commit 3 audits every caller before deleting. The per-browser identity
  of the web host goes with it.
- Quick chat close deletes the provider session.
- Repository key: path plus hash for visualization directories.
- Snapshot payload size (subagent trees and visualizations in every
  `snapshot.updated`) is a follow-up, not part of this migration.

## Commit checkpoints

Single-line, lowercase messages; tests in the same commit. Intermediate schema
versions never ship, so the build lands as one jump from the unversioned file to
schema 1 instead of one migration per step.

1. `chore: add state store v2 plan`
2. `feat: store app state as versioned roster, settings and visualization files`:
   typed layout, schemas, migration runner, verified backup, forward-compat guard,
   legacy migration, client profile folding, consumers (`remote-codex-install`,
   recovery script, live-preview skill) and docs.
3. `feat: delete provider sessions when closing quick chats`

Deferred: deleting the in-memory client profile code (`_clientId`, the client
preferences service and the remote controller profile). See Learnings.

## Test strategy

- Migration steps: fixture in, expected out, per step; each step idempotent.
- Round trip: `fromSnapshot(toSnapshot(x))` equals `x`.
- Crash windows: `state.json` plus partial new files redoes cleanly; a newer
  `schemaVersion` refuses to write; a corrupt file stops startup.
- Persistence through `AppStatePersistence` for the new files.
- Consumers: the remote install script reads `settings.json`; the visualization
  service loads per repository.
- Just-in-time cleanup: mission delete and quick-chat close remove files and
  records, including a failure in the middle.
- A test confirms nothing reads subagent `operations` / `activities` before they
  are removed.
- Backup: a verified copy exists before any new file is written; a failing or
  unverifiable backup aborts the migration with the old file untouched.
- Follow `docs/testing.md`: no reading production source as text; fixtures are
  data.

## Risks

- A migration bug on the real file. Mitigated by the automatic backup, the
  fixture and the commit-point design. Rollback is restoring the backup into an
  older build.
- Remote hosts migrate their own home on first start of the new `clawd`; the
  forward-compat guard covers mixed versions.
- Removing operations and activities rests on a grep of their consumers; the
  test above is the gate.

## Learnings

- Audit before dropping. Several planned drops turned out to be deliberate:
  `statusText` and `contextUsage` are restored on purpose, `accountRateLimits`
  feeds the navigation, and the remote probe `status` is what makes remote teams
  usable after a restart because nothing re-probes at startup. Only fields with a
  verified owner or no reader were dropped.
- Compare against real data, not fixtures. Running the migration on a copy of the
  real file found that visualization order is not creation order, so each file
  carries a `position`. Everything else in the diff was an intended drop.
- Reuse the lenient sanitizers instead of rewriting them. The layout maps the
  persisted state to and from the files and then goes through
  `snapshotFromPersistedState`, so entity validation and repair stay in one place.
  The strict part is the file structure, the engine block and the version header;
  entities with an existing guard are checked as objects in the schema and are not
  frozen copies. When one of them changes incompatibly, copy the old shape into a
  versioned step at that moment. There is no lint rule enforcing frozen schemas yet.
- Intermediate versions are not needed. Only the unversioned file exists in the
  wild, so one migration reads it through the legacy reader and writes schema 1.
- Delete files before the state, not after. The planned reorder of mission delete
  was wrong: an existing test showed that failing to remove files leaves the
  mission listed and retryable, while deleting after the save would leak files
  forever. The same rule applies to quick chats: the provider session is deleted
  before the agent leaves the state.
- Protect shared homes with a marker. The dev and release builds share
  `~/.codex-claw`. Replacing `state.json` with a non-JSON marker makes older
  builds fail to start instead of silently creating an empty state over migrated
  data. Restoring a backup as `state.json` re-runs the migration.
- Removing client profiles is not only persistence. Navigation, ordering,
  `_clientId`, the remote controller profile and many tests are built on them. The
  store persists the desktop profile's effective view as the shared state, which is
  the single-client design on disk, and leaves the in-memory profiles in place
  until their callers are audited.
- Agents without a git repository keep their visualizations inline in the roster;
  only repository libraries are split into files.
- A new field on `Agent` fails the build until `persistence/agent-fields.ts`
  classifies it as persisted, derived or runtime, and a persisted field must exist
  on `PersistedAgent`. That is the direct fix for fields that changed the file
  format without anyone deciding.
