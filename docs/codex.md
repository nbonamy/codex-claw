# Codex Integration

Codex Claw talks to Codex through the Codex app-server. All provider
communication with Codex happens in `clawd`, not Electron main. Electron main
forwards renderer IPC over the app-owned backend protocol, fans backend events
to the renderer, and owns only desktop-native callbacks.

## Boundary

`clawd` responsibilities:

- choose an explicit Codex executable override when configured, otherwise use
  the Codex executable supplied by its local desktop host;
- start or connect to `codex app-server`;
- initialize the app-server session;
- own JSON-RPC request IDs and response matching;
- route server notifications to the right agent/session;
- answer server-initiated approval and user-input requests;
- wrap SDK-owned conversation snapshots/events in Claw's agent/thread/revision
  routing envelope;
- persist only app product state, not Codex transcripts.

Codex assistant text keeps the app-server's optional `commentary` or
`final_answer` phase through this adapter. Completed reasoning items contribute
only their app-server-provided summaries; raw reasoning content is never copied
into Claw state. The shared SDK Vue renderer uses those semantics to keep work
expanded while a turn runs, then collapse it under `Done · View details` when
the final answer begins.

The local `codex-app-sdk` dependency owns Codex executable discovery, generated
app-server protocol types, request/response inference, bidirectional request
routing, stdio JSONL framing, targeted conversation operations, conversation
snapshots/reducers, optimistic submissions, history reconciliation, queues,
turn mutations, and generic conversation rendering. `clawd` remains the
product adapter: it owns explicit executable selection, initialization
metadata, agent/session policy, approval presets, the Claw routing envelope,
and recovery behavior. Product policy must not be added to the SDK to make a
Codex Claw call compile; generic Codex conversation behavior must not be added
to Claw to avoid fixing the SDK.

Electron main responsibilities:

- spawn/connect to `clawd`;
- translate renderer IPC calls into app-owned backend RPC calls;
- provide client callbacks requested by `clawd`, such as open-external and
  native permission prompts/settings;
- fan backend events out to the renderer.

Renderer responsibilities:

- route SDK-owned Codex provider frames to the addressed per-agent SDK replica
  and render it through `CodexConversationPane`;
- render Claw-owned coordination and workspace state around that conversation;
- send user actions through preload IPC;
- never import generated Codex protocol types;
- never spawn Codex or access `CODEX_HOME`.

Preload is the only bridge between renderer and Electron main. It must not
talk directly to Codex app-server, provider protocol modules, or local
filesystem read APIs. Workspace file previews are backend resource requests,
not desktop filesystem requests.

## Transport

The first transport should be stdio:

```bash
codex app-server --stdio
```

or the equivalent explicit listen form:

```bash
codex app-server --listen stdio://
```

Stdio keeps the first product local and simple. Future transport options can
include a Unix socket daemon or `codex app-server proxy`.

## Lifecycle

Connection flow:

1. Use an explicit user-configured Codex executable when present. Otherwise,
   local desktop `clawd` uses the pinned executable bundled by Codex Claw;
   remote `clawd` lets the SDK discover Codex on that remote machine.
2. Start app-server with the chosen environment.
3. Send `initialize` with `clientInfo.name = "codex_claw"` and
   `capabilities.experimentalApi = true`.
4. Send `initialized`.
5. Start or resume a thread for the selected agent folder.
6. Start turns from user prompts.
7. Stream notifications and server requests into the session manager.
8. Cleanly interrupt, stop, or shut down when the app exits.

Electron allows up to 15 seconds for `clawd` shutdown. The SDK closes app-server
stdin first to allow provider-owned history flushing before bounded signal
escalation. Optional SDK questions do not hold the agent in `awaitingInput`;
that status is reserved for blocking requests and approvals.

Codex Claw always gives the SDK an isolated Codex home at
`~/.codex-claw/codex-home` (or `$CODEX_CLAW_HOME/codex-home`). Threads, config,
and auth remain isolated so Claw cannot pollute the normal Codex CLI/Desktop
home. By default, only the isolated home's `skills` and `plugins` entries are
links to `~/.codex/skills` and `~/.codex/plugins`. The Codex settings screen can
turn that sharing off when every chat is idle, either with fresh Claw
directories or by copying the current ChatGPT resources. A fresh home creates the links
before any Codex driver starts. An existing non-linked home is left untouched;
after launch, Claw asks whether to migrate it or keep it isolated. Migration is
blocked while chats are active because it restarts `clawd` and its app-server
processes. The isolated home may require its own sign in on first launch; do
not copy normal Codex thread or auth files into it.

