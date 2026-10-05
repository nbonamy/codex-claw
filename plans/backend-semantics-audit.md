# Backend semantics audit

Status: **all semantic remediation items implemented**. Tests and lint pass;
the repository-wide coverage gate remains blocked by existing deficits.
The tables retain the pre-migration inventory for traceability;
their proposed names are now the implemented names, including the contract
reshapes in section 7. The broad integration-test inventory remains a separate
next phase, not unfinished semantic remediation.

Inventory: **160 registered RPC methods, 40 top-level events, 40 direct driver
methods** at the audit baseline. After remediation: **163 registered RPC methods,
40 top-level events (39 backend-published plus one client transport event)**.

## Scope and how to read this

The primary subject is **Korus's backend abstraction**, not the SDKs and not a
UI redesign. The inventory includes every registered JSON-RPC method and every
top-level app event, plus the direct `AgentBackendDriver` interface. Host callbacks
and internal driver RPC are separated so they are not confused with product APIs.
Nested provider-native transcript events, MCP tool names and Electron IPC channel
names are outside this naming inventory. They are not alternative domain contracts.

Each table gives the current purpose, whether a rename is needed, and the proposed
name. **No / —** means keep the current name, not that every implementation detail
has been proved correct. **Reshape** means renaming alone cannot fix the semantics.
**Move** means the operation belongs to client state or host effects, not the agent
domain. “Current” in the inventory tables means the audited baseline; use the
replacement column and [current protocol](../docs/protocol.md) for implementation.

## Remediation completion

| Area | Implemented result |
| --- | --- |
| Ownership | Independent domain, provider-frame, client-effect and client-transport event unions. Backend code no longer depends on the renderer event union. |
| Identity/settings | Opaque conversation identity on projections; required on attachment. Both adapters emit common settings/mode shapes. Native transcript frames remain untouched. |
| Review | Persisted proposal identity/content/status, targeted accept/revise/cancel, stale/conflicting decision rejection, idempotence and failure retry. Desktop opens/closes its own pane. |
| Agent input | Normalized creation/resolution and pending runtime snapshot, typed outcomes, agent-targeted routing, ambiguity/concurrency/scope checks, retry and handle cleanup. |
| Navigation | Per-client persisted selection/order/appearance/external-app preferences, serialized updates, independent remote-controller identity. Loading remains explicit. |
| Queries | Snapshot/client hints are read-only; startup initialization owns maintenance. Git reads return data/errors. Runtime inspect and sync are separate operations. |
| Lifecycle/auth | Reset, summary replacement, load/release, remote control, authorization polling and generic login cancellation renamed throughout backend routes and consumers. Team creation and connection are separate commands. |
| Capabilities | Explicit review/input/plugins/archive/resume/summary/remote-control discovery. Unsupported operations return an explicit unsupported result or error. Summary replacement no longer means provider-specific compaction. |
| Payloads | One rate-limit/goal/usage wrapper, no dual accepted shapes. History failures carry a safe error and conversation identity. |

Compatibility boundaries are intentional: UI labels and Electron host-adapter
names are not provider protocol; provider-owned nested events keep their native
names. Legacy persisted selection is a fallback for clients without a profile.
Transient provider request handles are reconstructed, not saved to disk.

### Verification — 2026-09-16

- `npm run test:ai`: 2,306 workspace tests and 6 script tests pass after the
  independent review corrections below.
- `npm run lint`: all workspace typechecks, Vue styles and dead-code checks pass.
- `git diff --check`: passes. Commit requested after review corrections; no push requested.
- Mounted application tests cover opening a domain review and clearing it after
  resolution, including resolution by another client. No live desktop smoke run
  was performed for this migration.
- Coverage was run across every workspace. Core, backend, Vue and Electron still
  fail configured thresholds; the isolated unchanged baseline fails those gates
  too. New core-helper and web branches received direct tests; web now passes all
  coverage thresholds. No thresholds were lowered. This is not a claim that the
  migration is release-ready or that the broader integration-test audit is done.

### Semantic-phase learnings

- Rename contracts end to end, but also inspect their payload, identity, lifetime
  and side effects: a better name alone does not establish a domain boundary.
- Keep provider transcripts native; normalize only Korus-owned product facts.
- Persist review decisions and client preferences at their respective ownership
  boundaries. Replayed events and another client's actions must not reopen work.
- Verify changed behavior at public seams; distinguish passing tests from a
  passing coverage gate and record preexisting failures explicitly.

### Independent review corrections — 2026-09-16

The first completion claim was premature. A native Codex reviewer identified five
concrete gaps; all five received implementation changes and regression coverage:

| Finding | Correction and regression |
| --- | --- |
| Remote pending requests lacked routing after snapshot-only reconnect | Route the targeted response to its owning daemon, which validates authoritative pending state. A two-server test starts with an already pending question and no replayed event. |
| Git refresh depended on legacy shared selection | Debounced file-change refresh is agent-scoped, not selection-scoped. Cached client selection explicitly loads/refreshes without clearing the conversation. Service and application-state tests cover both. |
| Remote snapshot operations changed shared navigation | Removed shared selection writes from remote result adoption. The two-server test verifies another client's preferences and shared navigation remain unchanged. |
| Overlapping creations selected the first new entity | Capture the exact created ID inside each operation before asynchronous persistence; never infer it from a shared before/after ID-set difference. Concurrent agent/team creation tests assert separate client selections. |
| Provider adapters discarded targeted request identity | Key pending requests by agent plus request ID, retain identity through owner lookup, and strip Korus metadata only at the chosen native request. Codex approval/question and Claude SDK collision tests verify one agent cannot answer another's request. |

The coverage gate was rerun: core, backend, Vue and Electron still fail their
configured thresholds; web passes. No thresholds changed. No live SSH or desktop
smoke test was performed. These targeted regressions do not replace the upcoming
integration-test inventory.

The same independent reviewer rechecked these five findings and found no remaining
blocker within that scope, independently running 71 focused backend tests. Remote
concurrent creation was checked in source; the executable creation-race regression
covers local quick-chat and team creation.

### Structural review correction — 2026-09-16

A different native Codex reviewer identified one remaining competing authority:
legacy shared selection still targeted default creation and gated client effects.
Creation now resolves an omitted team from the initiating client's projection
once, before domain dispatch. Location resolution requires an explicit valid
team; legacy core callers use a stable default, never shared active navigation.
Two-server regressions cover normal and quick-chat creation by different clients
with omitted team IDs, including local versus remote execution and invalid targets.

Celebration requests are emitted for clients to filter; their result confirms
`requested`, not actual display. Speech retains backend-owned global enablement
and dictated-input policy, but receiving clients own mute, selection, foreground
and voice decisions. Host tests verify voice is read afresh and cannot be chosen
by the backend payload.

## Main findings

1. **Plans and Git diffs leak presentation.** Plan readiness becomes a panel request;
   reading a Git diff emits a panel request rather than returning the diff.
2. **Conversation lifecycle is misleading.** `thread.started` also reports attachment
   to an existing conversation. It is not proof of conversation creation or a new turn.
3. **Unified events have provider-specific shapes.** Settings are Codex-only; session
   identity and mode updates differ between providers. Renaming `thread` alone is insufficient.
4. **Input requests are not a unified domain lifecycle.** Approvals and questions use
   provider frames plus partially overlapping Korus events. A headless policy should not
   need to inspect those frames to discover a pending request.
5. **Selection mixes navigation with runtime work.** Agent/team selection persists
   active selection and triggers hydration/refresh; remote selection also changes remote state.
6. **Some verbs overpromise.** Work-provider `complete` may only poll; `session/compress`
   replaces a conversation with a summarized successor; `connections/sync` combines inspection
   with installation. These need precise operations, not cosmetic names.
7. **Remote control is called device pairing.** Its status and enable/disable methods
   govern a remote-control environment, not just a pairing attempt.
8. **Type ownership is reversed.** Both backend event types derive from
   `MainToRendererEvent`. Backend domain contracts should be defined independently.

Do not rename everything for consistency alone. Agent/team CRUD, queues, goals,
Git mutations, filesystem operations, automations, assignments and catalogs mostly
already describe domain operations. Explicit browser and OS-setting actions are
legitimate host capabilities, not domain bugs.

## 1. Top-level events

Source: [event union](../core/src/contracts.ts),
[ownership inventory](../core/src/snapshot-event-ownership.ts).

### Runtime, catalogs and agent coordination

| Current event | Purpose today | Rename needed? | Proposed name |
| --- | --- | --- | --- |
| `backend.statusChanged` | Provider runtime availability and capabilities. | No | — |
| `client.connectionChanged` | Client's connection to daemon changed. | Move; name is accurate | Keep in client transport events, outside backend domain events |
| `snapshot.updated` | Authoritative product snapshot changed. | No | — |
| `account.rateLimitsUpdated` | Provider account usage/rate limits changed. | No; normalize direct vs wrapped payload | — |
| `devicePairing.statusChanged` | Remote-control environment connection state changed. | Yes | `remoteControl.statusChanged` |
| `models.changed` | Provider model catalog refreshed. | No | — |
| `skills.changed` | Workspace-scoped skill catalog loaded. | No | — |
| `agentCreation.progress` | Agent/workspace initialization progress. | No | — |
| `git.operationProgress` | Long-running Git operation progress. | No | — |
| `workBacklog.assignmentUpdated` | Work-item assignment changed, not necessarily a backlog UI action. | Yes | `workItem.assignmentUpdated` |
| `agent.updated` | Agent metadata/product state changed. | No | — |
| `agent.statusChanged` | Working, idle, awaiting input or other agent status changed. | No | — |
| `agent.promptQueued` | Prompt entered the backend queue. | No | — |
| `agent.promptRetryScheduled` | Queued prompt retry scheduled. | No | — |
| `agent.promptDequeued` | Prompt IDs removed from the queue. | No; does not mean executed successfully | — |
| `git.statusUpdated` | Repository status/diff summary refreshed. | No | — |

