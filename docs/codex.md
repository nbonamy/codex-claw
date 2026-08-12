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
- adapt Codex events into app-owned events;
- persist only app product state, not Codex transcripts.

The local `codex-app-sdk` dependency owns Codex executable discovery, generated
app-server protocol types, request/response inference, bidirectional request
routing, and stdio JSONL framing. `clawd` remains the product adapter: it owns
explicit executable selection, initialization metadata, agent/session policy,
approval presets, event adaptation, and recovery behavior. Product policy must
not be added to the SDK to make a Codex Claw call compile.

Electron main responsibilities:

- spawn/connect to `clawd`;
- translate renderer IPC calls into app-owned backend RPC calls;
- provide client callbacks requested by `clawd`, such as open-external and
  native permission prompts/settings;
- fan backend events out to the renderer.

Renderer responsibilities:

- render app-owned message, tool, diff, plan, and approval state;
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
session use `thread/start`. After the app stores a newly created backend
session, it sets the generic conversation title through the backend seam;
Codex implements this with `thread/name/set`. `thread/settings/updated`
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

`thread/resume` returns a full-item page of the 50 newest turns in app-server
protocol v2. `clawd` translates that page into app-owned `RendererMessage`s and
emits it immediately. Codex Claw currently selects lazy loading, so the SDK
retains the opaque cursor and prefetches one older page of 25 turns when the
user scrolls within one viewport of the top. Each page is emitted as an
incremental `thread.historyLoaded` batch. Eager loading can instead hydrate
every page progressively. Since
app-server history may omit tool calls already observed live, Claw only adds
unknown turns from lifecycle hydration and never rewrites a turn already present
in memory. Lifecycle hydration is reconciled chronologically because its refreshed
window can contain unknown turns on either side of the live transcript. An explicit
older-history page owns message placement: Claw preserves the page order, moves any
overlapping known messages into that position, and retains their richer in-memory
content.
Existing active sessions remain memory-authoritative and are not re-resumed on
selection. The renderer asks through the typed bridge to re-select the active
persisted agent after subscribing to events, so relaunch restores visible
history without the renderer importing Codex protocol types.

The sidebar conversation history uses `thread/list` with the active agent
folder as an exact `cwd` filter, `archived: false`, and newest-first
`updated_at` sorting. `clawd` sends app-owned `ConversationSummary` objects
through backend RPC, which Electron forwards over typed IPC. Clicking a Codex
conversation calls `thread/resume`, stores the
returned `{ kind: "codex", threadId }` session on the agent, replaces that
agent's visible messages with the resumed turns, and routes the next prompt to
the selected thread. Resume is allowed only while the agent is idle.

Fork Agent calls the SDK conversation handle's high-level `fork()` operation,
which owns `thread/fork` and returns a new conversation id plus its snapshot.
`clawd` translates that history into app-owned messages, creates a selected
agent directly below the source with the new `{ kind: "codex", threadId }`
session, and leaves raw fork protocol types outside product contracts. Forking
requires an idle Codex agent with an existing conversation.

The controlled conversation pane opts into SDK message-level Fork actions for
user and assistant messages. It passes the absolute host message index through
the app-owned `agent/fork` request; the Codex adapter calls the conversation
handle's `forkMessage()` operation, and the result enters the same new-agent
workflow without changing the source thread.

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
emits it through `thread.settingsUpdated`, including an explicit `null` when
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

`compact` and `review` are backend prompt commands. The Codex driver intercepts
recognized slash commands before appending a visible user message or calling
`turn/start`:

- bare `/compact` calls `thread/compact/start` with the active `threadId`;
- bare `/review` calls `review/start` with `target.type = "uncommittedChanges"`;
- `/review <instructions>` calls `review/start` with a custom review target;
- `/compact <text>` remains a normal prompt because Codex's compact RPC does
  not accept inline instructions.

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

```json
{
  "mcp_servers.codex_claw.url": "http://127.0.0.1:<port>/mcp?agentId=<agent-id>",
  "mcp_servers.codex_claw.default_tools_approval_mode": "approve"
}
```

The `agentId` query parameter is session-local caller identity for the MCP
server, not a tool argument the model has to provide for itself. The same
unique ID is injected into the agent's developer instructions and returned by
`list-agents` so duplicated Bench agents can still coordinate precisely. The
approval override is scoped to `codex_claw`; it does not put the entire Codex
session into full-access/yolo mode.

Each `thread/start` still receives agent-specific developer instructions, such
as the Claw agent ID/name/folder and guidance to use the MCP server without
passing its own caller ID to each tool.

This keeps normal Codex config and normal Codex data untouched.

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
`ThreadItem`. `clawd` converts the item into a `context.compactionStarted`
app-owned event so the reducer can split the active assistant message and insert
the visible compaction marker exactly where the item arrived in the stream. The
deprecated `thread/compacted` notification maps to the same app-owned event for
compatibility.

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
  `thread.modeUpdated` with `default` or `plan`.
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

`clawd` converts this into `thread.tokenUsageUpdated` with an app-owned
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
Codex app-server event -> Codex adapter -> app event -> renderer store -> UI
```

Renderer components consume app-owned state such as `RendererMessage`,
`RendererToolCall`, plan state, approval state, and diff state.

Do not encode Codex tool calls as id8-style `<tool>` text tags. Those tags are
an id8/multi-LLM parsing artifact. Codex app-server already emits structured
`ThreadItem` payloads and item-specific progress notifications, so Codex Claw
should preserve that structure in backend adapters and expose app-owned
tool parts to the renderer. The chat renderer preserves placement with ordered
message parts (`text`, `tool`, `text`) so tool calls appear where they happened
in the stream while the legacy id8 `<tool>` parser remains available for copied
id8-shaped messages.

Mapping sketch:

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

Normal tests use fake app-server transports and captured protocol fixtures.

Cover:

- initialization and shutdown;
- JSON-RPC request/response matching;
- notifications before, during, and after turns;
- malformed messages;
- server-initiated requests;
- interrupt and steer;
- event adaptation into app-owned state;
- renderer reload snapshots for in-flight streams.

A real app-server smoke test is useful once the first agent works, but it must
be gated behind an environment variable and stay outside the normal unit-test
gate.
