# Agent session lifecycle

Research snapshot: Claw `cb94e295`, codex-app-sdk `0410ca2d`, upstream Codex
`c888e8e7` (2026-09-08).

## Decision

**Archive the current provider conversation when the user restarts or closes a
Codex agent, and make Resume Session search both active and archived
conversations. Selecting an archived conversation must unarchive it before
resuming it.**

Do this through `codex-app-sdk`; Claw must not scan, move, index, or otherwise
own Codex rollout files. Claw owns the product transaction (restart, close, or
switch session), while its Codex adapter delegates archive, unarchive, list,
search, and resume to the SDK. App relaunch is not an agent restart and must
continue hydrating the existing session without archiving it.

This gives the lifecycle the UI already implies:

| User action | Current conversation | Claw agent |
| --- | --- | --- |
| Quit/relaunch Claw | remains active and is hydrated | remains |
| Restart Agent | archived, then detached | remains; next prompt creates a new conversation |
| Close Agent | archived, then detached | removed |
| Resume active session | resumed directly | points to selected session |
| Resume archived session | unarchived, then resumed | points to selected session |

The SDK already exposes every required primitive, so an SDK change is not a
prerequisite. A future SDK convenience such as `restoreConversation(id)` could
make unarchive-plus-load transactional for all hosts, but Claw should not wait
for it and should not reimplement SDK conversation state.

## What Claw does today

### Restart detaches but does not archive

