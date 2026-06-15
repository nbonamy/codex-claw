# Backend Protocol

Status: current backend JSON-RPC protocol, 2026-06-14.

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

## Direction Rules

- Client to `clawd`: app-owned product requests such as `agent/sendPrompt`,
  `source/listWorktrees`, and `workProvider/listItems`.
- `clawd` to client notifications: currently `backend/event`, carrying
  app-owned events and optional backend-derived snapshots.
- `clawd` to client requests: narrow host callbacks for native affordances
  that the connected client must perform, currently Electron browser opening
  and macOS permission surfaces.
- Backend-internal driver RPC: `driver/*`, `source/detectFolder`, and
  `agent/validateFolder` are accepted by the server through the driver RPC
  fallback, but client code should prefer the app-level methods unless this
  document explicitly marks a method public.

## Common Result Types

- `AppSnapshot`: authoritative product snapshot owned by `clawd`.
- `ClientState`: backend-derived client hints:
  `{ sourceFolderPath, shouldPreventDisplaySleep }`.
- `ClawSnapshotGetResult`: `{ snapshot, lastEventSeq, clientState }`.
- `ClawBackendEvent`: event sent to clients:
  `{ seq, type, payload, occurredAt, agentId?, backend?, backendSessionId?,
  threadId?, turnId?, clientState?, snapshot? }`.

State-mutating public methods generally return `AppSnapshot`. The returned
snapshot is authoritative; clients should adopt it rather than replay product
reducers locally.

## Client To `clawd`: Core

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `backend/health` | none | `ClawBackendHealth` | Liveness and version check. |
| `snapshot/get` | none | `ClawSnapshotGetResult` | Initializes source folder if needed and returns the authoritative snapshot. |
| `client/getState` | none | `ClientState` | Backend-derived client hints only. |
| `clientRequest/respond` | `{ response: ClientRequestResponse }` | `AppSnapshot` | Resolves a provider-owned approval or ask-user request. |

## Client To `clawd`: System

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `system/getPermissions` | none | `SystemPermissionsStatus` | App-facing permission API owned by `clawd`; desktop status may be delegated to Electron. |
| `system/openAccessibilitySettings` | none | `SystemPermissionsStatus` | Opens native settings through a client callback, then returns status. |

## Client To `clawd`: Transcription

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `transcription/appleSpeech` | `{ audioBase64, options? }` | `AppleSpeechTranscriptionResult` | Runs the Apple Speech helper from `clawd`; renderer audio is encoded into a JSON-safe payload before crossing the backend protocol. |

## Client To `clawd`: Agents

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `agent/create` | `{ input: CreateAgentInput }` | `AppSnapshot` | Validates the folder in the target team's execution location before creating. New agents inherit their team's connection; `CreateAgentInput` does not carry a connection id. |
| `agent/update` | `{ input: UpdateAgentInput }` | `AppSnapshot` | Validates folder and refreshes git status. |
| `agent/select` | `{ agentId }` | `AppSnapshot` | Selects, hydrates history, and refreshes git status. |
| `agent/duplicate` | `{ agentId }` | `AppSnapshot` | Duplicates product agent state. |
| `agent/moveToTeam` | `{ input: MoveAgentToTeamInput }` | `AppSnapshot` | Moves agent to another team. |
| `agent/reorder` | `{ input: ReorderAgentsInput }` | `AppSnapshot` | Reorders within a team. |
| `agent/close` | `{ agentId }` | `AppSnapshot` | Removes the active product agent. |
| `agent/updateFolder` | `{ agentId, folder }` | `AppSnapshot` | Folder picker remains client-side; mutation and validation are backend-owned. |
| `agent/listFiles` | `{ agentId }` | `AgentFileSearchItem[]` | Lists files under the agent folder. |
| `agent/previewFile` | `{ agentId, filePath }` | `AgentFilePreviewResult` | Reads a backend-owned agent resource. Clients must not read workspace files directly. |
| `agent/listModels` | `{ agentId }` | `BackendModelOption[]` | Provider-specific catalog adapted to app-owned shape. |
| `agent/listSkills` | `{ agentId }` | `BackendSkillSummary[]` | Provider-specific skills adapted to app-owned shape. |
| `agent/openGitDiff` | `{ agentId }` | `true` | Emits a side-panel git diff event from backend-owned git state. |
| `agent/assignWorkItem` | `{ agentId, item }` | `AppSnapshot` | Records provider-neutral work item assignment. |
| `agent/removeWorkItemAssignment` | `{ item }` | `AppSnapshot` | Clears provider-neutral assignment state. |

