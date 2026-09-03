# Backend Protocol

Status: current backend JSON-RPC protocol, 2026-06-17.

This document catalogs the app-owned protocol between clients and `clawd`.
Electron can reach this protocol through `ClawBackendProcessClient` over stdio
JSONL or through the local `clawd serve` Unix socket daemon. Future desktop,
web, mobile, SSH, or network clients should use the same app methods instead of
depending on Electron IPC or local filesystem access.

The protocol is JSON-RPC 2.0 framed one JSON message per line for stdio and the
local Unix socket:

```json
{ "jsonrpc": "2.0", "id": 1, "method": "snapshot/get" }
```

Requests receive either:

```json
{ "jsonrpc": "2.0", "id": 1, "result": {} }
```

or:

```json
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32603, "message": "..." } }
```

Supported error codes are defined in
`shared/src/backend-protocol/rpc.ts`: parse error, invalid request, method not
found, invalid params, internal error, backend unavailable, and timeout.

Method names use `resource[/subresource]/verb`. Multiword path segments are
lower camel case, and the action belongs at the end of the path. Method values
are centralized in `shared/src/backend-protocol/methods.ts`.

This protocol version is a breaking dev-mode cleanup. There are no legacy
aliases for older names such as `bench/snapshot`, `agent/listFiles`, or
`backend/event`; stale local or remote `clawd` daemons must be restarted or
synced after this change.

## Direction Rules

- Client to `clawd`: app-owned product requests such as `agent/prompt/send`,
  `source/worktrees/list`, and `workProvider/items/list`.
- `clawd` to client notifications: currently `backend/event/notify`, carrying
  sequenced app-owned events and optional recovery snapshots.
- `clawd` to client requests: narrow host callbacks for native affordances
  that the connected client must perform, currently Electron browser opening
  and macOS permission surfaces.
- Backend-internal driver RPC: `driver/*`, `source/folder/detect`, and
  `agent/folder/validate` are accepted by the server through the driver RPC
  fallback, but client code should prefer the app-level methods unless this
  document explicitly marks a method public.

## Common Result Types

- `AppSnapshot`: authoritative product snapshot owned by `clawd`.
- `ClientState`: backend-derived client hints:
  `{ sourceFolderPath, shouldPreventDisplaySleep,
  shouldPreventDisplaySleepForRemoteAccess? }`. The first sleep hint represents
  active-agent work and applies on either power source. The remote-access hint
  is true only when `general.preventSleepWhenRemoteAccessEnabled` is enabled
  and Codex remote control is connected; Electron applies that reason only on
  AC power. Keeping the reasons separate prevents the remote-access power policy
  from changing the existing agent-activity behavior.
- `ClawSnapshotGetResult`: `{ snapshot, lastEventSeq, clientState }`. Its
  `snapshot` is a valid `AppSnapshot` with `messages: []`; transcripts are
  deliberately excluded from synchronization frames.
- `AutomationLocation`: optional automation/work-provider location selector:
  `{ kind: "local" }` or `{ kind: "remote", remoteConnectionId }`.
- `BenchLocation`: optional Bench catalog location selector with the same
  shape as `AutomationLocation`. Bench locations are derived from the active or
  target team in the desktop UI.
- `ClawBackendEvent`: event sent to clients:
  `{ seq, type, payload, occurredAt, agentId?, backend?, backendSessionId?,
  threadId?, turnId?, clientState?, snapshot? }`.

State-mutating public methods generally return `AppSnapshot`. The returned
snapshot is authoritative. Between snapshots, clients replay only sequenced
clawd-authored app events through the shared deterministic reducer.

Electron and the renderer both synchronize with a subscribe-buffer-snapshot
barrier: subscribe first, buffer notifications while reading `snapshot/get`,
discard buffered events at or below `lastEventSeq`, then apply only contiguous
events above it. A gap triggers a fresh snapshot barrier. Duplicate deltas are
therefore never replayed after reconnect or renderer reload. The selected
conversation is restored separately through `agent/history/hydrate`, keeping
the synchronization barrier bounded even for very long threads.

