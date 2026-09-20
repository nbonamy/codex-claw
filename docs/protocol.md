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
`core/src/backend-protocol/rpc.ts`: parse error, invalid request, method not
found, invalid params, internal error, backend unavailable, and timeout.

Method names use `resource[/subresource]/verb`. Multiword path segments are
lower camel case, and the action belongs at the end of the path. Method values
are centralized in `core/src/backend-protocol/methods.ts`.
The shared request map is being adopted one product domain at a time; all
app-level `agent/git/*` methods currently have compile-time parameter and result
contracts used by the Electron adapter and backend routing seam.

Operation deadlines are shared in `core/src/backend-protocol/request-timeout.ts`
by the Electron and SSH clients. Startup snapshots, provider catalogs, and slow
agent operations use the longer deadline; Electron adds a response grace period
so a remote timeout can reach the desktop before its own request expires.
Remote model/skill broadcasts are scoped to projected agents before forwarding.
Client catalog caches distinguish local and remote hosts, even when both use the
same provider and folder path.

This protocol version is a breaking dev-mode cleanup. There are no legacy
aliases for older names such as `agent/listFiles` or `backend/event`; stale
local or remote `clawd` daemons must be restarted or
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
  `workspace/folder/validate` are accepted by the server through the driver RPC
  fallback, but client code should prefer the app-level methods unless this
  document explicitly marks a method public.

## Common Result Types

- `AppSnapshot`: authoritative transcript-free product and coordination
  snapshot owned by `clawd`.
- `ClientState`: backend-derived client hints:
  `{ sourceFolderPath, shouldPreventDisplaySleep,
  shouldPreventDisplaySleepForRemoteAccess? }`. The first sleep hint represents
  active-agent work and applies on either power source. The remote-access hint
  is true only when `general.preventSleepWhenRemoteAccessEnabled` is enabled
  and Codex remote control is connected; Electron applies that reason only on
  AC power. Keeping the reasons separate prevents the remote-access power policy
  from changing the existing agent-activity behavior.
- `ClawSnapshotGetResult`: `{ snapshot, lastEventSeq, clientState }`. Provider
  conversations are deliberately excluded from this synchronization frame.
- `AutomationLocation`: optional automation/work-provider location selector:
  `{ kind: "local" }` or `{ kind: "remote", remoteConnectionId }`.
- `ClawBackendEvent`: event sent to clients:
  `{ seq, type, payload, occurredAt, agentId?, backend?, backendSessionId?,
  threadId?, turnId?, clientState?, snapshot? }`.

Every transport treats a received event value as untrusted. Local stdio/socket,
remote SSH stdio, and browser WebSocket ingress decode the complete typed event
before publishing it to application state. A malformed event notification is
logged with structural path/reason diagnostics and dropped; its payload values
are never logged, the connection remains open, and unrelated pending requests
continue normally. Malformed JSON or JSON-RPC framing retains the transport's
existing error and reconnection policy.

State-mutating public methods generally return `AppSnapshot`. The returned
product snapshot is authoritative. Between snapshots, clients replay only
sequenced `clawd` coordination events through the app reducer. Provider
conversation resets and deltas are carried in provider-specific frames and
applied by the matching provider replica.

Electron and the renderer both synchronize with a subscribe-buffer-snapshot
barrier: subscribe first, buffer notifications while reading `snapshot/get`,
discard buffered events at or below `lastEventSeq`, then apply only contiguous
events above it. A gap triggers a fresh snapshot barrier. Duplicate deltas are
therefore never replayed after reconnect or renderer reload. The selected
conversation is restored separately through `agent/conversation/load`, which
publishes a bounded provider snapshot followed by revisioned provider events.
This keeps the synchronization barrier bounded even for very long threads.

