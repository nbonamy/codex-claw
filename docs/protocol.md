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
  app-owned events and optional backend-derived snapshots.
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
  `{ sourceFolderPath, shouldPreventDisplaySleep }`.
- `ClawSnapshotGetResult`: `{ snapshot, lastEventSeq, clientState }`.
- `LoopLocation`: optional loop/work-provider location selector:
  `{ kind: "local" }` or `{ kind: "remote", remoteConnectionId }`.
- `BenchLocation`: optional Bench catalog location selector with the same
  shape as `LoopLocation`. Bench locations are derived from the active or
  target team in the desktop UI.
- `ClawBackendEvent`: event sent to clients:
  `{ seq, type, payload, occurredAt, agentId?, backend?, backendSessionId?,
  threadId?, turnId?, clientState?, snapshot? }`.

State-mutating public methods generally return `AppSnapshot`. The returned
snapshot is authoritative; clients should adopt it rather than replay product
reducers locally.

## Client To `clawd`: Core

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `backend/health/get` | none | `ClawBackendHealth` | Liveness and version check. |
| `snapshot/get` | none | `ClawSnapshotGetResult` | Initializes source folder if needed and returns the authoritative snapshot. |
| `client/state/get` | none | `ClientState` | Backend-derived client hints only. |
| `client/request/respond` | `{ response: ClientRequestResponse }` | `AppSnapshot` | Resolves a provider-owned approval or ask-user request. |

## Client To `clawd`: System

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `system/permissions/get` | none | `SystemPermissionsStatus` | App-facing permission API owned by `clawd`; desktop status may be delegated to Electron. |
| `system/permissions/accessibility/open` | none | `SystemPermissionsStatus` | Opens native settings through a client callback, then returns status. |

## Client To `clawd`: Transcription

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `transcription/appleSpeech/create` | `{ audioBase64, options? }` | `AppleSpeechTranscriptionResult` | Runs the Apple Speech helper from `clawd`; renderer audio is encoded into a JSON-safe payload before crossing the backend protocol. |

## Client To `clawd`: Agents

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `agent/create` | `{ input: CreateAgentInput }` | `AppSnapshot` | Validates the folder in the target team's execution location before creating. New agents inherit their team's connection; `CreateAgentInput` does not carry a connection id. |
| `agent/update` | `{ input: UpdateAgentInput }` | `AppSnapshot` | Validates folder and refreshes git status. |
| `agent/select` | `{ agentId }` | `AppSnapshot` | Selects, hydrates history, and refreshes git status. |
| `agent/duplicate` | `{ agentId }` | `AppSnapshot` | Duplicates product agent state. |
| `agent/team/move` | `{ input: MoveAgentToTeamInput }` | `AppSnapshot` | Moves agent to another team. |
| `agent/reorder` | `{ input: ReorderAgentsInput }` | `AppSnapshot` | Reorders within a team. |
| `agent/delete` | `{ agentId }` | `AppSnapshot` | Removes the active product agent. |
| `agent/folder/update` | `{ agentId, folder }` | `AppSnapshot` | Folder picker remains client-side; mutation and validation are backend-owned. |
| `agent/files/list` | `{ agentId }` | `AgentFileSearchItem[]` | Lists files under the agent folder. |
| `agent/file/preview` | `{ agentId, filePath }` | `AgentFilePreviewResult` | Reads a backend-owned agent resource. Clients must not read workspace files directly. |
| `agent/models/list` | `{ agentId }` | `BackendModelOption[]` | Provider-specific catalog adapted to app-owned shape. |
| `agent/skills/list` | `{ agentId }` | `BackendSkillSummary[]` | Provider-specific skills adapted to app-owned shape. |
| `agent/git/diff/open` | `{ agentId }` | `true` | Emits a side-panel git diff event from backend-owned git state. |
| `agent/workItem/assign` | `{ agentId, item }` | `AppSnapshot` | Records provider-neutral work item assignment. |
| `agent/workItem/assignment/delete` | `{ item }` | `AppSnapshot` | Clears provider-neutral assignment state. |