## Client To `clawd`: Core

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `backend/health/get` | none | `ClawBackendHealth` | Liveness and version check. |
| `snapshot/get` | none | `ClawSnapshotGetResult` | Initializes source folder if needed and returns the authoritative transcript-free synchronization snapshot (`messages: []`). |
| `client/state/get` | none | `ClientState` | Backend-derived client hints only. |
| `client/request/respond` | `{ response: ClientRequestResponse }` | `AppSnapshot` | Resolves a provider-owned approval/ask-user request or an app-owned work-routing choice. |
| `mcp/workRouting/respond` | `{ response: ClientRequestResponse }` | `AppSnapshot` | Internal local/remote `clawd` route that applies the selected branch/worktree behavior and resolves the blocked MCP tool. |

## Client To `clawd`: System

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `system/permissions/get` | none | `SystemPermissionsStatus` | App-facing permission API owned by `clawd`; desktop status may be delegated to Electron. |
| `system/permissions/accessibility/open` | none | `SystemPermissionsStatus` | Opens native settings through a client callback, then returns status. |

## Client To `clawd`: Agents

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `agent/create` | `{ input: CreateAgentInput }` | `AppSnapshot` | Creates the agent in the owning team's backend location. For remote-team pointers, local `clawd` forwards creation to the remote `clawd` with the remote team id and does not persist a local proxy agent. |
| `agent/quickChat/create` | `{ input: CreateQuickChatInput }` | `AppSnapshot` | Creates a team-scoped quick chat in a private backend-managed scratch workspace and persists its non-project identity across restarts. |
| `agent/update` | `{ input: UpdateAgentInput }` | `AppSnapshot` | Validates folder and refreshes git status. |
| `agent/select` | `{ agentId }` | `AppSnapshot` | Selects, hydrates history, and refreshes git status. |
| `agent/duplicate` | `{ agentId }` | `AppSnapshot` | Duplicates product agent configuration directly below the source agent. |
| `agent/fork` | `{ agentId, messageIndex? }` | `AppSnapshot` | Forks an idle agent's backend conversation, optionally at an absolute host message index, into a new selected agent directly below the source. |
| `agent/team/move` | `{ input: MoveAgentToTeamInput }` | `AppSnapshot` | Moves a local agent between local teams. Cross-backend moves are rejected; create a new agent in the target remote team instead. |
| `agent/reorder` | `{ input: ReorderAgentsInput }` | `AppSnapshot` | Reorders within a team. |
| `agent/delete` | `{ agentId, input? }` | `AppSnapshot` | Removes the product agent and, when explicitly confirmed, its clean linked worktree, local branch, and optional tracked remote branch. |
| `agent/folder/update` | `{ agentId, folder }` | `AppSnapshot` | Folder picker remains client-side; mutation and validation are backend-owned. |
| `agent/files/list` | `{ agentId }` | `AgentFileSearchItem[]` | Lists files under the agent folder. |
| `agent/file/preview` | `{ agentId, filePath }` | `AgentFilePreviewResult` | Reads a backend-owned agent resource. The backend confines relative and absolute inputs (including resolved symlinks) to the agent workspace, caps preview bytes, and classifies text, image, binary, and oversized results. Clients must not read workspace files directly. |
| `agent/models/list` | `{ agentId }` | `BackendModelOption[]` | Provider-specific catalog adapted to app-owned shape. |
| `agent/skills/list` | `{ agentId }` | `BackendSkillSummary[]` | Provider-specific skills adapted to app-owned shape. |
| `agent/git/diff/open` | `{ agentId }` | `true` | Emits a working-tree review event from backend-owned git state. |
| `agent/git/workflow/get` | `{ agentId }` | `AgentGitWorkflow` | Reads local branch, remote, staged/unstaged files, linked-worktree state, and GitHub connection without spending remote API quota. |
| `agent/git/stage` | `{ agentId, input: { paths, confirmed } }` | `AgentGitWorkflow` | Stages explicitly selected repository-relative paths; rejects unconfirmed requests. |
| `agent/git/commit` | `{ agentId, input: { message, confirmed } }` | `AgentGitWorkflow` | Creates a commit from the index with an explicit message and confirmation. |
| `agent/git/push` | `{ agentId, input: { confirmed, target? } }` | `AgentGitWorkflow` | Pushes the current named branch by default; `target: 'mergeTarget'` pushes the base branch produced by the preceding merge. Sets upstream when missing. |
| `agent/git/pullRequest/create` | `{ agentId, input: { title, body, confirmed } }` | `AgentGitWorkflow` | Performs one existing-PR lookup after confirmation, then creates a draft GitHub PR through the connected work-provider token. |
| `agent/git/merge` | `{ agentId, input: { strategy, commitMessage?, deleteBranch, deleteWorktree, confirmed } }` | `AgentGitWorkflow` | Merges the current branch into a checked-out base worktree when one exists, otherwise switches the primary checkout to a local integration branch first. Squash merges require the explicit commit message, and worktree cleanup is accepted only from a linked worktree. |
| `agent/workItem/assign` | `{ agentId, item }` | `AppSnapshot` | Records provider-neutral work item assignment in the owning backend location. Remote assignments are projected for connected remote-team pointers. |
| `agent/workItem/assignment/delete` | `{ item }` | `AppSnapshot` | Clears provider-neutral assignment state from the backend location that owns the assigned agent. |