### Conversation-domain events

| Current event | Purpose today | Rename needed? | Proposed name |
| --- | --- | --- | --- |
| `thread.started` | Bind/publish an agent's provider session, including existing sessions. | Yes + reshape identity | `agent.conversationAttached` |
| `thread.settingsUpdated` | Publish Codex model/effort/service-tier/permission settings. | Yes + normalize for both adapters | `conversation.settingsUpdated` |
| `thread.modeUpdated` | Publish plan/default mode, with differing provider payloads. | Yes + normalize | `conversation.modeUpdated` |
| `thread.goalUpdated` | Goal created or changed. | Yes; remove provider vocabulary | `conversation.goalUpdated` |
| `thread.goalCleared` | Current goal removed. | Yes; include conversation identity | `conversation.goalCleared` |
| `thread.tokenUsageUpdated` | Context-window/token usage projection changed. | Yes; payload is context usage | `conversation.contextUsageUpdated` |
| `thread.historyHydrationFailed` | Restoring the conversation/history failed. | Yes; include identity and error | `conversation.historyLoadFailed` |
| `diff.updated` | A turn's aggregate Git diff changed. | Yes; specify which diff | `conversation.turnDiffUpdated` |
| `file.activity` | File mutation activity used for workspace refresh. | Yes; factual event, not full file content | `workspace.fileActivityDetected` |
| `subagent.operationChanged` | Provider child-agent operation state changed. | No | — |
| `subagent.activityChanged` | Provider child-agent activity changed. | No | — |
| `subagent.identityChanged` | Provider child-agent identity metadata changed. | No | — |
| `subagent.statusChanged` | Provider child-agent status changed. | No | — |

For all domain projections use a uniform conversation reference. Provider-native
IDs can remain in an opaque/discriminated reference, but consumers must not branch
on `threadId` versus `backendSessionId` to interpret the event. Keep provider-specific
options as extensions; expose common settings through a common shape and capabilities.
Subagent payloads already use conversation IDs internally; their envelope still
needs the same identity cleanup.

### Review, input requests and presentation effects

| Current event | Purpose today | Rename needed? | Proposed name |
| --- | --- | --- | --- |
| `sidePanel.markdownRequested` | Both proposed-plan review and explicit Markdown display. | Split domain fact from host effect | Plan: `plan.readyForReview`; explicit display: `client.markdownDisplayRequested` |
| `sidePanel.gitDiffRequested` | Automatic turn-diff display and result/error of explicit diff reads. | Remove this domain event | Use `conversation.turnDiffUpdated` for changes and `agent/git/diff/get` results for reads |
| `backendApproval.requested` | Codex-typed approval request outside transcript. | Merge into normalized request lifecycle | `agentRequest.created` with `kind: approval` |
| `backendApproval.resolved` | Approval outcome, scope and reason. | Merge into normalized request lifecycle | `agentRequest.resolved` with typed outcome |
| `clientRequest.resolved` | Completion of a tool confirmation or question. | Merge; avoid duplicate resolution events | `agentRequest.resolved` |
| `celebration.requested` | Explicit celebratory visual effect requested by tool. | Move to explicit client effects | `client.celebrationRequested` |
| `browser.annotationCreated` | User captured browser element/area feedback for an agent. | No; client-originated input, separate from provider events | — |

The new request lifecycle must also publish question creation; today it is discovered
inside provider frames. Preserve question delivery/blocking, allowed approval outcomes,
request identity and cancellation. The backend publishes facts; a desktop or headless
policy supplies the response. Do not duplicate provider transcript state.

### Provider-native conversation transport (intentional exceptions)

| Current event | Purpose today | Rename needed? | Proposed name |
| --- | --- | --- | --- |
| `codex.conversationSnapshotChanged` | Carry an SDK-owned conversation reset/revision. | No; transport envelope, not unified product semantics | — |
| `codex.conversationEventReceived` | Carry an SDK-owned conversation delta/revision. | No | — |
| `claude.conversationSnapshotChanged` | Carry Claude-host conversation reset/revision. | No | — |
| `claude.conversationEventReceived` | Carry Claude-host conversation delta/revision. | No | — |