Codex Claw reads and mutates that isolated authentication state through the
SDK account surface. When `account/read` reports that OpenAI authentication is
required and no account is loaded, the renderer gates the workspace behind a
signed-out landing screen. `account/login/start` opens the ChatGPT browser
flow, and the renderer refreshes account state until the SDK observes
`account/login/completed`. Once signed in, the lower-left account menu shows
the active account and exposes `account/logout`. Raw Codex account protocol
types and authentication files never cross into the renderer.

SSH connection settings expose a separate, host-targeted Codex account check
and **Connect ChatGPT** action. The latter invokes the SDK's
`startChatGptDeviceCodeLogin()` on that host and displays its verification URL
and user code. Claw polls the SDK account view while that UI is pending and
passes the exact login ID when cancelling; it never implements token exchange,
copies credentials, or owns token refresh. These remote account results do not
replace the local desktop's account state. Both local and SSH access use the
same isolated Claw Codex home on the target host.

The General settings Advanced section can store a Codex executable path. A
non-empty value is passed as the executable for
`codex app-server --listen stdio://` and always wins. Empty uses the pinned
Codex executable bundled with local desktop builds. If no bundle is supplied,
as with an SSH-installed remote `clawd`, SDK discovery searches the inherited
and login-shell `PATH`, common user and Homebrew bins, nvm installs, and Windows
executable extensions. Changing the path persists the setting and relaunches
Codex Claw so the backend and app-server start from a clean lifecycle.

## Bundled App Server

`codex-app-server-release.json` pins the Codex CLI version, platform, and
architecture used by desktop builds. `npm run dev` and every Electron
build/package/make path run `scripts/prepare-codex-app-server.mjs`. If the
repo-owned ignored resource is absent or reports a different version, the
script runs <https://releases.openai.com/codex/install.sh> in an isolated
temporary home with `CODEX_RELEASE`, `CODEX_NON_INTERACTIVE`, and
`CODEX_INSTALL_DIR`, then copies the resolved executable into
`electron/resources/codex/codex`. The official installer verifies its release
checksums, and Claw verifies the resulting version and Developer ID signature.
Electron signing explicitly preserves the executable's upstream OpenAI
signature and entitlements. The outer Codex Claw signature seals that nested
code, and release notarization validates the complete app bundle.

Electron passes the copied path to local `clawd` through
`CODEX_CLAW_BUNDLED_CODEX_PATH`. The SSH installer uploads only `clawd.mjs`,
not the desktop Codex executable or that environment variable, so remote agents
continue to require a Codex installation on the remote host.

## Thread And Agent Mapping

Personalization edits the owning host's global `~/.codex/AGENTS.md` or
`~/.claude/CLAUDE.md` directly; it is not another instruction string in app
state. Saving to all requires explicit confirmation before overwriting both
files. Codex's conversation-configuration extension reads the global Codex
file and appends it to Claw's developer instructions, because the isolated
Claw Codex home does not otherwise load that file. Claude loads its global
file through its existing user/project/local settings sources. Project-level
instructions remain provider-owned. Changes apply when sessions start/resume,
not by injecting a user message into an active turn. Remote hosts keep their
own instruction files; the editor does not overwrite files on other hosts.

Git draft preferences are app-owned settings: commit-message instructions and
PR-description instructions are sent only to their matching generation calls.
They are separate from global agent instructions and do not trigger Git writes.

Codex app-server owns conversation history and thread storage. Codex Claw owns
the product mapping:

- team id;
- agent id;
- folder;
- display name and avatar;
- current status;
- `backendSession` with `{ kind: "codex", threadId }`;
- local UI preferences.

One app-server process can host many threads. Agents are routed by `threadId`
and app-owned `agentId`.

If an agent has a persisted Codex `backendSession`, `clawd` resumes it with
`thread/resume` before starting the next turn. New agents without a Codex
session use `thread/start`, then set the conversation title to the Claw agent
name with `thread/name/set` before the first `turn/start`. The generic backend
seam repeats title synchronization after storing the new session, but the
Codex adapter treats an already-matching title as a no-op. Editing the Claw
agent name updates the active conversation title as well.