## Client To `clawd`: Conversations And Turns

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `agent/restart` | `{ agentId }` | `AppSnapshot` | Clears app-visible conversation state and forgets backend session. |
| `agent/history/hydrate` | `{ agentId }` | `AppSnapshot` | Lazily restores persisted session history without selecting the agent. |
| `agent/history/load-older` | `{ agentId }` | `{ hasOlder }` | Loads one older provider history page; message batches arrive through `thread.historyLoaded`. |
| `agent/conversations/list` | `{ agentId }` | `ConversationSummary[]` | Lists provider history through the active agent backend. |
| `agent/conversation/resume` | `{ agentId, ref: BackendConversationRef }` | `AppSnapshot` | Validates backend match and idle status, then replaces visible history. |
| `agent/conversation/messages/get` | `{ agentId, ref }` | `RendererMessage[]` | Reads historical messages through the owning backend. |
| `agent/prompt/send` | `{ agentId, prompt, options? }` | `AppSnapshot` | Starts a backend turn when idle, or appends to the backend-owned per-agent queue while busy. |
| `agent/prompt/steer` | `{ agentId, prompt }` | `AppSnapshot` | Sends active-turn steering and emits `message.steer`. |
| `agent/queuedPrompt/update` | `{ agentId, promptId, prompt }` | `AppSnapshot` | Updates the text of an existing backend-owned queued prompt without changing its ID or queue position. |
| `agent/queuedPrompt/steer` | `{ agentId, promptId, prompt? }` | `AppSnapshot` | Atomically steers the stored or edited queued prompt and dequeues it only after acceptance. |
| `agent/queuedPrompt/delete` | `{ agentId, promptId }` | `AppSnapshot` | Deletes a prompt from the backend-owned queue. |
| `agent/interrupt` | `{ agentId }` | `AppSnapshot` | Interrupts the active backend turn if supported. |
| `agent/turn/rollback` | `{ agentId, turnId }` | `AppSnapshot` | Resolves the owning backend location, rolls back provider history, and replaces visible history. |
| `agent/message/delete` | `{ agentId, messageId }` | `AppSnapshot` | Resolves the owning backend location, maps message to turn, rolls back, and persists. |
| `agent/message/update` | `{ agentId, messageId, prompt }` | `AppSnapshot` | Resolves the owning backend location, rolls back, then sends edited prompt. |
| `agent/message/retry` | `{ agentId, messageId }` | `AppSnapshot` | Resolves the owning backend location, rolls back, then resends the matching user prompt. |
| `agent/goal/update` | `{ agentId, objective }` | `AppSnapshot` | Sets provider goal metadata and updates agent goal state. |
| `agent/goal/clear` | `{ agentId }` | `AppSnapshot` | Clears provider goal metadata and agent goal state. |
| `agent/approvalPreset/update` | `{ agentId, preset: ApprovalPreset }` | `AppSnapshot` | Applies app-owned approval preset through the backend driver. |