`restartAgentConversation` requires an idle agent, clears all runtime state
(including `backendSession`), and returns the agent to idle
([core/src/agent-manager.ts](../../core/src/agent-manager.ts#L476-L486)). The
backend then invokes only `driverConversationRelease`
([backend/src/server.ts](../../backend/src/server.ts#L825-L831)). For Codex,
forgetting unsubscribes the adapter and calls SDK `forgetConversation`; it does
not call archive
([backend/src/codex/codex-surface-adapter.ts](../../backend/src/codex/codex-surface-adapter.ts#L358-L375)).

Result: Restart Agent creates a new conversation on the next prompt, but the old
conversation stays in the normal, non-archived provider catalog.

### Close removes Claw state but does not archive

Close validates optional worktree cleanup, forgets the live provider session,
optionally deletes the worktree, and removes the agent from the snapshot
([backend/src/server.ts](../../backend/src/server.ts#L700-L725)). The snapshot
mutation removes the agent, team membership, selection, and work assignments
([core/src/agent-manager.ts](../../core/src/agent-manager.ts#L512-L533)). Its
regression test explicitly describes this as closing “without retiring the
conversation”
([backend/src/__tests__/server-agent-requests.spec.ts](../../backend/src/__tests__/server-agent-requests.spec.ts#L205-L251)).

This is intentional current behavior, introduced by `2108c97` (`fix: preserve
conversations when closing agents`), not a recent accidental omission. It
reversed the archive-on-close behavior introduced two days earlier. Current
architecture documentation matches the code
([docs/architecture.md](../architecture.md#L386-L388)), but the release history
still says closing an agent archives its Codex conversation
([CHANGELOG.md](../../CHANGELOG.md#L246-L251)). The product contract is therefore
internally inconsistent and no longer matches the desired lifecycle.

### Resume Session excludes archives and performs a shallow search

The Codex adapter asks the SDK for at most 30 conversations with the agent's
expanded folder as `cwd`
([backend/src/codex/codex-surface-adapter.ts](../../backend/src/codex/codex-surface-adapter.ts#L460-L470),
[agentCwd](../../backend/src/codex/codex-surface-adapter.ts#L1626-L1635)). It
does not pass `archived`, so the SDK defaults to `archived: false`
([codex-surface-conversations-controller.ts](../../../codex-app-sdk/packages/backend/src/node/codex-surface-conversations-controller.ts#L276-L300)).

The UI then:

- removes spawned child conversations (`parentConversationId`);
- searches only the already-fetched 30 rows, by title and id; and
- allows resume only for an idle agent and a non-current session.

See [use-session-history.ts](../../vue/src/components/use-session-history.ts#L23-L29),
[use-session-history.ts](../../vue/src/components/use-session-history.ts#L44-L55),
and [use-session-history.ts](../../vue/src/components/use-session-history.ts#L65-L95).
The current app-owned `ConversationSummary` has no archived-state field
([core/src/contracts/conversation.ts](../../core/src/contracts/conversation.ts#L49-L73)).

Consequences:

1. sessions abandoned by Close, Restart, or switching Resume Session accumulate
   in the default provider catalog;
2. sessions archived by Compress Session or another client are invisible in
   Resume Session; and
3. typing in the dialog cannot find a match outside the newest 30 rows even
   though app-server and the SDK support server-side search.

## What Codex and the SDK support

### Archive storage and discovery

The SDK exposes:

- `listConversations({ archived, cwd, limit, searchTerm })`;
- `archiveConversation(id)`;
- `unarchiveConversation(id)`; and
- normal conversation load/resume.

The public option type is
[ListCodexConversationsOptions](../../../codex-app-sdk/packages/core/src/surface.ts#L845-L850),
and the Node surface delegates these operations to its conversation controller
([codex-surface.ts](../../../codex-app-sdk/packages/backend/src/node/codex-surface.ts#L551-L573)).
The controller sends `archived`, `cwd`, `searchTerm`, newest-first sorting, and
cursor pagination directly to `thread/list`
([codex-surface-conversations-controller.ts](../../../codex-app-sdk/packages/backend/src/node/codex-surface-conversations-controller.ts#L276-L301)).

For the local app-server store, archive is a real filesystem lifecycle owned by
Codex:

- active rollouts live below `$CODEX_HOME/sessions`;
- archive moves the rollout, preserving its filename, into
  `$CODEX_HOME/archived_sessions` and marks it archived in the state database
  ([archive_thread.rs](../../../codex/codex-rs/thread-store/src/local/archive_thread.rs#L11-L60),
  [rollout/lib.rs](../../../codex/codex-rs/rollout/src/lib.rs#L23-L25));
- active and archived catalogs are queried separately
  ([list_threads.rs](../../../codex/codex-rs/thread-store/src/local/list_threads.rs#L151-L205));
- search selects the corresponding root before scanning
  ([search.rs](../../../codex/codex-rs/rollout/src/search.rs#L27-L61)); and
- unarchive reconstructs the dated `sessions/YYYY/MM/DD` location, moves the
  rollout back, and updates state metadata
  ([unarchive_thread.rs](../../../codex/codex-rs/thread-store/src/local/unarchive_thread.rs#L15-L94)).

Claw should never depend on these paths. They are evidence that the provider
already owns the special archive folder and index; direct Claw filesystem code
would duplicate the provider and fail for remote or future stores.

### An archived thread is recoverable, but not directly resumable

Archive is reversible in the SDK contract
([SDK conversation guide](../../../codex-app-sdk/docs/guide/conversations.md#L224-L233)).
However, app-server deliberately rejects `thread/resume` for an archived id and
tells the caller to unarchive first
([thread_resume.rs](../../../codex/codex-rs/app-server/tests/suite/v2/thread_resume.rs#L1308-L1357)).
The supported sequence is therefore:

1. `thread/list { archived: true, ... }`;
2. `thread/unarchive`;
3. `thread/resume`.

Archived history can also be inspected without restoring it: app-server's
`thread/read`, `thread/turns/list`, and `thread/items/list` paths deliberately
include archived storage
([thread_processor.rs](../../../codex/codex-rs/app-server/src/request_processors/thread_processor.rs#L2329-L2495)).
That permits previews in an archive picker without changing lifecycle state.

An upstream integration test demonstrates archive -> unarchive -> resume from a
second app-server connection
([thread_archive.rs](../../../codex/codex-rs/app-server/tests/suite/v2/thread_archive.rs#L511-L613)).
The SDK invalidates its old runtime/handle when a thread is archived, and a
fresh handle works after unarchive
([codex-surface-concurrency-integration.spec.ts](../../../codex-app-sdk/packages/backend/tests/codex-surface-concurrency-integration.spec.ts#L181-L212)).

Archive also shuts down a currently loaded thread before moving its rollout and
archives its spawned descendants
([thread_processor.rs](../../../codex/codex-rs/app-server/src/request_processors/thread_processor.rs#L863-L883),
[thread_processor.rs](../../../codex/codex-rs/app-server/src/request_processors/thread_processor.rs#L1420-L1509)).
That makes archive suitable for retirement, but it means a busy Close is a
stop-and-archive operation, not a harmless catalog toggle.

### Mobile/ChatGPT visibility needs one cross-client acceptance test

Nicolas's observation—that Claw threads appear in the mobile ChatGPT app—is
strong product evidence that leaving retired threads non-archived creates real
cross-client clutter. OpenAI's product documentation says supported desktop
Codex chats are available from the mobile app's Remote tab and that archiving a
Codex chat hides it from the history sidebar
([ChatGPT Work and Codex](https://help.openai.com/en/articles/20001275/),
[archive and delete Codex chats](https://help.openai.com/en/articles/20001333)).

The local sources prove only that `thread/archive` removes a thread from
app-server's default list and moves local persistence; that implementation does
not itself document the cross-client synchronization mechanism. SDK
documentation similarly limits its catalog promise to non-archived app-server
threads and explicitly excludes cloud-only conversations that app-server cannot
expose
([SDK conversation guide](../../../codex-app-sdk/docs/guide/conversations.md#L7-L17)).

Therefore the lifecycle is still the right design, but “archive hides it on
mobile” must be a manual cross-client acceptance test, not an assumption encoded
in unit tests or UI copy.

## Recommended implementation boundary

### App-owned contract

Restore a provider-neutral lifecycle seam behind `clawd`, rather than calling
Codex from Electron or Vue:

- add capability-gated driver operations to archive the agent's current
  conversation and restore an archived conversation;
- extend `ConversationSummary` with an app-owned lifecycle value such as
  `storageState: 'active' | 'archived'` (prefer this over an optional boolean);
- have list accept `{ storageState, searchTerm, limit }`, or expose one
  query that combines active and archived results; and
- keep Vue unaware of `thread/list`, SDK types, or Codex paths.

The Codex adapter implements those methods by calling the SDK. Claude can keep
its current local-transcript behavior until its provider exposes a real archive
primitive; capabilities should make that difference explicit rather than
pretending that moving arbitrary Claude files is equivalent.

### Product transactions

**Restart Agent**

1. Require idle (already enforced).
2. If there is a provider session, archive it through the driver.
3. Only after success, forget the SDK runtime, clear `backendSession`, and
   persist the agent.
4. If archive fails, leave the agent and reference unchanged.

**Close Agent**

1. Resolve and validate worktree/branch cleanup and shared-folder constraints.
2. If working, make the action explicitly stop the work, wait for a terminal
   state, then archive; do not silently detach a live conversation.
3. Archive before removing the agent. If subsequent worktree cleanup fails,
   best-effort unarchive and keep the agent; otherwise the retained agent would
   point to a thread that hydration refuses to resume.
4. Forget runtime and remove/persist the agent only after provider retirement
   and requested cleanup succeed.

**Resume Session / switch session**

1. Query top-level active and archived conversations for the agent folder.
2. Pass a non-empty title query to SDK `searchTerm` for both catalogs; do not
   filter an arbitrary 30-row window as the authoritative search. App-server
   defines this as an extracted-title substring search, so retain a separate
   exact-id path if thread-id lookup remains a product requirement
   ([thread.rs](../../../codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L1091-L1106)).
3. Display Active and Archived sections/badges.
4. For an archived target, unarchive it before load/resume.
5. Persist the selected ref only after load succeeds.
6. Archive the agent's displaced current conversation after the target is
   known-good but before changing the persisted agent reference, so repeated
   switches do not recreate the clutter.
7. If retiring the displaced conversation fails, rearchive the target when it
   was restored by this transaction and leave the agent attached to its
   original conversation. A successful switch should be all-or-nothing from
   the user's perspective.

The higher-level operations should own compensation and return the final
`BackendSession`; core snapshot helpers should not independently clear a ref
before external operations finish.

## Edge cases and recovery

- **No thread yet:** Close/Restart skips archive and proceeds.
- **Already archived externally:** treat “already archived” as idempotent
  retirement. On startup, if a persisted current ref resolves only in the
  archived catalog (for example after a crash), unarchive and hydrate it because
  an attached agent implies an active session.
- **Archive requires a rollout:** app-server archive fails for a started but
  unmaterialized thread. Do not discard the agent/ref on that failure; a thread
  with no accepted turn may be treated as having no durable session only when
  the SDK/app-server can prove that state.
- **Busy or approvals pending:** Close must visibly stop the thread before
  archive. Restart remains idle-only.
- **Spawned descendants:** Codex archives them with the root. Do not archive a
  root if any separate Claw agent is currently bound to its spawned subtree.
- **Forks:** app-server spawn descendants and ordinary forks are different
  relationships; verify both in integration tests rather than assuming archive
  cascade semantics.
- **Quick chats/no folder:** query the global catalog; use pagination/search to
  avoid loading every archive.
- **Remote agents:** call the remote driver/SDK. Never inspect the local
  `$CODEX_HOME` as a fallback.
- **Crash between external mutation and snapshot persistence:** reconcile on
  hydration and keep archive/unarchive idempotent. Provider history is durable,
  so this should create at worst catalog clutter, never transcript loss.

## Alternatives considered

1. **Keep today's detach-only behavior.** Lowest implementation risk, but it is
   the direct cause of catalog/mobile clutter and makes Restart semantically
   indistinguishable from abandoning a visible conversation. Rejected.
2. **Archive only on Close.** Reduces some clutter, but every Restart and session
   switch still leaks an active conversation. Rejected.
3. **Move/index rollout files in a Claw-specific archive folder.** Duplicates
   Codex's existing archive store, breaks SDK ownership and remote backends, and
   risks state-db corruption. Rejected.
4. **Delete retired sessions.** Prevents resume and is irreversible. Rejected.

## Verification matrix

Automated coverage should prove:

- Restart archives before detaching; archive failure leaves the current ref.
- Close archives before removal; failure leaves the agent and requested
  worktree intact, and a later cleanup failure compensates with unarchive.
- App quit/relaunch never archives an open agent's conversation.
- Resume lists and labels active plus archived sessions, excludes spawned
  children, and performs unarchive before resume.
- Search reaches matches older than 30 rows in both catalogs.
- Resume/load failure does not overwrite the current agent ref.
- Busy Close has explicit stop -> terminal -> archive ordering.
- Codex archive invalidates the SDK runtime once; Claw creates no parallel
  transcript or rollout index.
- Claude's capability-limited behavior remains unchanged.

Manual acceptance must include: create a recognizable Claw conversation, close
or restart its agent, confirm it leaves Claw's active Resume list, verify its
visibility in the mobile ChatGPT client, restore it from Claw's Archived list,
and verify both transcript continuity and mobile visibility after restoration.