Claw maintains one non-archived Codex conversation per live agent. Restarting
an agent archives its current conversation before clearing the provider
reference. Closing an agent archives its conversation before removing
app-owned state. If archiving fails, the restart or close fails without
detaching the agent. On startup, `clawd` reconciles the isolated Claw
`CODEX_HOME`: top-level conversations not referenced by a live local agent are
archived through the SDK, while an attached conversation found in the archived
catalog is restored after an interrupted lifecycle transaction. Claw never
scans or moves rollout files itself.

Code review defaults to a separate visible reviewer agent in the same workspace,
but the user may choose the owning agent's current conversation. Either path
uses the round-scoped finding tools; finding clarification and sequential
remediation continue through the normal Codex conversation replica. `Review
again` archives the independent reviewer's conversation and binds a fresh one
to the same sidebar agent, while current-thread reviews keep the user-owned
conversation for the whole workflow. Finishing removes an independent reviewer
agent and its conversation but leaves a current-thread conversation intact.
Claw persists the selected Git scope, reviewer identity, opaque conversation
reference, and app-owned finding ledger without creating a second transcript
model.

`thread/settings/updated`
confirms the active thread settings and should update the app-owned
agent/session mapping so the id is saved in backend-owned state and reused
after relaunch.

Codex approval presets are app-owned shortcuts over Codex thread settings. The
renderer only sees the Codex preset id; `clawd` maps it to
`approvalPolicy`, `approvalsReviewer`, and sandbox settings for `thread/start`,
`thread/resume`, and live `thread/settings/update` calls. Do not reuse these
three Codex presets for Claude permission modes; Claude should expose its own
backend-specific option set.

Before applying a Codex approval preset, production `clawd` reads
`configRequirements/read` from app-server. Managed requirements can disallow
specific approval policies, reviewers, sandbox modes, or permission profiles.
When the configured/default Claw preset is not allowed, the Codex adapter clamps
to the best compatible preset (`approve-for-me`, then `ask-for-approval`, then
`full-access`). If none of Claw's presets satisfy the app-server requirements,
`clawd` omits approval/sandbox overrides and lets app-server use its effective
configuration instead of sending a known-invalid `danger-full-access` request.
The adapter returns the generated app-server `SandboxPolicy` shape directly;
the shared SDK does not define or normalize a second sandbox-policy model.

`thread/resume` and older-history paging are owned by the Codex SDK. Claw's
Codex adapter subscribes to the SDK's conversation-targeted replica bridge. It
publishes one bounded `CodexConversationSnapshot`, then forwards only
`CodexConversationEvent` deltas with a monotonic per-agent revision. The SDK
owns history reconciliation, cursors, turn identity, optimistic messages, tool
lifecycle, and mutation results; Claw does not translate those into a second
`RendererMessage` store.

Existing active sessions remain SDK-memory-authoritative and are not re-resumed
on selection. On relaunch, `agent/conversation/load` binds the persisted thread
reference to the targeted SDK surface and emits a fresh provider snapshot. The
renderer creates one SDK replica for that agent and applies only contiguous
provider revisions; a gap triggers rehydration.

Claw's cross-agent prompt admission queue remains app-owned coordination state:
it decides whether a prompt starts now or waits for the agent, persists that
pending work, and passes the active agent's queued prompts into the SDK pane for
generic queue presentation and interaction. This is distinct from any
provider-native queue represented by the SDK conversation snapshot; Claw must
not substitute the provider snapshot's queue for its own admitted prompts.

The Resume Session dialog opened from an agent's sidebar menu searches both
active and archived SDK conversation catalogs with the agent folder as an
exact `cwd` filter. `ConversationSummary.storageState` tells the UI which rows
are archived; the only active row shown is the agent's current conversation.
Selecting an archived row first calls the SDK unarchive operation, loads it,
then archives the displaced conversation before persisting the new
`{ kind: "codex", threadId }` reference. A failed load rearchives the target
and restores the current runtime. Resume is allowed only while the agent is
idle. Claude keeps its existing transcript behavior until its provider exposes
an archive primitive.

Fork Agent calls the SDK conversation handle's high-level `fork()` operation,
which owns `thread/fork` and returns a new conversation id plus its snapshot.
`clawd` creates a selected agent directly below the source with the new
`{ kind: "codex", threadId }` session and publishes the returned SDK snapshot;
raw fork protocol types remain outside product contracts. Forking requires an
idle Codex agent with an existing conversation.