## Client To `clawd`: Teams And Bench

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `team/create` | `{ input: CreateTeamInput }` | `AppSnapshot` | Creates and selects a team. Omitted `remoteConnectionId` creates a local team. With `remoteConnectionId`, local `clawd` creates a real team on the remote `clawd` or connects to `input.remoteTeamId`, then persists only a local pointer `{ remoteConnectionId, remoteTeamId }`. |
| `team/update` | `{ input: UpdateTeamInput }` | `AppSnapshot` | Updates name/color and, while the team has no local or remote agents, the optional team connection. Changing an empty local team to a remote connection creates a real remote team or connects to `input.remoteTeamId`, then stores the remote pointer; connection changes are rejected once either side has agents. |
| `team/reorder` | `{ input: ReorderTeamsInput }` | `AppSnapshot` | Reorders team rail state. |
| `team/delete` | `{ teamId }` | `AppSnapshot` | Deletes the team in its owning backend location. For remote pointers, this calls remote `team/delete` for `remoteTeamId`, then removes the local pointer. If that pointer is the only local team, local `clawd` creates an empty Local fallback first. |
| `team/disconnect` | `{ teamId }` | `AppSnapshot` | Removes only the local remote-team pointer and leaves the remote team/agents running. If that pointer is the only local team, local `clawd` creates an empty Local fallback first. Local teams use `team/delete`. |
| `team/select` | `{ teamId }` | `AppSnapshot` | Selects team and active agent. |
| `snapshot/bench/get` | `{ location? }` | `AppSnapshot` | Returns the selected `clawd` Bench catalog. Remote Bench snapshots are not adopted as the local product snapshot. |
| `bench/agent/template/create` | `{ agentId }` | `AppSnapshot` | Saves the agent as a deployable template in the agent team's `clawd` Bench. Remote agents are saved by the remote `clawd`; local `clawd` does not serialize a proxy copy. |
| `bench/template/create` | `{ input: CreateBenchTemplateInput }` | `AppSnapshot` | Creates a template directly in the receiving `clawd` Bench. Clients should prefer `bench/agent/template/create` when saving an existing agent. |
| `bench/template/deploy` | `{ templateId, teamId?, location? }` | `AppSnapshot` | Resolves and deploys the template in the target team's backend location. Remote deployment creates the agent on the remote `clawd`; local `clawd` returns a projected snapshot for the local team pointer. |
| `bench/template/delete` | `{ templateId, location? }` | `AppSnapshot` | Removes template from the selected `clawd` Bench. Remote removes return the remote snapshot without replacing local product state. |

Bench belongs to a `clawd` instance, not to Electron globally. Local teams can
deploy only from local Bench; teams with `Team.remoteConnectionId` can deploy
only from that remote `clawd` Bench. Cross-location template copy is not part
of the current protocol.