## Client To `clawd`: Conversations And Turns

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `agent/restart` | `{ agentId }` | `AppSnapshot` | Clears app-visible conversation state and forgets backend session. |
| `agent/history/hydrate` | `{ agentId }` | `AppSnapshot` | Lazily restores persisted session history without selecting the agent. |
| `agent/conversations/list` | `{ agentId }` | `ConversationSummary[]` | Lists provider history through the active agent backend. |
| `agent/conversation/resume` | `{ agentId, ref: BackendConversationRef }` | `AppSnapshot` | Validates backend match and idle status, then replaces visible history. |
| `agent/conversation/messages/get` | `{ agentId, ref }` | `RendererMessage[]` | Reads historical messages through the owning backend. |
| `agent/prompt/send` | `{ agentId, prompt, options? }` | `AppSnapshot` | Starts or continues a backend turn. |
| `agent/prompt/steer` | `{ agentId, prompt }` | `AppSnapshot` | Sends active-turn steering and emits `message.steer`. |
| `agent/interrupt` | `{ agentId }` | `AppSnapshot` | Interrupts the active backend turn if supported. |
| `agent/turn/rollback` | `{ agentId, turnId }` | `AppSnapshot` | Rolls back provider history and replaces visible history. |
| `agent/message/delete` | `{ agentId, messageId }` | `AppSnapshot` | Resolves message to turn, rolls back, and persists. |
| `agent/message/update` | `{ agentId, messageId, prompt }` | `AppSnapshot` | Rolls back then sends edited prompt. |
| `agent/message/retry` | `{ agentId, messageId }` | `AppSnapshot` | Rolls back then resends the matching user prompt. |
| `agent/goal/update` | `{ agentId, objective }` | `AppSnapshot` | Sets provider goal metadata and updates agent goal state. |
| `agent/goal/clear` | `{ agentId }` | `AppSnapshot` | Clears provider goal metadata and agent goal state. |
| `agent/approvalPreset/update` | `{ agentId, preset: ApprovalPreset }` | `AppSnapshot` | Applies app-owned approval preset through the backend driver. |

## Client To `clawd`: Teams And Bench

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `team/create` | `{ input: CreateTeamInput }` | `AppSnapshot` | Creates and selects a team. `input.remoteConnectionId` optionally selects the team's SSH execution location; omitted means local. |
| `team/update` | `{ input: UpdateTeamInput }` | `AppSnapshot` | Updates name/color and, while the team has no agents, the optional team connection. Connection changes are rejected once the team has agents. |
| `team/reorder` | `{ input: ReorderTeamsInput }` | `AppSnapshot` | Reorders team rail state. |
| `team/delete` | `{ teamId }` | `AppSnapshot` | Closes team and associated agents. |
| `team/select` | `{ teamId }` | `AppSnapshot` | Selects team and active agent. |
| `snapshot/bench/get` | `{ location? }` | `AppSnapshot` | Returns the selected `clawd` Bench catalog. Remote Bench snapshots are not adopted as the local product snapshot. |
| `bench/agent/template/create` | `{ agentId }` | `AppSnapshot` | Saves the agent as a deployable template in the agent team's `clawd` Bench. Remote saves serialize the local product agent into a template payload stored by the remote `clawd`. |
| `bench/template/create` | `{ input: CreateBenchTemplateInput }` | `AppSnapshot` | Backend-to-backend helper used when local `clawd` saves a local product agent into a remote `clawd` Bench. Clients should prefer `bench/agent/template/create`. |
| `bench/template/deploy` | `{ templateId, teamId?, location? }` | `AppSnapshot` | Resolves the template from the target team's `clawd` Bench, validates the folder in that team's execution location, then creates the local product agent in the target team. |
| `bench/template/delete` | `{ templateId, location? }` | `AppSnapshot` | Removes template from the selected `clawd` Bench. Remote removes return the remote snapshot without replacing local product state. |

Bench belongs to a `clawd` instance, not to Electron globally. Local teams can
deploy only from local Bench; teams with `Team.remoteConnectionId` can deploy
only from that remote `clawd` Bench. Cross-location template copy is not part
of the current protocol.

## Client To `clawd`: Settings And Source Repositories

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `settings/update` | `{ input: UpdateSettingsInput }` | `AppSnapshot` | Updates general/theme/source settings. |
| `source/folders/list` | `{ path?, remoteConnectionId? }` | `SourceFolderListing` | Lists child directories from local or remote `clawd`; when `path` is omitted, the target backend starts at its `$HOME`. Used by renderer fake folder pickers without desktop filesystem access. |
| `source/repositories/list` | `{ remoteConnectionId? }` | `SourceRepository[]` | Scans the configured source folder in local `clawd` or the selected remote `clawd`. |
| `source/worktree/path/suggest` | `{ input: { repoPath, branchName, remoteConnectionId? } }` | `string` | Backend-owned path policy in local or remote location. |
| `source/worktrees/list` | `{ repoPath, remoteConnectionId? }` | `SourceWorktree[]` | Runs `git worktree list --porcelain` in local or remote `clawd`. |
| `source/worktree/create` | `{ input: CreateSourceWorktreeInput }` | `SourceWorktree` | Runs `git worktree add` in local or remote `clawd`. Local creations persist recent repo metadata. |