The controlled conversation pane opts into SDK turn-level Fork actions for
user and assistant messages. It passes the stable turn id through the
app-owned `agent/fork` request; the Codex adapter calls the conversation
handle's `forkTurn()` operation, and the result enters the same new-agent
workflow without changing the source thread.

Compress Session is an app-owned session rollover, not Codex context
compaction. It is available only for an idle agent with an existing Codex
thread. The renderer keeps a blocking progress dialog visible across the
transition. `clawd` asks the current SDK-owned conversation for a bounded
handoff with a temporary fast model/effort override, waits for the exact
handoff turn to complete, creates a replacement SDK conversation in the same
folder with the agent's original Codex settings, sends the handoff inside a
real initial user prompt, and only then archives the old thread. The temporary
handoff turn's settings and transcript events are internal to the rollover and
must not update the agent's persisted defaults. The SDK strips the prompt's
`<context>` block from the visible message, leaving only the repeated
background-only instruction in the transcript. Submitting a turn also
guarantees that the replacement has a persisted rollout that can be resumed
after restart.
After the replacement exists, `clawd` updates the agent's persisted thread
reference and publishes the replacement SDK snapshot. Claw never copies or
reduces either transcript. If replacement creation or old-thread archival
fails, the persisted agent continues to reference the old thread.

The warning preference and rollover orchestration are Claw product metadata.
The old and new conversation contents, optimistic messages, turns, history,
and rendering remain SDK-owned throughout. This boundary is deliberate: do
not implement a parallel handoff transcript, synthetic user message, or
session reducer in Claw.

## Requests

Important requests for the first product:

- `thread/start`
- `thread/name/set`
- `thread/resume`
- `thread/fork`
- `thread/list`
- `turn/start`
- `turn/steer`
- `turn/interrupt`
- `model/list`
- `skills/list`

`clawd` should expose these through app-level backend driver/session services,
not directly through renderer IPC.

## Models And Reasoning Effort

Codex app-server v2 exposes the model picker catalog through `model/list`.
Codex Claw should use that request instead of hardcoding model or reasoning
level options. The response includes visible model entries, each model's
`supportedReasoningEfforts` in the order Codex intends clients to display, and
the model's `defaultReasoningEffort`. Models may also expose `serviceTiers` and
`defaultServiceTier`; the SDK presents the fast/priority tier as the Fast mode
toggle.

The renderer consumes an app-owned picker shape only. `clawd` fetches and adapts
the Codex catalog to `BackendModelOption[]`, the renderer stores the selected
catalog model and reasoning effort, and each prompt request sends the model plus
Codex-specific reasoning and service tier under `backendOptions`.

The selected service tier is part of the hydrated thread settings. `clawd`
emits it through `conversation.settingsUpdated`, including an explicit `null` when
Fast mode is disabled, so switching agents or reloading the app does not retain
a stale toggle.

`turn/start` accepts `model` and `effort` overrides for the current turn and
subsequent turns, so Codex Claw applies the current picker selection on every
prompt without requiring a new thread.

## Skills

Codex app-server v2 exposes available skills through `skills/list`.
Codex Claw treats skills as agent-folder scoped because each agent has its own
cwd:

```json
{
  "method": "skills/list",
  "params": {
    "cwds": ["/absolute/agent/folder"],
    "forceReload": false
  }
}
```

`clawd` adapts the response into `BackendSkillSummary[]` and exposes it through
backend RPC, which Electron forwards over typed IPC. The renderer uses this
app-owned shape for the composer skill menu; it does not import generated
app-server skill types.

When a prompt contains `$skill-name`, renderer state resolves the mention
against the active skill catalog and sends those skills under
`SendPromptOptions.backendOptions` with `kind: "codex"`. Slash skill fallback
from `/` command search resolves the same way. `clawd` then appends Codex
`UserInput` skill items to `turn/start`, alongside the normal text input:

```json
[
  { "type": "text", "text": "$skill-name do the thing", "text_elements": [] },
  { "type": "skill", "name": "skill-name", "path": "/.../SKILL.md" }
]
```