## Client To `clawd`: Settings And Source Repositories

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `settings/update` | `{ input: UpdateSettingsInput }` | `AppSnapshot` | Updates general/theme/source settings. |
| `settings/codexResourceSharing/get` | none | `CodexResourceSharingStatus` | Reports whether an enabled existing home still needs explicit migration. |
| `settings/codexResourceSharing/set` | `{ input: { enabled: true } \| { enabled: false, mode: "fresh" \| "copy" \| "keep" } }` | `AppSnapshot` | Links or isolates Claw skills/plugins; folder-changing modes require idle chats. |
| `source/folders/list` | `{ path?, remoteConnectionId? }` | `SourceFolderListing` | Lists child directories from local or remote `clawd`; when `path` is omitted, the target backend starts at its `$HOME`. Used by renderer fake folder pickers without desktop filesystem access. |
| `source/repositories/list` | `{ remoteConnectionId? }` | `SourceRepository[]` | Scans the configured source folder in local `clawd` or the selected remote `clawd`; each repository may include a canonical credential-free `remoteIdentity` for exact remote matching. |
| `source/worktree/path/suggest` | `{ input: { repoPath, branchName, remoteConnectionId? } }` | `string` | Backend-owned path policy in local or remote location. |
| `source/worktrees/list` | `{ repoPath, remoteConnectionId? }` | `SourceWorktree[]` | Runs `git worktree list --porcelain` in local or remote `clawd`. |
| `source/worktree/create` | `{ input: CreateSourceWorktreeInput }` | `SourceWorktree` | Runs `git worktree add` in local or remote `clawd`. Local creations persist recent repo metadata. |

Folder and save dialogs are not backend protocol messages. Electron may return
selected paths through desktop IPC, but all validation, listing, creation, and
state mutation happen in `clawd`.

Snapshot agents may persist an optional `conversationTitle` for the current
provider session. This display metadata is updated locally before the
best-effort provider title update, so a slow provider request never blocks the
renderer. Agent `name` remains an optional custom label; `null` restores the
branch or folder-derived display fallback.

When the source folder path is unset or was persisted as empty, `clawd`
initializes it before repository listing by trying `~/src`, `~/code`, `~/dev`,
and `~/sources` first.

## Client To `clawd`: Remote Connections

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `connections/sshHosts/list` | none | `SshHostCandidate[]` | Parses the backend host's `~/.ssh/config` and returns concrete `Host` aliases. Wildcard and negated patterns are ignored. |
| `connections/ssh/create` | `{ input: AddSshConnectionInput }` | `AppSnapshot` | Saves an SSH connection, probes the host non-interactively, syncs the bundled `clawd` script and provider token file under `~/.codex-claw`, and records an `ssh` stdio transport when ready. |
| `connections/sync` | `{ connectionId }` | `AppSnapshot` | Syncs a saved SSH connection: closes any cached remote stdio client, uploads the bundled `clawd` script, mirrors `provider-tokens.json`, records the daemon-first SSH transport, reads the installed version, then asks the remote `clawd` to run `workProvider/connections/reload`. Sync does not start or restart a persistent remote daemon. Remote `clawd` hydrates `workBacklog.connections` from the mirrored tokens instead of copying local `state.json`. The renderer labels this action `Sync`. |
| `connections/update` | `{ connectionId, input: { sourceFolderPath? } }` | `AppSnapshot` | Updates SSH connection settings. Source-folder changes are forwarded to the remote `clawd` through `settings/update` and mirrored locally for settings UI defaults. |
| `connections/delete` | `{ connectionId }` | `AppSnapshot` | Removes a saved remote connection and removes local team pointers attached to it. Remote teams, agents, messages, and automations keep running on the SSH host. If every local team used that connection, local `clawd` creates one empty local fallback team first. |

Remote connection state is owned by `clawd`, not Electron. The SSH transport
command model is
`ssh <host> "node ~/.codex-claw/clawd.mjs connect || exec node ~/.codex-claw/clawd.mjs --stdio"`.
`connect` bridges to the remote host's `~/.codex-claw/clawd.sock` when an
externally managed `clawd serve` daemon is running; otherwise the shell
fallback spawns one one-shot stdio backend for that SSH session.
Remote teams store a local pointer with `Team.remoteConnectionId` and
`Team.remoteTeamId`. Local `clawd` owns the connection list and the user's local
navigation pointers; the remote `clawd` owns the actual remote team composition,
agents, messages, sessions, MCP-visible membership, and remote Bench catalog.
`Team.id` is the local pointer id. `Team.remoteTeamId` is only the remote lookup
key and must not be used for local membership, active-agent repair, assignment
cleanup, or migrations because remote team ids can collide with local team ids.
Generic location-scoped requests first resolve an internal `BackendLocation`.
Agent-scoped requests resolve an internal `AgentLocation` so projected remote
agents can still route to the owning remote `clawd` over SSH stdio.
Remote backend events use the same boundary: local `clawd` forwards agent events
only when the remote agent belongs to a connected remote-team pointer.
Slash-command interception remains local-only for now; ordinary prompts route
remotely.