Folder and save dialogs are not backend protocol messages. Electron may return
selected paths through desktop IPC, but all validation, listing, creation, and
state mutation happen in `clawd`.

When the source folder path is unset or was persisted as empty, `clawd`
initializes it before repository listing by trying `~/src`, `~/code`, `~/dev`,
and `~/sources` first.

## Client To `clawd`: Remote Connections

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `connections/sshHosts/list` | none | `SshHostCandidate[]` | Parses the backend host's `~/.ssh/config` and returns concrete `Host` aliases. Wildcard and negated patterns are ignored. |
| `connections/ssh/create` | `{ input: AddSshConnectionInput }` | `AppSnapshot` | Saves an SSH connection, probes the host non-interactively, syncs the bundled `clawd` script and provider token file under `~/.codex-claw`, and records an `ssh` stdio transport when ready. |
| `connections/sync` | `{ connectionId }` | `AppSnapshot` | Syncs a saved SSH connection: closes any cached remote stdio client, uploads the bundled `clawd` script, mirrors `provider-tokens.json`, records the daemon-first SSH transport, and reads the installed version. Sync does not start or restart a persistent remote daemon. On next remote startup, `clawd` hydrates `workBacklog.connections` from the mirrored tokens instead of copying local `state.json`. The renderer labels this action `Sync`. |
| `connections/update` | `{ connectionId, input: { sourceFolderPath? } }` | `AppSnapshot` | Updates SSH connection settings. Source-folder changes are forwarded to the remote `clawd` through `settings/update` and mirrored locally for settings UI defaults. |
| `connections/delete` | `{ connectionId }` | `AppSnapshot` | Removes a saved remote connection and deletes teams attached to it. If every team used that connection, local `clawd` creates one empty local fallback team first. |

Remote connection state is owned by `clawd`, not Electron. The SSH transport
command model is
`ssh <host> "node ~/.codex-claw/clawd.mjs connect || exec node ~/.codex-claw/clawd.mjs --stdio"`.
`connect` bridges to the remote host's `~/.codex-claw/clawd.sock` when an
externally managed `clawd serve` daemon is running; otherwise the shell
fallback spawns one one-shot stdio backend for that SSH session.
Teams store `Team.remoteConnectionId`; agents inherit execution location from
their owning team. Local `clawd` remains the product-state authority and brokers
source, git, file, model, skill, conversation, prompt, approval-response,
steering, interrupt, and rollback driver calls to the selected remote `clawd`
over SSH stdio. Slash-command interception remains local-only for now; ordinary
prompts route remotely.

Bench follows the same team-owned `clawd` selection for catalogs, saves, and
removes. Deploying a remote Bench template still creates the visible product
agent in the local team snapshot; the remote `clawd` supplies the template and
validates remote execution resources.

Loops are selected independently from the Loops screen. When the client omits
`location`, loop and work-provider calls operate on local `clawd`. When the
client passes `{ kind: "remote", remoteConnectionId }`, local `clawd` forwards
the loop request to that remote backend and returns the remote snapshot without
adopting it as the local product snapshot.

## Client To `clawd`: Work Providers

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `workProvider/connect` | `{ provider }` | `WorkProviderConnectResult` | Starts provider connection such as GitHub device flow. |
| `workProvider/authorization/open` | `{ provider }` | `AppSnapshot` | Requests browser opening through `client/external/open`. |
| `workProvider/connection/complete` | `{ provider }` | `AppSnapshot` | Polls/completes pending provider auth. |
| `workProvider/disconnect` | `{ provider }` | `AppSnapshot` | Removes provider connection and token. |
| `workProvider/repositories/list` | `{ provider, location? }` | `WorkRepository[]` | Lists provider repositories from local `clawd` or the selected remote loop location. |
| `workProvider/backlog/configure` | `{ input: WorkBacklogConfigurationInput }` | `AppSnapshot` | Saves backlog configuration. |
| `workProvider/items/list` | `{ provider, repositoryId, location? }` | `WorkItem[]` | Lists provider work items from local `clawd` or the selected remote loop location. |