Composer shortcuts are split by surface: `@` searches files, `$` searches
skills, and `/` searches backend commands first, then matching skills. The
initial Codex command catalog includes `compact`, `review`, `plan`, and `goal` without
a visible slash prefix in the menu. Selecting one submits the corresponding
slash form through the normal composer path.

`compact` is an app command. Bare `/compact`, the agent-menu action, and
Command-K all open the Compress Session flow described above. The renderer
intercepts the bare slash form before normal prompt submission so the warning
and blocking transition are always applied. `/compact <text>` remains a normal
prompt.

Bare `/review` is a Claw app command. The renderer intercepts it and opens the
app-owned review setup without appending a visible user message or starting a
provider turn. The same command is present for Codex and Claude agents. The
Codex driver continues to own custom provider review prompts:

- `/review <instructions>` calls `review/start` with a custom review target.

`plan` is handled earlier in the renderer/app prompt path because Codex CLI
semantics change the composer mode, then optionally submit stripped text:

- bare `/plan` enables Plan mode, clears the composer, and does not call
  `sendPrompt`;
- `/plan <prompt>` enables Plan mode and submits `<prompt>` as a normal visible
  user prompt with `planMode: true`;
- `/plan` while Plan mode is already enabled keeps Plan mode enabled.

`goal` is also handled in the renderer/app prompt path because it mutates
thread metadata instead of starting a visible prompt turn:

- `/goal <objective>` sets or replaces the active thread goal;
- `/goal clear` clears the active thread goal;
- bare `/goal` and `/goal edit` are reserved for the goal shelf/editor surface.

`review/start` uses `delivery: "inline"`, so app-server should return the same
`reviewThreadId` as the active thread. `clawd` treats a different review thread id
as a protocol error instead of moving the agent session. The review lifecycle
streams `enteredReviewMode`/`exitedReviewMode` items; the final
`exitedReviewMode.review` string is rendered as assistant text because it is the
plain-text review body, not hidden tool output. Review-mode markers are not
tool parts and should not create a tool group in the renderer.

This is preferred over relying on Codex to infer the skill from text alone.
`skills/changed` is an invalidation notification; `clawd` emits app-owned
`skills.changed`, and the renderer invalidates the folder-keyed skill caches
before warming the known agents again.

## MCP Enablement

The Claw MCP server is documented in `docs/mcp.md`. It is an app-owned
collaboration server, not a Codex-specific subsystem.

For Codex, do not rely on a global `codex mcp add` entry for the product path.
Codex Claw starts the app-server process with process-wide feature overrides,
then passes the local Claw MCP server through each agent's thread config:

The process-wide overrides enable Codex memories and streamed patch events for
every Claw-managed Codex session.

```json
{
  "mcp_servers.codex_claw.url": "http://127.0.0.1:<port>/mcp?agentId=<agent-id>",
  "mcp_servers.codex_claw.default_tools_approval_mode": "approve"
}
```

The `agentId` query parameter is session-local caller identity for the MCP
server, not a tool argument the model has to provide for itself. The same
unique ID is injected into the agent's developer instructions and returned by
`list-agents` so duplicated agents can still coordinate precisely. The
approval override is scoped to `codex_claw`; it does not put the entire Codex
session into full-access/yolo mode.

Each `thread/start` still receives agent-specific developer instructions, such
as the Claw agent ID/name/folder and guidance to use the MCP server without
passing its own caller ID to each tool.

This keeps normal Codex config and normal Codex data untouched.

Unbiased product review rounds create a fresh SDK conversation; a first round
configured for the current thread loads that conversation instead. Both replace
the normal Claw MCP URL with a round-scoped URL. That URL adds only the three
finding actions documented in `docs/mcp.md`; normal repository tools remain
owned by the Codex harness. After the turn completes, Claw reads the normal
assistant response for finding discussion, archives the temporary conversation,
and forgets it. Findings themselves live in Claw's active review ledger.

## Notifications And Server Requests

Handled notifications:

- `thread/started`
- `thread/settings/updated`
- `thread/goal/updated`
- `thread/goal/cleared`
- `thread/tokenUsage/updated`
- `skills/changed`
- `thread/status/changed`
- `turn/started`
- `turn/plan/updated`
- `turn/completed`
- `item/started`
- `item/completed`
- `rawResponseItem/completed` as a compatibility/fallback path for raw
  Responses items that are not projected into `ThreadItem`s.