Retain these frames for their respective conversation renderers. Product decisions
such as opening review or responding to a question use the normalized domain contract.

## 2. Product methods

Source: [registered methods](../core/src/backend-protocol/methods.ts),
[server routing](../backend/src/server.ts).

### Agent lifecycle, conversation and prompts

| Current method | Purpose today | Rename needed? | Proposed name |
| --- | --- | --- | --- |
| `agent/create` | Create an agent in its owning location. | No; selection should be client policy | — |
| `agent/quickChat/create` | Create a non-project chat in a managed scratch workspace. | No | — |
| `agent/update` | Update agent configuration and workspace metadata. | No | — |
| `agent/delete` | Remove product agent, archiving supported conversation; optional confirmed worktree cleanup. | No; product deletion is accurate, not transcript deletion | — |
| `agent/duplicate` | Copy agent configuration, not conversation history. | No | — |
| `agent/fork` | Create another agent from a forked conversation. | No | — |
| `agent/restart` | Archive/release current conversation and clear its binding; not restart the provider process. | Yes | `agent/conversation/reset` |
| `agent/session/compress` | Summarize into a replacement conversation and archive the old one after acceptance. | Yes | `agent/conversation/replaceWithSummary` |
| `agent/conversations/list` | Search/list resumable conversation history. | No | — |
| `agent/conversation/resume` | Attach selected historical conversation, displacing current one. | No | — |
| `agent/conversation/messages/get` | Read a historical conversation's messages. | No | — |
| `agent/history/hydrate` | Restore provider conversation state and publish its reset without selection. | Yes; scope it to conversation | `agent/conversation/load` |
| `agent/history/loadOlder` | Load the next older conversation history page. | Yes; scope it to conversation | `agent/conversation/history/loadOlder` |
| `agent/prompt/send` | Submit a prompt; backend starts or queues it. | No; document acceptance vs completion | — |
| `agent/prompt/steer` | Send input to an active turn. | No | — |
| `agent/queuedPrompt/update` | Edit queued prompt. | No | — |
| `agent/queuedPrompt/delete` | Remove queued prompt. | No | — |
| `agent/queuedPrompt/steer` | Deliver queued input to current turn. | No | — |
| `agent/interrupt` | Interrupt current execution, not close agent. | No | — |
| `agent/turn/delete` | Provider-defined removal of conversation turn/history. | No; capability and destructive scope must be explicit | — |
| `agent/turn/edit` | Edit a prompt and rerun from that turn. | No; document rerun side effect | — |
| `agent/turn/retry` | Rerun selected turn. | No | — |
| `agent/goal/update` | Set/change agent conversation goal. | No | — |
| `agent/goal/clear` | Clear agent conversation goal. | No | — |
| `agent/approvalPreset/update` | Apply advertised approval preset. | No; provider-specific values stay adapter-owned | — |
| `agent/permissionMode/update` | Apply advertised permission mode. | No | — |
| `agent/models/list` | Return normalized model catalog. | No | — |
| `agent/plugins/list` | Return installed provider plugin catalog. | No; expose availability through capabilities | — |
| `agent/skills/list` | Return normalized skill catalog. | No | — |
| `client/request/respond` | Answer an agent approval/question, not a host RPC callback. | Yes + normalize response types | `agent/request/respond` |

### Navigation and organization

| Current method | Purpose today | Rename needed? | Proposed name |
| --- | --- | --- | --- |
| `agent/select` | Persist selection plus hydrate/refresh; forwards remote selection. | Split | `client/navigation/selectAgent` plus explicit `agent/conversation/load` |
| `team/select` | Persist team/agent selection plus reconcile/load workspace. | Split | `client/navigation/selectTeam` plus separate runtime loading |
| `agent/reorder` | Persist ordering within team. | Move to client preference API | `client/agentOrder/update` |
| `team/reorder` | Persist team ordering. | Move to client preference API | `client/teamOrder/update` |
| `repository/reorder` | Persist repository ordering. | Move to client preference API | `client/repositoryOrder/update` |
| `agent/externalApplication/update` | Remember preferred desktop application for agent workspace. | Move to client preference API | `client/agentExternalApplication/update` |
| `agent/team/move` | Change actual agent membership. | No; domain operation | — |
| `team/create` | Create local/remote team or attach a remote-team pointer. | Reshape create-versus-attach variants | Keep `team/create`; add `team/connect` for existing remote team |
| `team/update` | Edit team metadata; may change empty team's backend location. | No; location mutation must remain explicit | — |
| `team/delete` | Delete team at owning location. | No | — |
| `team/disconnect` | Remove local pointer, leaving remote team running. | No | — |

Client-state APIs may still use daemon persistence, but must not mutate another
client's navigation implicitly. These changes need client identity/state scoping,
not just a new prefix. Headless operation must not depend on selecting an agent.