## Client To `clawd`: Loops

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `snapshot/loops/get` | `{ location? }` | `AppSnapshot` | Returns the local or remote loop-management snapshot for the selected Loops screen location. Remote snapshots are not adopted locally. |
| `loop/create` | `{ input: CreateLoopInput, location? }` | `AppSnapshot` | Creates scheduler configuration in local `clawd` or the selected remote loop location. |
| `loop/update` | `{ input: UpdateLoopInput, location? }` | `AppSnapshot` | Updates scheduler configuration in local `clawd` or the selected remote loop location. |
| `loop/run` | `{ loopId, location? }` | `AppSnapshot` | Runs one loop immediately in local `clawd` or the selected remote loop location. |
| `loop/due/run` | none | `AppSnapshot` | Runs due loops. Used by backend scheduler and tests. |
| `loop/history/clear` | `{ loopId, location? }` | `AppSnapshot` | Clears execution history in local `clawd` or the selected remote loop location. |
| `loop/execution/delete` | `{ loopId, executionId, location? }` | `AppSnapshot` | Deletes one execution log entry in local `clawd` or the selected remote loop location. |
| `loop/delete` | `{ loopId, location? }` | `AppSnapshot` | Deletes scheduler configuration in local `clawd` or the selected remote loop location. |

The Electron renderer exposes this as `Loops > Local|<remote>`. Create/edit
forms use the selected location's teams, bench templates, source repositories,
work-provider repositories, work items, and remote folder picker data. Loop
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
| `driver/git/diff/get` | `{ agent }` | `string | null` |
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
| `driver/conversations/list` | `{ agent }` | `ConversationSummary[]` |
| `driver/conversation/resume` | `{ agent, ref }` | `BackendConversationResumeResult` |
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
| `backend/event/notify` | `ClawBackendEvent` | App-owned event for renderer/UI state. May include `clientState` and, for state-affecting events, authoritative `snapshot`. |

Event `type` values are the app-owned `MainToRendererEvent['type']` union from
`shared/src/contracts.ts`. Current emitted examples include:

- backend and agent status: `backend.statusChanged`, `agent.updated`,
  `snapshot.updated`, `agent.statusChanged`;
- thread and turn lifecycle: `thread.started`, `thread.historyLoaded`,
  `thread.settingsUpdated`, `thread.modeUpdated`, `thread.goalUpdated`,
  `thread.goalCleared`, `thread.tokenUsageUpdated`, `turn.started`,
  `turn.planUpdated`, `turn.proposedPlanDelta`,
  `turn.proposedPlanCompleted`, `turn.completed`;
- message and item streaming: `message.delta`, `message.steer`,
  `item.started`, `item.updated`, `item.completed`;
- approvals and requests: `approval.requested`, `toolInput.requested`;
- artifacts and account state: `diff.updated`, `sidePanel.markdownRequested`,
  `sidePanel.gitDiffRequested`, `git.statusUpdated`,
  `context.compactionStarted`,
  `account.rateLimitsUpdated`, `skills.changed`;
- work backlog: `workBacklog.assignmentUpdated`;
- failures: `error`.

Clients must ignore unknown event types and refresh via `snapshot/get` if they
detect sequence gaps.

## `clawd` To Client Requests

These are backend-initiated JSON-RPC requests sent from `clawd` to the
connected client. They are host callbacks, not general product APIs. Electron
implements the callbacks today; future clients can implement the subset that
matches their platform capabilities.

| Method | Params | Result | Owner |
| --- | --- | --- | --- |
| `client/external/open` | `{ url }` | `true` | Electron opens the URL with `shell.openExternal`. |
| `client/system/permissions/get` | none | `SystemPermissionsStatus` | Electron reads native permission status. |
| `client/system/permissions/accessibility/open` | none | `SystemPermissionsStatus` | Electron opens native settings and returns status. |

If a client request method is unknown, the client responds with JSON-RPC
`methodNotFound`. If the native callback throws, Electron responds with
`internalError`.

## Ownership Notes

- `clawd` owns request IDs for requests it sends to Electron.
- Electron owns request IDs for requests it sends to `clawd`.
- Product state belongs to `clawd`. Electron and renderer may cache only
  backend-provided snapshots.
- Filesystem reads, git commands, provider tokens, provider protocol calls,
  loops, scheduler execution, and transcription helper execution belong to
  `clawd`.
- Electron owns only native desktop affordances: windows, menus, shortcuts,
  dialogs, `openExternal`, native permission callbacks, process launching, and
  transport plumbing.