- `item/agentMessage/delta`
- `item/plan/delta`
- `item/commandExecution/outputDelta`
- `item/fileChange/patchUpdated`
- `item/mcpToolCall/progress`
- `thread/compacted` as a deprecated compatibility notification; prefer the
  `contextCompaction` item emitted through `item/started`.

High-priority missing notifications:

- `error`: should become an app-owned error event and visible system message.
- `item/reasoning/summaryTextDelta`: needed for reasoning summary rendering.
- `item/reasoning/summaryPartAdded`: needed for reasoning summary rendering.
- `item/reasoning/textDelta`: needed for reasoning text rendering.
- `item/commandExecution/terminalInteraction`: useful once native terminal or
  process interaction UI exists.
- `item/fileChange/outputDelta`: deprecated legacy apply-patch output stream,
  but worth accepting for compatibility.

Useful app/account/config notifications that should be logged or surfaced once
we add the matching UI:

- `account/updated`
- `mcpServer/startupStatus/updated`
- `mcpServer/oauthLogin/completed`
- `configWarning`
- `warning`
- `guardianWarning`
- `deprecationNotice`
- `model/rerouted`
- `model/verification`
- `turn/moderationMetadata`

Thread lifecycle notifications that can wait until thread/history management:

- `thread/name/updated`
- `thread/archived`
- `thread/unarchived`
- `thread/closed`

Low-priority protocol surfaces for the current Claw MVP:

- `app/list/updated`
- `remoteControl/status/changed`
- `externalAgentConfig/import/completed`
- `fs/changed`
- `fuzzyFileSearch/sessionUpdated`
- `fuzzyFileSearch/sessionCompleted`
- `thread/realtime/*`
- `windows/worldWritableWarning`
- `windowsSandbox/setupCompleted`
- `hook/started`
- `hook/completed`
- `command/exec/*`
- `process/*`

Current server-initiated request methods:

- `mcpServer/elicitation/request`: implemented for MCP tool approval
  confirmation.
- `item/tool/requestUserInput`: implemented for app-server user questions.
- `item/commandExecution/requestApproval`: not implemented.
- `item/fileChange/requestApproval`: not implemented.
- `item/permissions/requestApproval`: not implemented.
- `item/tool/call`: not implemented.
- `account/chatgptAuthTokens/refresh`: not implemented.
- `attestation/generate`: not implemented.
- `applyPatchApproval`: legacy-ish and not implemented.
- `execCommandApproval`: legacy-ish and not implemented.

Server requests are not renderer implementation details. `clawd` stores the
pending request, emits an app-owned prompt event, and resolves or rejects the
server request when the renderer answers. Until a request type is implemented,
`clawd` must log `not implemented` and respond with a JSON-RPC error so the
app-server does not wait forever.

`mcpServer/elicitation/request` with `_meta.codex_approval_kind =
"mcp_tool_call"` maps to the same renderer-facing confirmation shape as id8:
`kind: "confirm_tool"` with a stable request id, summary, integration/server
name, tool name, arguments preview, and supported persistence choices. The
renderer returns `allow`, `allow_conversation`, `always_allow`, or `deny`;
`clawd` translates that back to Codex's `accept`/`decline` elicitation response
and optional `_meta.persist`.

`item/tool/requestUserInput` maps to an app-owned `ask_user` client request.
The request carries Codex's `questions[]` shape with stable question ids,
headers, option lists, `multiSelect`, and secret/free-form flags. The renderer
shows a paginated id8-style form for multi-question requests and answers with
`{ answers: { [questionId]: { answers: string[] } } }`. User cancellation is
handled explicitly by returning an empty `answers` map so the app-server does
not wait forever. This is separate from tool approvals because the request is
asking Nicolas for information, not for permission.

Context compaction is primarily represented by the `contextCompaction`
`ThreadItem`. The Codex SDK converts its lifecycle into provider-owned
conversation events so its reducer can split the active assistant message and
insert one visible compaction marker exactly where the item arrived in the
stream. The deprecated `thread/compacted` notification remains an SDK-owned
completion fallback. Claw only transports those provider events and must not
synthesize another compaction lifecycle.

Unhandled notifications should also log `not implemented`, but they do not need
a response because notifications cannot block the app-server.

## Plan And Goal Modes