Bench follows the same team-owned `clawd` selection for catalogs, saves, and
removes. Deploying a remote Bench template creates the agent in the remote team;
local `clawd` projects the remote team's agents/messages into the local pointer
snapshot for clients.

The Automations surface selects its backend location independently. When the
client omits `location`, automation and work-provider calls operate on local `clawd`.
When the client passes `{ kind: "remote", remoteConnectionId }`, local `clawd`
forwards the automation request to that remote backend and returns the remote snapshot
without adopting it as the local product snapshot.

## Client To `clawd`: Work Providers

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `workProvider/connect` | `{ provider }` | `WorkProviderConnectResult` | Starts provider connection such as GitHub device flow. |
| `workProvider/authorization/open` | `{ provider }` | `AppSnapshot` | Requests browser opening through `client/external/open`. |
| `workProvider/connection/complete` | `{ provider }` | `AppSnapshot` | Polls/completes pending provider auth. |
| `workProvider/connections/reload` | none | `AppSnapshot` | Rehydrates provider connection metadata from token storage after token files are mirrored, without restarting `clawd`. |
| `workProvider/disconnect` | `{ provider }` | `AppSnapshot` | Removes provider connection and token. |
| `workProvider/repositories/list` | `{ provider, location? }` | `WorkRepository[]` | Lists provider repositories from local `clawd` or the selected remote automation location. |
| `workProvider/backlog/configure` | `{ input: WorkBacklogConfigurationInput, location? }` | `AppSnapshot` | Saves backlog configuration in local `clawd` or the selected remote automation location. Remote snapshots are returned but not adopted as local product state. |
| `workProvider/items/list` | `{ provider, repositoryId, location? }` | `WorkItem[]` | Lists provider work items from local `clawd` or the selected remote automation location. |
| `workProvider/globalItems/list` | `{ provider, location?, query? }` | `WorkItemPage` | Lists one numbered page plus its exact total across visible repositories; Cockpit uses it instead of repository fan-out. |

## Client To `clawd`: Automations

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `snapshot/automations/get` | `{ location? }` | `AppSnapshot` | Returns the local or remote automation-management snapshot for the selected Automations screen location. Remote snapshots are not adopted locally. |
| `automation/create` | `{ input: CreateAutomationInput, location? }` | `AppSnapshot` | Creates scheduler configuration in local `clawd` or the selected remote automation location. |
| `automation/update` | `{ input: UpdateAutomationInput, location? }` | `AppSnapshot` | Updates scheduler configuration in local `clawd` or the selected remote automation location. |
| `automation/run` | `{ automationId, location? }` | `AppSnapshot` | Runs one automation immediately in local `clawd` or the selected remote automation location. |
| `automation/due/run` | none | `AppSnapshot` | Runs due automations. Used by backend scheduler and tests. |
| `automation/history/clear` | `{ automationId, location? }` | `AppSnapshot` | Clears execution history in local `clawd` or the selected remote automation location. |
| `automation/execution/delete` | `{ automationId, executionId, location? }` | `AppSnapshot` | Deletes one execution log entry in local `clawd` or the selected remote automation location. |
| `automation/delete` | `{ automationId, location? }` | `AppSnapshot` | Deletes scheduler configuration in local `clawd` or the selected remote automation location. |

The Electron renderer exposes this as `Automations > Local|<remote>`. Create/edit
forms use the selected location's teams, bench templates, source repositories,
work-provider repositories, work items, and remote folder picker data. Automation
history conversation previews pass the same location to
`agent/conversation/messages/get`.