## Client To `clawd`: Conversations And Turns

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `agent/restart` | `{ agentId }` | `AppSnapshot` | Clears app-visible conversation state and forgets backend session. |
| `agent/hydrateHistory` | `{ agentId }` | `AppSnapshot` | Lazily restores persisted session history without selecting the agent. |
| `agent/listConversations` | `{ agentId }` | `ConversationSummary[]` | Lists provider history through the active agent backend. |
| `agent/resumeConversation` | `{ agentId, ref: BackendConversationRef }` | `AppSnapshot` | Validates backend match and idle status, then replaces visible history. |
| `agent/readConversationMessages` | `{ agentId, ref }` | `RendererMessage[]` | Reads historical messages through the owning backend. |
| `agent/sendPrompt` | `{ agentId, prompt, options? }` | `AppSnapshot` | Starts or continues a backend turn. |
| `agent/steer` | `{ agentId, prompt }` | `AppSnapshot` | Sends active-turn steering and emits `message.steer`. |
| `agent/interrupt` | `{ agentId }` | `AppSnapshot` | Interrupts the active backend turn if supported. |
| `agent/rollbackToTurn` | `{ agentId, turnId }` | `AppSnapshot` | Rolls back provider history and replaces visible history. |
| `agent/deleteMessage` | `{ agentId, messageId }` | `AppSnapshot` | Resolves message to turn, rolls back, and persists. |
| `agent/editMessage` | `{ agentId, messageId, prompt }` | `AppSnapshot` | Rolls back then sends edited prompt. |
| `agent/retryMessage` | `{ agentId, messageId }` | `AppSnapshot` | Rolls back then resends the matching user prompt. |
| `agent/setGoal` | `{ agentId, objective }` | `AppSnapshot` | Sets provider goal metadata and updates agent goal state. |
| `agent/clearGoal` | `{ agentId }` | `AppSnapshot` | Clears provider goal metadata and agent goal state. |
| `agent/setApprovalPreset` | `{ agentId, preset: ApprovalPreset }` | `AppSnapshot` | Applies app-owned approval preset through the backend driver. |

## Client To `clawd`: Teams And Bench

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `team/create` | `{ input: CreateTeamInput }` | `AppSnapshot` | Creates and selects a team. `input.remoteConnectionId` optionally selects the team's SSH execution location; omitted means local. |
| `team/update` | `{ input: UpdateTeamInput }` | `AppSnapshot` | Updates name/color and, while the team has no agents, the optional team connection. Connection changes are rejected once the team has agents. |
| `team/reorder` | `{ input: ReorderTeamsInput }` | `AppSnapshot` | Reorders team rail state. |
| `team/close` | `{ teamId }` | `AppSnapshot` | Closes team and associated agents. |
| `team/select` | `{ teamId }` | `AppSnapshot` | Selects team and active agent. |
| `bench/saveAgent` | `{ agentId }` | `AppSnapshot` | Saves agent as deployable template. |
| `bench/deployTemplate` | `{ templateId, teamId? }` | `AppSnapshot` | Validates template folder and creates an agent. |
| `bench/removeTemplate` | `{ templateId }` | `AppSnapshot` | Removes template. |