### Workspace and Git

| Current method | Purpose today | Rename needed? | Proposed name |
| --- | --- | --- | --- |
| `agent/files/list` | List files under agent workspace. | No | — |
| `agent/file/preview` | Return bounded, classified workspace file content. | No; preview describes bounded data, does not open UI | — |
| `agent/folder/validate` | Validate supplied directory; internal fallback, no agent identity. | Yes; internal workspace service | `workspace/folder/validate` |
| `agent/git/diff/open` | Compute/read diff then emit panel success/error. | Yes + return data/error | `agent/git/diff/get` |
| `agent/git/workflow/get` | Read branch, files, worktree and integration state. | No | — |
| `agent/git/message/generate` | Generate Git-related commit/PR wording. | No | — |
| `agent/git/stage` | Stage explicitly confirmed paths. | No | — |
| `agent/git/commit` | Commit index with confirmed message. | No | — |
| `agent/git/push` | Push named branch; optional explicit post-push cleanup. | No | — |
| `agent/git/branch/create` | Create/switch branch, optionally linked worktree. | No; preserve explicit options | — |
| `agent/git/pullRequest/create` | Create draft PR with optional delegated handoff. | No | — |
| `agent/git/merge` | Merge branch with explicit cleanup/report/push options. | No | — |
| `source/folder/detect` | Detect default source root. | No; internal discovery | — |
| `source/folders/list` | List local/remote child directories. | No | — |
| `source/repositories/list` | Discover repositories in configured source root. | No | — |
| `source/repository/clone` | Clone repository at selected backend location. | No | — |
| `source/repository/create` | Create source folder and initialize Git repository. | No | — |
| `source/branches/list` | List repository branches. | No | — |
| `source/worktree/create` | Create linked worktree. | No | — |
| `source/worktree/path/suggest` | Calculate suggested worktree location. | No | — |
| `source/worktrees/list` | List linked worktrees. | No | — |

### Work integrations and automations

| Current method | Purpose today | Rename needed? | Proposed name |
| --- | --- | --- | --- |
| `agent/workItem/assign` | Assign external work item to an agent. | No | — |
| `agent/workItem/assignment/delete` | Remove persisted assignment. | No | — |
| `workProvider/connect` | Begin provider authorization and return URL/code. | No; begin rather than guarantee completion | — |
| `workProvider/authorization/open` | Open pending authorization URL on client. | Remove redundant product method | Use returned authorization URL and existing `client/external/open` host capability |
| `workProvider/connection/complete` | Poll authorization; may remain pending or error. | Yes | `workProvider/authorization/poll` |
| `workProvider/connections/reload` | Reload connection metadata from credential storage. | No | — |
| `workProvider/disconnect` | Remove provider connection/credentials. | No | — |
| `workProvider/backlog/configure` | Configure repository work-item source/filter. | No; backlog is a domain concept too | — |
| `workProvider/globalItems/list` | Paginated work items across repositories. | No | — |
| `workProvider/assignedItems/list` | Retrieve assigned work items. | No | — |
| `workProvider/items/list` | Work items for selected repository. | No | — |
| `workProvider/repositories/list` | Available provider repositories. | No | — |
| `automation/create` | Create automation schedule/configuration. | No | — |
| `automation/update` | Update automation schedule/configuration. | No | — |
| `automation/run` | Start immediate automation execution. | No | — |
| `automation/delete` | Delete automation configuration. | No | — |
| `automation/history/clear` | Remove automation execution history. | No | — |
| `automation/execution/delete` | Remove selected execution record. | No | — |
| `snapshot/automations/get` | Product snapshot for local/remote automation management. | No; valid scoped snapshot query | — |

### Connections and remote control

| Current method | Purpose today | Rename needed? | Proposed name |
| --- | --- | --- | --- |
| `connections/ssh/create` | Save/probe/provision SSH connection. | No; provisioning side effects must remain explicit | — |
| `connections/sshHosts/list` | Discover SSH host aliases. | No | — |
| `connections/update` | Update connection settings/source root. | No | — |
| `connections/delete` | Remove connection and local pointers, not remote work. | No | — |
| `connections/sync` | Inspect versions OR install runtime and synchronize resources. | Split query from mutation | `connections/runtime/inspect` and `connections/runtime/sync` |
| `devicePairing/status/get` | Get remote-control environment status. | Yes | `remoteControl/status/get` |
| `devicePairing/enable` | Enable remote-control environment. | Yes | `remoteControl/enable` |
| `devicePairing/disable` | Disable remote-control environment. | Yes | `remoteControl/disable` |
| `devicePairing/start` | Start a pairing attempt/code. | Yes; pair under remote control | `remoteControl/pairing/start` |
| `devicePairing/pairing/status` | Check whether pairing attempt succeeded. | Yes | `remoteControl/pairing/check` |
| `devicePairing/clients/list` | List paired remote clients. | Yes | `remoteControl/clients/list` |
| `devicePairing/client/revoke` | Revoke paired client. | Yes | `remoteControl/client/revoke` |