## Client To `clawd`: Backend-Internal Driver RPC

These methods are implemented by `BackendDriverRpc` and may currently be
reachable through the server fallback. Treat them as backend-internal
implementation messages, not the preferred app protocol for clients.

| Method | Params | Result |
| --- | --- | --- |
| `driver/files/list` | `{ folder }` | `AgentFileSearchItem[]` |
| `driver/file/preview` | `{ folder, filePath }` | `AgentFilePreviewResult` |
| `agent/folder/validate` | `{ folder }` | `null` |
| `driver/git/status/get` | `{ agent }` | `AgentGitStatus | null` |
| `driver/git/diff/get` | `{ agent }` | `AgentGitDiff | null` |
| `driver/promptCommand/handle` | `{ agent, prompt }` | `BackendSendResult | null` |
| `driver/prompt/send` | `{ agent, prompt, options? }` | `BackendSendResult` |
| `driver/conversation/title/update` | `{ agent, title }` | `null` |
| `driver/goal/update` | `{ agent, objective }` | `BackendGoalResult` |
| `driver/goal/clear` | `{ agent }` | `BackendGoalResult` |
| `driver/approvalPreset/update` | `{ agent, preset }` | `BackendApprovalPresetResult` |
| `driver/session/forget` | `{ backend, agentId }` | `null` |
| `driver/interrupt` | `{ agent }` | `BackendSendResult` |
| `driver/clientRequest/respond` | `{ backend, response }` | `null` |
| `driver/history/hydrate` | `{ agent }` | `BackendSession | null` |
| `driver/history/load-older` | `{ agent }` | `{ hasOlder }` |
| `driver/conversations/list` | `{ agent }` | `ConversationSummary[]` |
| `driver/conversation/resume` | `{ agent, ref }` | `BackendConversationResumeResult` |
| `driver/conversation/fork` | `{ agent, messageIndex? }` | `BackendConversationResumeResult` |
| `driver/conversation/messages/get` | `{ ref, agentId }` | `RendererMessage[]` |
| `driver/prompt/steer` | `{ agent, prompt }` | `BackendSendResult` |
| `driver/turn/rollback` | `{ agent, turnId }` | `BackendRollbackResult` |
| `driver/models/list` | `{ agent }` | `BackendModelOption[]` |
| `driver/skills/list` | `{ agent }` | `BackendSkillSummary[]` |
| `source/folder/detect` | none | `string | null` |
| `source/repositories/list` | `{ sourceFolderPath }` | `SourceRepository[]` |
| `source/worktree/path/suggest` | `{ input: { repoPath, branchName } }` | `string` |
| `source/worktrees/list` | `{ repoPath }` | `SourceWorktree[]` |
| `source/worktree/create` | `{ input: CreateSourceWorktreeInput }` | `SourceWorktree` |

## `clawd` To Client Notifications

`clawd` sends one notification method:

| Method | Params | Notes |
| --- | --- | --- |
| `backend/event/notify` | `ClawBackendEvent` | Sequenced app-owned event for renderer/UI state. Includes small backend-derived `clientState`; `snapshot` is an optional compatibility or recovery checkpoint rather than accompanying each incremental event. |

Routine `snapshot.updated` notifications carry `AppSnapshotMetadata`, which
explicitly excludes conversation messages. Transcripts move through
`thread.historyLoaded` and the incremental message/item events instead. Agent
selection, history hydration, prompt submission, and steering likewise return
metadata-only acknowledgements so those hot paths never echo the full cached
transcript back through stdio and Electron IPC.

Event `type` values are the app-owned `MainToRendererEvent['type']` union from
`shared/src/contracts.ts`. Current emitted examples include:

- backend and agent status: `backend.statusChanged`, `agent.updated`,
  `snapshot.updated`, `agent.statusChanged`;