## Client To `clawd`: Settings And Source Repositories

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `settings/update` | `{ input: UpdateSettingsInput }` | `AppSnapshot` | Updates general/theme/source settings. |
| `source/listFolders` | `{ path?, remoteConnectionId? }` | `SourceFolderListing` | Lists child directories from local or remote `clawd`; when `path` is omitted, the target backend starts at its `$HOME`. Used by renderer fake folder pickers without desktop filesystem access. |
| `source/listRepositories` | `{ remoteConnectionId? }` | `SourceRepository[]` | Scans the configured source folder in local `clawd` or the selected remote `clawd`. |
| `source/suggestWorktreePath` | `{ input: { repoPath, branchName, remoteConnectionId? } }` | `string` | Backend-owned path policy in local or remote location. |
| `source/listWorktrees` | `{ repoPath, remoteConnectionId? }` | `SourceWorktree[]` | Runs `git worktree list --porcelain` in local or remote `clawd`. |
| `source/createWorktree` | `{ input: CreateSourceWorktreeInput }` | `SourceWorktree` | Runs `git worktree add` in local or remote `clawd`. Local creations persist recent repo metadata. |

Folder and save dialogs are not backend protocol messages. Electron may return
selected paths through desktop IPC, but all validation, listing, creation, and
state mutation happen in `clawd`.

When the source folder path is unset or was persisted as empty, `clawd`
initializes it before repository listing by trying `~/src`, `~/code`, `~/dev`,
and `~/sources` first.

## Client To `clawd`: Remote Connections

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `connections/listSshHosts` | none | `SshHostCandidate[]` | Parses the backend host's `~/.ssh/config` and returns concrete `Host` aliases. Wildcard and negated patterns are ignored. |
| `connections/addSsh` | `{ input: AddSshConnectionInput }` | `AppSnapshot` | Saves an SSH connection, probes the host non-interactively, installs the bundled `clawd` script under `~/.codex-claw` when missing, and records an `ssh` stdio transport when ready. |
| `connections/check` | `{ connectionId }` | `AppSnapshot` | Re-runs the SSH probe/install/version check for a saved connection. |
| `connections/update` | `{ connectionId, input: { sourceFolderPath? } }` | `AppSnapshot` | Updates SSH connection settings. Source-folder changes are forwarded to the remote `clawd` through `settings/update` and mirrored locally for settings UI defaults. |
| `connections/remove` | `{ connectionId }` | `AppSnapshot` | Removes a saved remote connection and deletes teams attached to it. If every team used that connection, local `clawd` creates one empty local fallback team first. |

Remote connection state is owned by `clawd`, not Electron. Today the SSH
transport command model is `ssh <host> "node ~/.codex-claw/clawd.mjs --stdio"`.
Teams store `Team.remoteConnectionId`; agents inherit execution location from
their owning team. Local `clawd` remains the product-state authority and brokers
source, git, file, model, skill, conversation, prompt, approval-response,
steering, interrupt, and rollback driver calls to the selected remote `clawd`
over SSH stdio. Slash-command interception remains local-only for now; ordinary
prompts route remotely.

## Client To `clawd`: Work Providers

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `workProvider/connect` | `{ provider }` | `WorkProviderConnectResult` | Starts provider connection such as GitHub device flow. |
| `workProvider/openAuthorization` | `{ provider }` | `AppSnapshot` | Requests browser opening through `client/openExternal`. |
| `workProvider/completeConnection` | `{ provider }` | `AppSnapshot` | Polls/completes pending provider auth. |
| `workProvider/disconnect` | `{ provider }` | `AppSnapshot` | Removes provider connection and token. |
| `workProvider/listRepositories` | `{ provider }` | `WorkRepository[]` | Lists provider repositories. |
| `workProvider/configureBacklog` | `{ input: WorkBacklogConfigurationInput }` | `AppSnapshot` | Saves backlog configuration. |
| `workProvider/listItems` | `{ provider, repositoryId }` | `WorkItem[]` | Lists provider work items for a repository. |