Remote control currently routes through `requireCodexDriver()`. If kept in the
unified interface, advertise a remote-control capability and route by selected
backend; do not imply that every provider implements it. This is distinct from SSH.

### Authentication, settings and synchronization

| Current method | Purpose today | Rename needed? | Proposed name |
| --- | --- | --- | --- |
| `codex/authentication/get` | Read Codex account/login state. | No; explicit provider extension | — |
| `codex/authentication/chatgpt/start` | Start browser ChatGPT login. | No; explicit provider extension | — |
| `codex/authentication/deviceCode/start` | Start ChatGPT device-code login. | No; explicit provider extension | — |
| `codex/authentication/chatgpt/cancel` | Cancel browser or device-code login by login ID. | Yes; avoid flow-specific cancellation | `codex/authentication/login/cancel` |
| `codex/authentication/logout` | Clear Codex authentication. | No | — |
| `settings/instructions/read` | Read selected engine's developer instructions. | No; engine selector is intentional | — |
| `settings/instructions/save` | Save selected/all engine developer instructions. | No | — |
| `settings/update` | Mutate mixed execution policies and desktop preferences. | Split ownership; keep domain name | `settings/update` for backend policy; `client/preferences/update` for presentation |
| `settings/codexResourceSharing/get` | Inspect Codex resource-sharing configuration. | No; provider-specific administration | — |
| `settings/codexResourceSharing/set` | Change shared/isolated Codex resource configuration. | No | — |
| `settings/pluginStatus/get` | Inspect configured plugin installation status. | No | — |
| `backend/health/get` | Backend liveness/version. | No | — |
| `snapshot/get` | Retrieve authoritative snapshot and sequence checkpoint; currently also starts maintenance/refresh work. | No rename; disentangle unrelated side effects | — |
| `client/state/get` | Backend-derived source-root and power-policy hints. | No; explicit client-facing projection | — |
| `backend/event/notify` | Transport notification carrying sequenced event. | No; envelope, not a domain action | — |

Provider-specific authentication is not automatically a defect. Do not invent
fake common OAuth flows; expose supported authentication options through capability
descriptors when clients need discovery. Agent execution must remain provider-neutral.

## 3. Host callbacks and host-facing adapters

These are intentionally platform-dependent operations. Keep them in a separate
host capability contract; they are not instructions for how a domain event must render.

| Current method | Purpose today | Rename needed? | Proposed name |
| --- | --- | --- | --- |
| `client/external/open` | Ask host to open external URL. | No | — |
| `client/spokenAnnouncement/queue` | Enqueue requested speech on host. | No | — |
| `client/browser/open` | Open/navigate agent's browser. | No | — |
| `client/browser/execute` | Execute addressed browser operation. | No | — |
| `client/computerUse/execute` | Execute native computer-use operation. | No | — |
| `client/computerUse/stop` | Stop native helper/session. | No | — |
| `client/computerUse/requestAccessibility` | Ask host to request accessibility permission. | No | — |
| `client/computerUse/status/get` | Read helper/permission availability. | No | — |
| `client/system/permissions/get` | Read native OS permission state. | No | — |
| `client/system/permissions/accessibility/open` | Open OS accessibility settings. | No | — |
| `client/system/permissions/screenRecording/open` | Open OS screen-recording settings. | No | — |
| `system/permissions/get` | Product-facing wrapper for host permission query. | No; explicitly host-scoped | — |
| `system/permissions/accessibility/open` | Wrapper requesting OS accessibility settings. | No | — |
| `system/permissions/screenRecording/open` | Wrapper requesting OS screen-recording settings. | No | — |

## 4. Internal driver RPC

These are implementation routing operations, not additional UI APIs.
Names should still accurately describe their behavior.