- thread and turn lifecycle: `thread.started`, `thread.historyLoaded`,
  `thread.settingsUpdated`, `thread.modeUpdated`, `thread.goalUpdated`,
  `thread.goalCleared`, `thread.tokenUsageUpdated`, `turn.started`,
  `turn.planUpdated`, `turn.proposedPlanDelta`,
  `turn.proposedPlanCompleted`, `turn.completed`;
- message and item streaming: `message.userSubmitted`, `message.delta`, `message.steer`,
  `item.started`, `item.updated`, `item.completed`;
- approvals and requests: `backendApproval.requested`,
  `backendApproval.resolved`, `approval.requested`, `toolInput.requested`,
  `workRouting.requested`, `workRouting.resolved`;
- backend-owned prompt queue: `agent.promptQueued`, `agent.promptDequeued`,
  `agent.promptRetryScheduled`;
- artifacts and account state: `diff.updated`, `sidePanel.markdownRequested`,
  `sidePanel.gitDiffRequested`, `git.statusUpdated`,
  `context.compactionStarted`,
  `account.rateLimitsUpdated`, `skills.changed`;
- native browser feedback: `browser.annotationCreated` (ephemeral element or area metadata that the renderer queues for a batched agent prompt);
- work backlog: `workBacklog.assignmentUpdated`;
- failures: `error`.

Execution task-list lifecycle is app-owned: `turn.planUpdated` derives
completion only when every structured step is completed, and `turn.completed`
finalizes remaining execution plans as incomplete, interrupted, or failed.
Proposed Plan-mode documents use the separate proposed-plan events and are not
interpreted as execution task-list completion.

Clients must ignore unknown event types and refresh via `snapshot/get` if they
detect sequence gaps.

The desktop reconnects the same selected socket or bundled-process transport
with bounded exponential backoff. It does not silently fall back to a fresh
bundled daemon after an established daemon connection drops, because doing so
would fork the authoritative runtime state.

## `clawd` To Client Requests

These are backend-initiated JSON-RPC requests sent from `clawd` to the
connected client. They are host callbacks, not general product APIs. Electron
implements the callbacks today; future clients can implement the subset that
matches their platform capabilities.

| Method | Params | Result | Owner |
| --- | --- | --- | --- |
| `client/external/open` | `{ url }` | `true` | Electron opens the URL with `shell.openExternal`. |
| `client/browser/open` | `{ agentId, browserId, url }` | `BrowserState` | Electron asks the renderer to mount or navigate that agent/browser workspace without changing the selected agent, and resolves after its sandboxed page loads. |
| `client/browser/execute` | `{ agentId, browserId, command, arguments }` | command-specific result | Electron operates on the addressed agent/browser `WebContentsView`, including while its workspace is hidden. |
| `client/spokenAnnouncement/queue` | `{ agentId, phase: "start" \| "finish", text, voice }` | `{ queued, reason? }` | Electron validates the bounded phrase and curated voice, then returns when its native no-overlap queue accepts or rejects it; playback completion is not part of this request. |
| `client/system/permissions/get` | none | `SystemPermissionsStatus` | Electron reads native permission status. |
| `client/system/permissions/accessibility/open` | none | `SystemPermissionsStatus` | Electron opens native settings and returns status. |

If a client request method is unknown, the client responds with JSON-RPC
`methodNotFound`. If the native callback throws, Electron responds with
`internalError`.

## Ownership Notes

- `clawd` owns request IDs for requests it sends to Electron.
- Electron owns request IDs for requests it sends to `clawd`.
- Product state belongs to `clawd`. Electron and renderer may cache only
  backend snapshots and replay clawd-authored app events; neither client
  persists or independently invents product mutations.
- Filesystem reads, git commands, provider tokens, provider protocol calls,
  automations, scheduler execution, and transcription helper execution belong to
  `clawd`.
- Electron owns only native desktop affordances: windows, menus, shortcuts,
  dialogs, `openExternal`, native permission callbacks, native speech helper
  lifecycle/audio playback, process launching, and transport plumbing.