Composer Plan mode is sent through Codex's experimental
`turn/start.collaborationMode` override. `clawd` builds the `collaborationMode`
object from app-owned prompt options and the selected model/reasoning effort;
renderer code only sees a boolean Plan toggle.
Plan mode must be sent even when no model is selected in the renderer. In that
case `clawd` omits `settings.model` and uses Codex's Plan preset default reasoning
effort of `medium`, with `developer_instructions: null` so the app-server keeps
its built-in Plan instructions.
Because Codex persists the thread collaboration mode, disabling Plan mode is
also an app-server operation: native Codex prompts send `planMode: false`, and
`clawd` maps that to `turn/start.collaborationMode.mode = "default"` with the
selected model/reasoning settings. Omitting `collaborationMode` would leave the
thread in its previous mode.

Codex goals are thread metadata, not composer modes. The renderer handles
`/goal` commands before prompt submission:

- `/goal <objective>` calls `thread/goal/set` through `clawd`, strips the slash
  command, and does not start a turn or add a visible user prompt.
- `/goal clear` calls `thread/goal/clear`, even when the agent is busy.
- Bare `/goal` and `/goal edit` do not submit a turn yet; goal editing is
  exposed from the goal surface above the composer and currently loads
  `/goal <objective>` into the composer as the editing draft.
- `/goal pause` and `/goal resume` are intentionally unsupported for now.

The active goal is displayed by the SDK conversation shelf, below queued
prompts and closest to the composer. That keeps editor/clear controls out of
the composer mode chip row and avoids mixing durable thread state with
per-turn prompt options.

Mode notifications stay app-owned:

- `thread/settings/updated` is still emitted for persistence/thread mapping.
- If the thread settings include `collaborationMode.mode`, `clawd` also emits
  `conversation.modeUpdated` with `default` or `plan`.
- `thread/goal/updated` and `thread/goal/cleared` become app-owned goal events
  so the agent metadata and shelf stay in sync.
- `turn/plan/updated` is the structured plan artifact event. `clawd` stores it as
  an execution-kind `agent.plan` and derives completion only when every step is
  complete. `turn/completed` finalizes any remaining execution plan as
  incomplete, interrupted, or failed before it is persisted to `state.json`.
- Codex plan-mode output is a separate `ThreadItem` with `type: "plan"`, not a
  normal assistant message. `clawd` stores `item/plan/delta` as a draft
  proposed-kind `agent.plan` artifact only; the app-server marks those deltas
  experimental. Its item status is not execution task-list status.
- `item/completed` with `item.type === "plan"` is authoritative. `clawd` overwrites
  any draft plan with the completed item text, persists it to `state.json`, and
  opens it in the markdown side panel when the corresponding turn completes.
- Raw response assistant messages are diagnostic only for this path. Do not use
  them as the primary plan renderer; Codex core already parses
  `<proposed_plan>...</proposed_plan>` into typed plan item notifications.
- The transcript must not render the markdown between `<proposed_plan>` and
  `</proposed_plan>` as normal assistant text. While a plan streams, the
  snapshot reducer inserts a normal ungrouped tool-style progress row with
  `Writing plan` or `Updating plan` and live line stats; the side panel remains
  the place where the full plan markdown is rendered.

Plan previews use the markdown side panel with plan-specific review actions:

- Confirm exits Plan mode and sends `implement the plan` as a normal prompt.
- Cancel exits Plan mode and closes the preview without sending another prompt.
- Comment keeps Plan mode active. The user selects text in the plan, adds one or
  more inline comments, then sends those comments as a plan-refinement prompt.
  Saved comments can be edited or deleted before submission and are reset after
  the refinement prompt is sent.

### Token Usage And Rate Limits

`thread/tokenUsage/updated` payload:

```ts
{
  threadId: string;
  turnId: string;
  tokenUsage: {
    total: {
      totalTokens: number;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      reasoningOutputTokens: number;
    };
    last: {
      totalTokens: number;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      reasoningOutputTokens: number;
    };
    modelContextWindow: number | null;
  };
}
```

`clawd` converts this into `conversation.contextUsageUpdated` with an app-owned
`contextUsage` payload. `total` is cumulative thread/session usage and can
exceed the model window after a long conversation. Context occupancy uses
`last.totalTokens`, which is the latest active context size, divided by
`modelContextWindow`. Tooltip displays should also cap the visible numerator
to the model window so the UI never shows an impossible `tokens > window`
context fraction.

`account/rateLimits/updated` payload:

```ts
{
  rateLimits: {
    limitId: string | null;
    limitName: string | null;
    primary: {
      usedPercent: number;
      windowDurationMins: number | null;
      resetsAt: number | null;
    } | null;
    secondary: RateLimitWindow | null;
    credits: unknown;
    individualLimit: unknown;
    planType: string | null;
    rateLimitReachedType: string | null;
  };
}
```

The rate-limit notification is a sparse account-level update, not tied to an
agent. `clawd` emits `account.rateLimitsUpdated` and the reducer stores it as
global app state. `clawd` also persists the latest snapshot to `state.json` when
this event arrives because the app-server only sends it opportunistically
during streaming.

## Generated Protocol Types

The app-server can generate TypeScript bindings:

```bash
codex app-server generate-ts --out <dir>
```

Generated types should live in a backend provider protocol package, for example:

```text
backend/src/codex/generated
```

Renderer code depends on app IPC/event types instead. This keeps app-server
protocol churn contained in the Codex adapter.

## Event Adaptation

The durable flow is:

```text
Codex app-server -> Codex SDK surface -> targeted SDK snapshot/event
                 -> Claw revisioned transport frame -> SDK renderer replica -> UI
```

Renderer components consume the SDK-owned conversation snapshot. Claw consumes
only explicit read-only projections needed by product chrome, such as plan
preview, diff, unread state, and sidebar activity.

Do not encode Codex tool calls as id8-style `<tool>` text tags. Those tags are
an id8/multi-LLM parsing artifact. Codex app-server already emits structured
`ThreadItem` payloads and item-specific progress notifications, so the Codex
SDK preserves that structure in its surface snapshot and exposes typed tool
parts to its renderer. The chat renderer preserves placement with ordered
message parts (`text`, `tool`, `text`) so tool calls appear where they happened
in the stream.

SDK mapping sketch:

- `UserMessage` becomes a user message.
- `AgentMessageDelta` appends assistant text to an in-flight assistant message.
- completed `AgentMessage` finalizes the assistant message.
- `CommandExecution` from `item/started` and `item/completed` becomes a
  command tool part with stable item id, command, cwd, status, output, exit
  code, and duration.
- `CommandExecutionOutputDelta` appends output to the matching tool call.
- `FileChange` and `FileChangePatchUpdated` become file-change tool/diff
  state.
- `TurnDiffUpdated` updates turn-level diff state and requests the read-only
  git diff side panel with the unified diff text.
- `PlanDelta` updates a draft plan artifact, and completed `Plan` items update
  the authoritative plan artifact. They are not replayed as normal assistant
  chat text.
- MCP and dynamic tool calls become renderer tool calls.
- `rawResponseItem/completed` is adapted in `clawd` into the same app-owned tool
  events when the app-server exposes raw function, shell, custom-tool, search,
  or output items.
- approval and ask-user requests become pending UI prompts. MCP tool approval
  elicitations update the matching running MCP tool part when possible so the
  confirmation appears where the tool call happened in the stream.
- `TurnCompleted` finalizes streaming state and updates usage/status.

Keep original Codex payloads available in debug fields during development, but
do not make normal renderer components depend on them.

## SDK Decision

The TypeScript SDK is useful for spikes, but it is not the target boundary. It
wraps `codex exec --experimental-json`, spawns the CLI, and streams JSONL over
stdin/stdout.

Codex Claw should use app-server directly because the product needs:

- thread list/read/resume;
- active turn steering;
- approval routing;
- turn diff updates;
- server-initiated requests;
- future realtime/control surfaces.

If the SDK is temporarily used, it must sit behind the same backend driver
interface as the app-server implementation so renderer and IPC contracts do not
change when the SDK is removed.

## Testing

Normal Claw integration tests use a typed fake Codex SDK surface and real Claw
driver/adapter/server code. The SDK repository owns app-server transport and
conversation-reducer tests; Claw must not recreate them here.

Cover:

- initialization and shutdown;
- SDK events before, during, and after turns;
- SDK failures, nullable catalog fields and stale session identities;
- normalized approval/question routing and SDK-targeted responses;
- interrupt and steer;
- event adaptation into app-owned state, including durable review readiness;
- renderer reload snapshots for in-flight streams.

A real app-server smoke test is useful once the first agent works, but it must
be gated behind an environment variable and stay outside the normal unit-test
gate.