| Current method | Purpose today | Rename needed? | Proposed name |
| --- | --- | --- | --- |
| `driver/approvalPreset/update` | Apply driver approval preset. | No | — |
| `driver/permissionMode/update` | Apply driver permission mode. | No | — |
| `driver/clientRequest/respond` | Route agent input decision to owning driver. | Yes; consistent domain request | `driver/agentRequest/respond` |
| `driver/conversation/messages/get` | Read historical messages. | No | — |
| `driver/conversation/summary/get` | Read one conversation summary. | No | — |
| `driver/conversation/fork` | Fork provider conversation to target agent. | No | — |
| `driver/conversation/archive` | Archive conversation if implemented; currently silent no-op otherwise. | No name change; define unsupported result | — |
| `driver/conversation/resume` | Resume provider conversation. | No | — |
| `driver/session/compress` | Replace conversation through summary handoff. | Yes | `driver/conversation/replaceWithSummary` |
| `driver/conversation/title/update` | Update provider conversation title. | No | — |
| `driver/conversations/list` | List provider history. | No | — |
| `driver/conversations/reconcile` | Reconcile archive/attachment lifecycle against agents. | No | — |
| `driver/file/preview` | Bounded workspace file read; implemented by filesystem service, not SDK. | Move service namespace | `workspace/file/preview` |
| `driver/files/list` | Workspace file listing, not provider SDK work. | Move service namespace | `workspace/files/list` |
| `driver/text/generate` | Ephemeral structured/text generation. | No | — |
| `driver/goal/clear` | Clear provider goal. | No | — |
| `driver/goal/update` | Set provider goal. | No | — |
| `driver/history/hydrate` | Restore active provider conversation. | Yes | `driver/conversation/load` |
| `driver/history/loadOlder` | Load older history page. | Yes | `driver/conversation/history/loadOlder` |
| `driver/interrupt` | Interrupt active execution. | No | — |
| `driver/models/list` | Read provider models. | No | — |
| `driver/plugins/list` | Read provider plugins. | No | — |
| `driver/promptCommand/handle` | Intercept provider slash command if recognized. | No | — |
| `driver/prompt/send` | Start provider prompt. | No | — |
| `driver/prompt/steer` | Steer active provider turn. | No | — |
| `driver/session/forget` | Release live driver session binding without deleting persisted history. | Yes | `driver/conversation/release` |
| `driver/skills/list` | Read provider skills. | No | — |
| `driver/turn/delete` | Provider turn deletion. | No | — |
| `driver/turn/edit` | Provider edit-and-rerun. | No | — |
| `driver/turn/retry` | Provider retry. | No | — |
| `driver/codex/authentication/get` | Read Codex authentication extension. | No | — |
| `driver/codex/authentication/chatgpt/cancel` | Cancel any supported login flow. | Yes | `driver/codex/authentication/login/cancel` |
| `driver/codex/authentication/chatgpt/start` | Start browser login. | No | — |
| `driver/codex/authentication/deviceCode/start` | Start device-code login. | No | — |
| `driver/codex/authentication/logout` | Log out provider. | No | — |

## 5. Debug-only methods

| Current method | Purpose today | Rename needed? | Proposed name |
| --- | --- | --- | --- |
| `debug/agentMessage/send` | Send a synthetic teammate message. | No | — |
| `debug/executionPlan/toggle` | Insert/remove synthetic execution progress. | No; route through domain projection, not presentation | — |
| `debug/planReview/inject` | Emit synthetic panel request directly. | Yes + use semantic producer | `debug/planReadyForReview/inject` |

## 6. Direct backend driver interface

Source: [AgentBackendDriver](../core/src/backend-driver.ts). This is the actual
shared adapter seam; including it avoids auditing only its RPC wrapper.

| Current method | Purpose | Rename needed? | Proposed name |
| --- | --- | --- | --- |
| `getRuntimeStatus` | Read provider availability. | No | — |
| `getCapabilities` | Read supported operations/options for agent. | No | — |
| `generateText` | Ephemeral generation. | No | — |
| `tryHandlePromptCommand` | Handle recognized provider command. | No | — |
| `preparePromptOptions` | Apply provider-specific prompt policy. | No; adapter hook, not client API | — |
| `sendPrompt` | Start execution. | No | — |
| `setConversationTitle` | Change title. | No | — |
| `setGoal` | Set objective. | No | — |
| `clearGoal` | Clear objective. | No | — |
| `setApprovalPreset` | Apply approval preset. | No | — |
| `setPermissionMode` | Apply permission mode. | No | — |
| `forgetAgentSession` | Release live binding, preserve stored conversation. | Yes | `releaseConversation` |
| `archiveAgentConversation` | Archive agent's attached conversation. | No | — |
| `reconcileConversations` | Reconcile attachment/archive state. | No | — |
| `interrupt` | Interrupt execution. | No | — |
| `respondToRequest` | Resolve agent input request. | Yes; disambiguate host RPC | `respondToAgentRequest` |
| `hydrateAgent` | Load conversation, not entire product agent. | Yes | `loadConversation` |
| `loadOlderHistory` | Load preceding history page. | No | — |
| `listConversations` | Search historical sessions. | No | — |
| `resumeConversation` | Restore selected conversation. | No | — |
| `compressSession` | Summary-handoff replacement, not in-place compaction. | Yes | `replaceConversationWithSummary` |
| `forkConversation` | Fork conversation to another agent. | No | — |
| `readConversationMessages` | Read historical messages. | No | — |
| `readConversationSummary` | Read metadata/preview. | No | — |
| `steerPrompt` | Inject input into active execution. | No | — |
| `deleteTurn` | Remove turn/history according to capability. | No | — |
| `editTurn` | Edit prompt and rerun. | No | — |
| `retryTurn` | Retry turn. | No | — |
| `listModels` | Model catalog. | No | — |
| `listPlugins` | Plugin catalog. | No | — |
| `listSkills` | Skill catalog. | No | — |
| `getDevicePairingStatus` | Remote-control environment status. | Yes | `getRemoteControlStatus` |
| `enableDevicePairing` | Enable remote control. | Yes | `enableRemoteControl` |
| `disableDevicePairing` | Disable remote control. | Yes | `disableRemoteControl` |
| `startDevicePairing` | Start pairing attempt. | No; already specific | — |
| `checkDevicePairing` | Check pairing success. | No | — |
| `listPairedDevices` | List authorized devices. | No | — |
| `revokePairedDevice` | Revoke device authorization. | No | — |
| `onEvent` | Subscribe to backend events. | No; change event type ownership | — |
| `close` | Dispose driver and subscriptions. | No | — |