## Client To `clawd`: Loops

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `loop/create` | `{ input: CreateLoopInput }` | `AppSnapshot` | Creates scheduler configuration. |
| `loop/update` | `{ input: UpdateLoopInput }` | `AppSnapshot` | Updates scheduler configuration. |
| `loop/run` | `{ loopId }` | `AppSnapshot` | Runs one loop immediately. |
| `loop/runDue` | none | `AppSnapshot` | Runs due loops. Used by backend scheduler and tests. |
| `loop/history/clear` | `{ loopId }` | `AppSnapshot` | Clears execution history. |
| `loop/execution/delete` | `{ loopId, executionId }` | `AppSnapshot` | Deletes one execution log entry. |
| `loop/delete` | `{ loopId }` | `AppSnapshot` | Deletes scheduler configuration. |

## Client To `clawd`: Backend-Internal Driver RPC

These methods are implemented by `BackendDriverRpc` and may currently be
reachable through the server fallback. Treat them as backend-internal
implementation messages, not the preferred app protocol for clients.

| Method | Params | Result |
| --- | --- | --- |
| `driver/listFiles` | `{ folder }` | `AgentFileSearchItem[]` |
| `driver/previewFile` | `{ folder, filePath }` | `AgentFilePreviewResult` |
| `agent/validateFolder` | `{ folder }` | `null` |
| `driver/getGitStatus` | `{ agent }` | `AgentGitStatus | null` |
| `driver/getGitDiff` | `{ agent }` | `string | null` |
| `driver/tryHandlePromptCommand` | `{ agent, prompt }` | `BackendSendResult | null` |
| `driver/sendPrompt` | `{ agent, prompt, options? }` | `BackendSendResult` |
| `driver/setConversationTitle` | `{ agent, title }` | `null` |
| `driver/setGoal` | `{ agent, objective }` | `BackendGoalResult` |
| `driver/clearGoal` | `{ agent }` | `BackendGoalResult` |
| `driver/setApprovalPreset` | `{ agent, preset }` | `BackendApprovalPresetResult` |
| `driver/forgetSession` | `{ backend, agentId }` | `null` |
| `driver/interrupt` | `{ agent }` | `BackendSendResult` |
| `driver/respondToClientRequest` | `{ backend, response }` | `null` |
| `driver/hydrate` | `{ agent }` | `BackendSession | null` |
| `driver/listConversations` | `{ agent }` | `ConversationSummary[]` |
| `driver/resumeConversation` | `{ agent, ref }` | `BackendConversationResumeResult` |
| `driver/readConversationMessages` | `{ ref, agentId }` | `RendererMessage[]` |
| `driver/steer` | `{ agent, prompt }` | `BackendSendResult` |
| `driver/rollbackToTurn` | `{ agent, turnId }` | `BackendRollbackResult` |
| `driver/listModels` | `{ agent }` | `BackendModelOption[]` |
| `driver/listSkills` | `{ agent }` | `BackendSkillSummary[]` |
| `source/detectFolder` | none | `string | null` |
| `source/listRepositories` | `{ sourceFolderPath }` | `SourceRepository[]` |
| `source/suggestWorktreePath` | `{ input: { repoPath, branchName } }` | `string` |
| `source/listWorktrees` | `{ repoPath }` | `SourceWorktree[]` |
| `source/createWorktree` | `{ input: CreateSourceWorktreeInput }` | `SourceWorktree` |

## `clawd` To Client Notifications

`clawd` sends one notification method:

| Method | Params | Notes |
| --- | --- | --- |
| `backend/event` | `ClawBackendEvent` | App-owned event for renderer/UI state. May include `clientState` and, for state-affecting events, authoritative `snapshot`. |

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
| `client/openExternal` | `{ url }` | `true` | Electron opens the URL with `shell.openExternal`. |
| `client/systemPermissions/get` | none | `SystemPermissionsStatus` | Electron reads native permission status. |
| `client/systemPermissions/openAccessibilitySettings` | none | `SystemPermissionsStatus` | Electron opens native settings and returns status. |

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