## Client To `clawd`: Core

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `backend/health/get` | none | `ClawBackendHealth` | Liveness and version check. |
| `snapshot/get` | none | `ClawSnapshotGetResult` | Returns the transcript-free product snapshot projected for the requesting client. Startup maintenance is performed separately by runtime initialization. |
| `client/state/get` | none | `ClientState` | Backend-derived client hints only. |
| `agent/request/respond` | `{ response: AgentRequestResponse }` | `AppSnapshot` | Answers a pending normalized approval/question/confirmation using a typed outcome. Include `agentId`; an untargeted response is accepted only when its request ID is unambiguous. |
| `agent/planReview/respond` | `{ agentId, response: { reviewId, resolution, feedback? } }` | `AppSnapshot` | Accept, revise, or cancel the identified pending review. Revision requires feedback; failures retain the pending review. |
| `agent/threadFlag/respond` | `{ agentId, response: { id, action } }` | `AppSnapshot` | Executes or dismisses an active typed thread flag. Executing `delegate_to_worktree` submits the fixed delegation prompt and clears only after acceptance. |
| `agent/codeReview/start` | `{ agentId, input: { scope, threadMode } }` | `AppSnapshot` | Starts a review for either uncommitted work or the current branch against an explicit base. `threadMode` is `unbiased` (fresh provider conversation) or `current` (the agent's attached conversation), and the choices are stored with the active durable ledger. |
| `agent/codeReview/finding/decide` | `{ agentId, input }` | `AppSnapshot` | Selects or rejects a stable finding; rejection requires a reason. Decisions are not remediation statuses. |
| `agent/codeReview/finding/discuss` | `{ agentId, input }` | `AppSnapshot` | Adds a finding-linked prompt and continues the same reviewer conversation for its response. |
| `agent/codeReview/round/submit` | `{ agentId, sessionId }` | `AppSnapshot` | Validates arbitration, maps rejected findings to `skipped` and selected findings to `pending`, then fixes pending findings one at a time in the same reviewer conversation. |
| `agent/codeReview/again` | `{ agentId, sessionId }` | `AppSnapshot` | Reuses the same provider conversation for `current` reviews. For `unbiased` reviews, disposes the review-owned conversation and starts a fresh one for the stored scope. Both carry rejected exclusions, fixed regression checks, and behavior decisions from prior discussion. |
| `agent/codeReview/finish` | `{ agentId, sessionId }` | `AppSnapshot` | Finishes the workflow and removes the active review ledger. It leaves a user-owned current conversation intact and disposes an unbiased review-owned conversation. |

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
| `client/navigation/selectAgent` | `{ agentId }` | `AppSnapshot` | Persists this client's selection only. Conversation loading and Git refresh are explicit runtime operations. |
| `agent/duplicate` | `{ agentId }` | `AppSnapshot` | Duplicates product agent configuration directly below the source agent. |
| `agent/fork` | `{ agentId, turnId? }` | `AppSnapshot` | Forks an idle agent's backend conversation, optionally at a stable turn id, into a new selected agent directly below the source. |
| `agent/team/move` | `{ input: MoveAgentToTeamInput }` | `AppSnapshot` | Moves a local agent between local teams. Cross-backend moves are rejected; create a new agent in the target remote team instead. |
| `client/agentOrder/update` | `{ input: ReorderAgentsInput }` | `AppSnapshot` | Reorders within a team. |
| `agent/delete` | `{ agentId, input? }` | `AppSnapshot` | Archives the attached provider conversation when supported, then removes the product agent and, when explicitly confirmed, its clean linked worktree, local branch, and optional tracked remote branch. `pullRequestCleanup` additionally requires a tracked merged or closed PR, an idle agent, and a worktree HEAD matching the recorded PR head. Closed-PR cleanup preserves the remote branch. |
| `agent/files/list` | `{ agentId }` | `AgentFileSearchItem[]` | Lists files under the agent folder. |
| `agent/file/preview` | `{ agentId, filePath }` | `AgentFilePreviewResult` | Reads a backend-host file. Relative inputs resolve from the agent folder; absolute paths and relative traversal may address files elsewhere on that host. The backend caps preview bytes and classifies text, image, binary, and oversized results. Clients must not read backend-host files directly. |
| `agent/models/list` | `{ agentId }` | `BackendModelOption[]` | Provider-specific catalog adapted to app-owned shape. |
| `agent/skills/list` | `{ agentId }` | `BackendSkillSummary[]` | Provider-specific skills adapted to app-owned shape. |
| `agent/git/diff/get` | `{ agentId, target? }` | `AgentGitDiff` | Returns backend-owned diff data; failures propagate as request errors. Targets are branch, uncommitted, unstaged, staged, an exact commit, or a provider-supplied turn diff. Clients choose presentation; no panel event is emitted. |
| `agent/git/workflow/get` | `{ agentId }` | `AgentGitWorkflow` | Reads local branch, remote, staged/unstaged files, linked-worktree state, and GitHub connection without spending remote API quota. |
| `agent/git/stage` | `{ agentId, input: { paths, confirmed } }` | `AgentGitWorkflow` | Stages explicitly selected repository-relative paths; rejects unconfirmed requests. |
| `agent/git/commit` | `{ agentId, input: { message, confirmed } }` | `AgentGitWorkflow` | Creates a commit from the index with an explicit message and confirmation. |
| `agent/git/push` | `{ agentId, input: { confirmed, target?, closeAgentAfterPush? } }` | `AgentGitWorkflow` | Pushes the current named branch by default; `target: 'mergeTarget'` pushes the base branch produced by the preceding merge. Sets upstream when missing. A deferred merge cleanup may explicitly close the rehomed agent only after this push succeeds. |
| `agent/git/base/update` | `{ agentId, input: { confirmed, allowDirty? } }` | `AgentGitUpdateFromBaseResult` | Merges the checked-out base-worktree branch into the current linked-worktree branch. Dirty worktrees require an explicit override. Merge conflicts remain in place and are returned as repository-relative paths; Claw then submits a resolution prompt to the affected agent. |
| `agent/git/pullRequest/create` | `{ agentId, input: { title, body, reportBack?, confirmed } }` | `AgentGitWorkflow` | Performs one existing-PR lookup after confirmation, then creates a draft GitHub PR through the connected work-provider token and persists its repository, branch, head commit, and lifecycle state on the agent. For delegated agents, `reportBack` first tells the worker that Claw is taking over PR delivery and requests an implementation handoff without further changes; after success, Claw adds the authoritative PR result and delivers it to the delegating agent. |
| `agent/git/merge` | `{ agentId, input: { strategy, commitMessage?, deleteBranch, deleteWorktree, pushAfter?, reportBack?, confirmed } }` | `AgentGitWorkflow` | Merges the current branch into a checked-out base worktree when one exists, otherwise switches the primary checkout to a local integration branch first. Squash merges require the explicit commit message and use forced local branch deletion only after the confirmed squash succeeds, because squash commits do not make the feature tip an ancestor. Worktree cleanup is accepted only from a linked worktree. For delegated agents, `reportBack` follows the same handoff lifecycle as pull-request creation. Removing the worktree closes its agent after report delivery, or defers closure until a requested merged-branch push succeeds. |
| `agent/workItem/assign` | `{ agentId, item }` | `AppSnapshot` | Records provider-neutral work item assignment in the owning backend location. Remote assignments are projected for connected remote-team pointers. |
| `agent/workItem/assignment/delete` | `{ item }` | `AppSnapshot` | Clears provider-neutral assignment state from the backend location that owns the assigned agent. |

## Client To `clawd`: Conversations And Turns

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `agent/conversation/reset` | `{ agentId }` | `AppSnapshot` | Archives the attached provider conversation when supported, then forgets its reference and releases the live conversation host. |
| `agent/conversation/replaceWithSummary` | `{ agentId }` | `AppSnapshot` | For an idle Codex agent, creates a replacement conversation, submits the generated handoff as hidden context in its initial prompt, archives the old conversation only after that prompt is accepted, and updates the persisted provider reference. Provider transcripts remain SDK-owned. |
| `agent/conversation/load` | `{ agentId }` | `AppSnapshot` | Lazily restores provider-owned session state without selecting the agent; the conversation arrives in a provider snapshot frame. |
| `agent/history/load-older` | `{ agentId }` | `{ hasOlder }` | Asks the provider owner to load one older history page; the result arrives through provider-native deltas. |
| `agent/conversations/list` | `{ agentId, input?: { searchTerm?, limit? } }` | `ConversationSummary[]` | Searches provider history through the active agent backend. Codex returns the current active row plus archived rows, tagged by `storageState`. |
| `agent/conversation/resume` | `{ agentId, target: ConversationResumeTarget }` | `AppSnapshot` | Validates backend match and idle status, restores an archived target when needed, archives the displaced conversation, updates the provider reference, and publishes a provider conversation reset. |
| `agent/conversation/messages/get` | `{ agentId, ref }` | `RendererMessage[]` | Reads historical messages through the owning backend. |
| `agent/prompt/send` | `{ agentId, prompt, options? }` | `AppSnapshot` | Starts a backend turn when idle, or appends to the backend-owned per-agent queue while busy. |
| `agent/prompt/steer` | `{ agentId, prompt }` | `AppSnapshot` | Sends active-turn steering through the provider owner; provider events update the conversation replica. |
| `agent/queuedPrompt/update` | `{ agentId, promptId, prompt }` | `AppSnapshot` | Updates the text of an existing backend-owned queued prompt without changing its ID or queue position. |
| `agent/queuedPrompt/steer` | `{ agentId, promptId, prompt? }` | `AppSnapshot` | Atomically steers the stored or edited queued prompt and dequeues it only after acceptance. |
| `agent/queuedPrompt/delete` | `{ agentId, promptId }` | `AppSnapshot` | Deletes a prompt from the backend-owned queue. |
| `agent/interrupt` | `{ agentId }` | `AppSnapshot` | Interrupts the active backend turn if supported. |
| `agent/turn/delete` | `{ agentId, turnId }` | `AppSnapshot` | Delegates provider-defined turn deletion to the owning conversation host. |
| `agent/turn/edit` | `{ agentId, turnId, content }` | `AppSnapshot` | Replaces the selected turn's prompt and restarts execution through the owning backend. |
| `agent/turn/retry` | `{ agentId, turnId }` | `AppSnapshot` | Retries the selected turn through the owning backend. |
| `agent/goal/update` | `{ agentId, objective }` | `AppSnapshot` | Sets provider goal metadata and updates agent goal state. |
| `agent/goal/clear` | `{ agentId }` | `AppSnapshot` | Clears provider goal metadata and agent goal state. |
| `agent/approvalPreset/update` | `{ agentId, preset: ApprovalPreset }` | `AppSnapshot` | Applies app-owned approval preset through the backend driver. |

## Client To `clawd`: Teams

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `team/create` | `{ input: CreateTeamInput }` | `AppSnapshot` | Creates a local or remote team and selects it for the requesting client. Remote creation persists a local pointer, not a proxy runtime. |
| `team/connect` | `{ input: CreateTeamInput }` | `AppSnapshot` | Connects a local pointer to an existing remote team; requires `remoteConnectionId` and `remoteTeamId`. |
| `team/update` | `{ input: UpdateTeamInput }` | `AppSnapshot` | Updates name/color and, while the team has no local or remote agents, the optional team connection. Changing an empty local team to a remote connection creates a real remote team or connects to `input.remoteTeamId`, then stores the remote pointer; connection changes are rejected once either side has agents. |
| `client/teamOrder/update` | `{ input: ReorderTeamsInput }` | `AppSnapshot` | Reorders team rail state. |
| `team/delete` | `{ teamId }` | `AppSnapshot` | Deletes the team in its owning backend location. For remote pointers, this calls remote `team/delete` for `remoteTeamId`, then removes the local pointer. If that pointer is the only local team, local `clawd` creates an empty Local fallback first. |
| `team/disconnect` | `{ teamId }` | `AppSnapshot` | Removes only the local remote-team pointer and leaves the remote team/agents running. If that pointer is the only local team, local `clawd` creates an empty Local fallback first. Local teams use `team/delete`. |
| `client/navigation/selectTeam` | `{ teamId }` | `AppSnapshot` | Selects team and active agent. |

## Client To `clawd`: Settings And Source Repositories

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `settings/update` | `{ input: UpdateSettingsInput }` | `AppSnapshot` | Updates backend execution policy, provider configuration and source-folder settings. Rejects presentation preferences. |
| `client/preferences/update` | `{ input: UpdateSettingsInput }` | `AppSnapshot` | Updates client-scoped appearance, ordering and presentation preferences. Rejects backend policy. |
| `settings/codexResourceSharing/get` | none | `CodexResourceSharingStatus` | Reports whether an enabled existing home still needs explicit migration. |
| `settings/codexResourceSharing/set` | `{ input: { enabled: true } \| { enabled: false, mode: "fresh" \| "copy" \| "keep" } }` | `AppSnapshot` | Links or isolates Claw skills/plugins; folder-changing modes require idle chats. |
| `source/folders/list` | `{ path?, remoteConnectionId? }` | `SourceFolderListing` | Lists child directories from local or remote `clawd`; when `path` is omitted, the target backend starts at its `$HOME`. Used by renderer fake folder pickers without desktop filesystem access. |
| `source/repositories/list` | `{ remoteConnectionId? }` | `SourceRepository[]` | Scans the configured source folder in local `clawd` or the selected remote `clawd`; each repository may include a canonical credential-free `remoteIdentity` for exact remote matching. |
| `source/repository/create` | `{ input: { name, remoteConnectionId? } }` | `SourceRepository` | Creates one direct child of the local or remote source folder, runs `git init`, and returns the discovered repository. Local creations persist recent repo metadata. |
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

Codex authentication reads (`codex/authentication/get`) and cancellation
(`codex/authentication/login/cancel`) accept an optional `remoteConnectionId`;
omitting it retains the local flow. `codex/authentication/deviceCode/start`
routes to the SDK device-code login on the selected host and returns
`{ loginId, verificationUrl, userCode }`. Cancellation additionally accepts
`loginId`, so a client cancels its own pending flow rather than another login.
Only the selected host's SDK/app-server stores and refreshes credentials.

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `connections/sshHosts/list` | none | `SshHostCandidate[]` | Parses the backend host's `~/.ssh/config` and returns concrete `Host` aliases. Wildcard and negated patterns are ignored. |
| `connections/ssh/create` | `{ input: AddSshConnectionInput }` | `AppSnapshot` | Saves an SSH connection, probes the host non-interactively, syncs the bundled `clawd` script and provider token file under `~/.codex-claw`, and records an `ssh` stdio transport when ready. |
| `connections/runtime/inspect` | `{ connectionId }` | `AppSnapshot` | Probes and records runtime versions without installation or session closure. |
| `connections/runtime/sync` | `{ connectionId }` | `AppSnapshot` | Closes the cached remote client, installs checksum-verified pinned Codex and bundled clawd, mirrors provider tokens and reloads provider connections. Explicit custom Codex executable settings remain authoritative; standalone CLI, shell profiles and conversation data are preserved. |
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
agents, messages, sessions, and MCP-visible membership.
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

The Automations surface selects its backend location independently. When the
client omits `location`, automation and work-provider calls operate on local `clawd`.
When the client passes `{ kind: "remote", remoteConnectionId }`, local `clawd`
forwards the automation request to that remote backend and returns the remote snapshot
without adopting it as the local product snapshot.

## Client To `clawd`: Work Providers

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `workProvider/connect` | `{ provider }` | `WorkProviderConnectResult` | Starts provider connection such as GitHub device flow. |
| `workProvider/authorization/poll` | `{ provider }` | `AppSnapshot` | Polls/completes pending provider auth. |
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
| `automation/history/clear` | `{ automationId, location? }` | `AppSnapshot` | Clears execution history in local `clawd` or the selected remote automation location. |
| `automation/execution/delete` | `{ automationId, executionId, location? }` | `AppSnapshot` | Deletes one execution log entry in local `clawd` or the selected remote automation location. |
| `automation/delete` | `{ automationId, location? }` | `AppSnapshot` | Deletes scheduler configuration in local `clawd` or the selected remote automation location. |

The Electron renderer exposes this as `Automations > Local|<remote>`. Create/edit
forms use the selected location's teams, source repositories, and work-provider
repositories. `CreateAutomationInput` contains one or more repository targets,
one team id, optional selection criteria, optional per-agent instructions, an
enabled flag, and an interval schedule. Each due run gathers open unassigned
issues and pull requests, uses hidden structured generation to select the items
matching the criteria, then creates an isolated worktree and agent in the selected
team for each selected item. Blank criteria select every eligible item without a
model call. Automation history conversation previews pass the same location to
`agent/conversation/messages/get`.

## Client To `clawd`: Backend-Internal Driver RPC

These methods are implemented by `BackendDriverRpc` and may currently be
reachable through the server fallback. Treat them as backend-internal
implementation messages, not the preferred app protocol for clients.

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `workspace/files/list` | `{ folder }` | `AgentFileSearchItem[]` |
| `workspace/file/preview` | `{ folder, filePath }` | `AgentFilePreviewResult` |
| `workspace/folder/validate` | `{ folder }` | `null` |
| `driver/promptCommand/handle` | `{ agent, prompt }` | `BackendSendResult | null` |
| `driver/codeReview/run` | `{ agent, prompt, cwd, reviewMcpServerUrl, reviewerSession? }` | `BackendCodeReviewResult` | Creates a fresh provider conversation when `reviewerSession` is absent; otherwise continues that opaque provider session. |
| `driver/codeReview/dispose` | `{ agent, reviewerSession }` | `null` | Disposes a review-owned provider conversation. The review service calls this only for the unbiased strategy, never for the user's current conversation. |
| `driver/prompt/send` | `{ agent, prompt, options? }` | `BackendSendResult` |
| `driver/conversation/replaceWithSummary` | `{ agent }` | `BackendSessionCompressionResult` |
| `driver/conversation/title/update` | `{ agent, title }` | `null` |
| `driver/goal/update` | `{ agent, objective }` | `BackendGoalResult` |
| `driver/goal/clear` | `{ agent }` | `BackendGoalResult` |
| `driver/approvalPreset/update` | `{ agent, preset }` | `BackendApprovalPresetResult` |
| `driver/conversation/release` | `{ backend, agentId }` | `null` |
| `driver/interrupt` | `{ agent }` | `BackendSendResult` |
| `driver/agentRequest/respond` | `{ backend, response }` | `null` |
| `driver/conversation/load` | `{ agent }` | `BackendSession | null` |
| `driver/history/load-older` | `{ agent }` | `{ hasOlder }` |
| `driver/conversations/list` | `{ agent }` | `ConversationSummary[]` |
| `driver/conversation/resume` | `{ agent, ref }` | `BackendConversationResumeResult` |
| `driver/conversation/fork` | `{ agent, turnId? }` | `BackendConversationResumeResult` |
| `driver/conversation/messages/get` | `{ ref, agentId }` | `RendererMessage[]` |
| `driver/prompt/steer` | `{ agent, prompt }` | `BackendSendResult` |
| `driver/turn/delete` | `{ agent, turnId }` | `BackendTurnActionResult` |
| `driver/turn/edit` | `{ agent, turnId, content }` | `BackendTurnActionResult` |
| `driver/turn/retry` | `{ agent, turnId }` | `BackendTurnActionResult` |
| `driver/models/list` | `{ agent }` | `BackendModelOption[]` |
| `driver/skills/list` | `{ agent }` | `BackendSkillSummary[]` |
| `source/folder/detect` | none | `string | null` |
| `source/repositories/list` | `{ sourceFolderPath }` | `SourceRepository[]` |
| `source/repository/create` | `{ sourceFolderPath, name }` | `SourceRepository` |
| `source/worktree/path/suggest` | `{ input: { repoPath, branchName } }` | `string` |
| `source/worktrees/list` | `{ repoPath }` | `SourceWorktree[]` |
| `source/worktree/create` | `{ input: CreateSourceWorktreeInput }` | `SourceWorktree` |

## `clawd` To Client Notifications

`clawd` sends one notification method:

| Method | Params | Notes |
| --- | --- | --- |
| `backend/event/notify` | `ClawBackendEvent` | Sequenced app-owned event for renderer/UI state. Includes small backend-derived `clientState`; `snapshot` is an optional compatibility or recovery checkpoint rather than accompanying each incremental event. |

Routine `snapshot.updated` notifications carry a complete transcript-free
`AppSnapshot`. There is no metadata/full snapshot alias and no global message
array. Provider conversations travel as bounded resets followed by revisioned
deltas:

- `codex.conversationSnapshotChanged` and
  `codex.conversationEventReceived` carry SDK-owned snapshots/events;
- `claude.conversationSnapshotChanged` and
  `claude.conversationEventReceived` carry Claude-host snapshots/events.

Electron forwards these frames without reducing them. The renderer rejects
stale or gapped revisions and rehydrates that provider conversation rather than
replaying a Claw-owned transcript.

Event `type` values come from `BackendPublishedEvent` in
`core/src/contracts/events.ts`: domain facts, provider conversation frames, and
explicit client effects are separate exported unions. The renderer composes
these with its own `ClientTransportEvent`; `client.connectionChanged` never
comes from clawd. Current emitted examples include:

- backend and agent status: `backend.statusChanged`, `agent.updated`,
  `snapshot.updated`, `agent.statusChanged`;
- provider conversations: `codex.conversationSnapshotChanged`,
  `codex.conversationEventReceived`, `claude.conversationSnapshotChanged`,
  `claude.conversationEventReceived`;
- app-owned conversation-adjacent projections: `conversation.modeUpdated`,
  `conversation.goalUpdated`, `conversation.goalCleared`, and
  `conversation.contextUsageUpdated`;
- input lifecycle outside the provider transcript:
  `agentRequest.created`, `agentRequest.resolved`;
- backend-owned prompt queue: `agent.promptQueued`, `agent.promptDequeued`,
  `agent.promptRetryScheduled`;
- artifacts and account state: `conversation.turnDiffUpdated`, `plan.readyForReview`,
  `plan.reviewResolved`, `workspace.fileActivityDetected`,
  `client.markdownDisplayRequested`, `git.statusUpdated`, `git.operationProgress`,
  `account.rateLimitsUpdated`, `skills.changed`;
- native browser feedback: `browser.annotationCreated` (ephemeral element or area metadata that the renderer queues for a batched agent prompt);
- work backlog: `workItem.assignmentUpdated`;
- provider-independent failures are reflected through agent/runtime status;
  provider conversation failures remain inside provider frames.

Claw may inspect provider events to publish domain facts or read-only product
projections, but it never applies those events to a second transcript.
`plan.readyForReview` carries the agent and turn identity plus original Markdown
and optional provider item identity. Clients decide whether and how to present
the review; extracting a heading for a pane title is client policy. Explicit
Markdown-display tool requests still use the separate host presentation event.
Turn diff updates remain data events; repository diff reads return query data.

`Agent.planReview` persists proposal identity, original content, conversation,
turn/item identity and decision status. Replaying the same completion does not
reopen a resolved proposal. The targeted response command rejects stale or
conflicting decisions, allows an identical completed decision idempotently,
and keeps review pending until prompt acceptance succeeds. Cancellation does
not submit a prompt. Execution progress remains a separate projection.

`AppSnapshot.agentRequests` is the runtime projection for pending approvals,
questions and tool confirmations. Both adapters publish the same creation and
typed resolution lifecycle, while preserving their native transcript frames.
Provider request handles are not persisted. Answer routing uses agent/request
identity, guards concurrent submissions, and permits retry after transport
failure. Releases and resolutions invalidate handles.

Scoped projections carry an opaque `conversationId` when bound; attachment
requires it. Common settings carry model/effort/service tier/permission fields,
not a Codex protocol object. Rate limits, goals and usage use exactly one wrapper:
`{ rateLimits }`, `{ goal }`, and `{ contextUsage }`.

Navigation, ordering, external-application choice, theme and presentation
preferences are persisted under `clientPreferences`, not remote agent runtime.
Desktop uses the `desktop` client profile; authenticated browsers have a stable
per-browser identity. Request metadata `_clientId` selects a profile and is
stripped before domain dispatch. Forwarded clawd calls use a separate remote
controller profile, never the remote desktop's profile. Client commands do not
load conversations; clients explicitly request `agent/conversation/load`.

Capabilities explicitly advertise review/input, plugins, archive, resume,
summary replacement and remote control. Unsupported archive returns
`{ supported: false }`; unsupported history and summary reads report errors,
not successful empty results. Provider catalog UI respects capabilities.

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