## 7. Contract changes that names alone cannot solve

| Area | Required semantic change |
| --- | --- |
| Event ownership | Define domain events independently of `MainToRendererEvent`; distinguish provider transport and client effects. |
| Conversation identity | Consistent opaque conversation reference on attachment, settings, mode, goals, usage, requests and subagent envelopes. |
| Settings | Common model/effort/mode projection for both backends; provider extensions remain optional. Do not force UI to decode `CodexThreadSettings`. |
| Plan review | Add pending proposal identity/state and targeted `agent/planReview/respond`; publish `plan.readyForReview` and `plan.reviewResolved`. Execution progress is a different fact. |
| Agent input | Add normalized `agentRequest.created` for both approvals/questions and one resolution lifecycle, plus pending snapshot state. Preserve provider-owned transcript rendering. |
| Capabilities | Explicitly represent supported review/input, plugins, archive/resume/summary replacement and remote-control operations where optional methods currently stand in for capability discovery. Derive from adapters, not UI provider checks. |
| Navigation | Scope persisted client selection/order/preferences separately; no remote UI selection required to load or run an agent. |
| Query side effects | `snapshot/get` currently performs maintenance, workspace reconciliation and selected-agent Git refresh; isolate unrelated work from snapshot synchronization. Git diff reads return results/errors, not UI events. |
| Unsupported operations | Distinguish unsupported from successful no-op or empty result, especially archive, history listing and summary reads. Some idempotent no-ops remain legitimate. |
| Payload wrappers | Rate limits, goals and usage accept both direct and wrapped shapes. Choose one app-owned shape at the adapter boundary. |

## Evidence for the non-obvious findings

- [Codex adapter](../backend/src/codex/codex-surface-adapter.ts): `publishInitial` emits
  `thread.started` when publishing a bound conversation, then settings/goal/context projections.
- [Claude host](../backend/src/claude/claude-conversation-host.ts): `resolveTurnStart`
  emits the same name with a different session payload.
- [Server](../backend/src/server.ts): `emitPlanPreviewForEvent` and
  `emitGitDiffPreviewForEvent` synthesize panel events; `agentSelect`/`teamSelect`
  combine navigation and loading; debug review bypasses the semantic producer.
- [Git workflow service](../backend/src/git/agent-git-workflow-service.ts): `openDiff`
  emits success/error presentation events instead of returning a diff query result.
- [Work integration manager](../backend/src/work-integrations/manager.ts):
  `completeConnection` polls and returns while pending; `openAuthorization` invokes
  a client URL-open operation whose URL was already returned at connect time.
- [Driver RPC](../backend/src/driver-rpc.ts): pairing routes directly to Codex;
  archive can silently no-op; file preview/list are filesystem service calls.
- [Request registry](../backend/src/agent-requests/agent-request-registry.ts):
  discovers pending requests by inspecting multiple provider event names and shapes.
- [Capabilities](../core/src/contracts/backend.ts): `history` and `planMode` do not
  describe all optional lifecycle/review operations present on the driver interface.
- [Protocol](../docs/protocol.md): useful architecture reference, but its historical
  `load-older` spelling is stale. This inventory uses current source `loadOlder`.

## Completion and next step

The naming inventory is checked against the registered method catalog, top-level
event union and direct driver interface so every current entry appears once in its
respective table. This is a source-level semantic audit, not runtime verification
or a completed testing audit. No claims about SDK internal correctness are made.

Semantic fixes are implemented. Focused regression tests cover the changed
boundaries, including client isolation/persistence, request routing and review
lifecycle. Broader test inventory and pruning follow these corrected contracts.
