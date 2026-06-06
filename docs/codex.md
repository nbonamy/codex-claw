# Codex Integration

Codex Claw talks to Codex through the Codex app-server. All communication with
Codex happens in Electron main. The renderer receives app-owned events over
typed IPC and never talks to the app-server directly.

## Boundary

Main process responsibilities:

- resolve the Codex executable;
- start or connect to `codex app-server`;
- initialize the app-server session;
- own JSON-RPC request IDs and response matching;
- route server notifications to the right agent/session;
- answer server-initiated approval and user-input requests;
- adapt Codex events into app-owned events;
- persist only app product state, not Codex transcripts.

Renderer responsibilities:

- render app-owned message, tool, diff, plan, and approval state;
- send user actions through preload IPC;
- never import generated Codex protocol types;
- never spawn Codex or access `CODEX_HOME`.

Preload is the only bridge between renderer and main.

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
include a Unix socket daemon, `codex app-server proxy`, or a bundled Codex
binary.

## Lifecycle

Connection flow:

1. Resolve the Codex executable.
2. Start app-server with the chosen environment.
3. Send `initialize` with `clientInfo.name = "codex_claw"` and
   `capabilities.experimentalApi = true`.
4. Send `initialized`.
5. Start or resume a thread for the selected agent folder.
6. Start turns from user prompts.
7. Stream notifications and server requests into the session manager.
8. Cleanly interrupt, stop, or shut down when the app exits.

For the first chat milestone, Codex Claw inherits the user's normal Codex
environment by default so existing authentication works. Set
`CODEX_CLAW_CODEX_HOME` to point the spawned app-server at an isolated Codex
home when testing or when we later build a dedicated auth/onboarding flow.

## Thread And Agent Mapping

Codex app-server owns conversation history and thread storage. Codex Claw owns
the product mapping:

- team id;
- agent id;
- folder;
- display name and avatar;
- current status;
- Codex thread id;
- local UI preferences.

One app-server process can host many threads. Agents are routed by `threadId`
and app-owned `agentId`.

If an agent has a persisted Codex thread id, main resumes it with
`thread/resume` before starting the next turn. New agents without a thread id
use `thread/start`. `thread/settings/updated` confirms the active thread
settings and should update the app-owned agent/thread mapping so the id is
saved in Electron `userData` and reused after relaunch.

`thread/resume` returns the thread's `turns` in app-server protocol v2. Main
must translate those turns into app-owned `RendererMessage`s and emit a
history hydration event before the next turn streams. The renderer asks main
to re-select the active persisted agent after subscribing to main events, so
relaunch restores visible history without the renderer importing Codex protocol
types. The same adapter should be reused later for `thread/read` if we add a
read-only history loading path that does not resume the runtime session.

## Requests

Important requests for the first product:

- `thread/start`
- `thread/resume`
- `thread/list`
- `turn/start`
- `turn/steer`
- `turn/interrupt`
- `model/list`
- `skills/list`

The main process should expose these through app-level services such as
`AgentSessionManager`, not directly through renderer IPC.

## Models And Reasoning Effort

Codex app-server v2 exposes the model picker catalog through `model/list`.
Codex Claw should use that request instead of hardcoding model or reasoning
level options. The response includes visible model entries, each model's
`supportedReasoningEfforts` in the order Codex intends clients to display, and
the model's `defaultReasoningEffort`.

The renderer consumes an app-owned picker shape only. Main fetches and adapts
the Codex catalog, the renderer stores the selected catalog model and reasoning
effort, and prompt IPC sends `{ model, reasoningEffort }` back to main.

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

Main adapts the response into `CodexSkillSummary[]` and exposes that through
typed IPC. The renderer uses this app-owned shape for the composer slash menu;
it does not import generated app-server skill types.

When a prompt contains `/skill-name`, renderer state resolves the mention
against the active skill catalog and sends `SendPromptOptions.skills` to main.
Main then appends Codex `UserInput` skill items to `turn/start`, alongside the
normal text input:

```json
[
  { "type": "text", "text": "/skill-name do the thing", "text_elements": [] },
  { "type": "skill", "name": "skill-name", "path": "/.../SKILL.md" }
]
```

This is preferred over relying on Codex to infer the skill from text alone.
`skills/changed` is an invalidation notification; main emits app-owned
`skills.changed`, and the renderer refreshes the active agent's catalog.

## MCP Enablement

The Claw MCP server is documented in `docs/mcp.md`. It is an app-owned
collaboration server, not a Codex-specific subsystem.

For Codex, do not rely on a global `codex mcp add` entry for the product path.
Codex Claw starts the app-server process with command-line config overrides for
the local Claw MCP server:

```bash
codex \
  -c 'mcp_servers.codex_claw.url="http://127.0.0.1:<port>/mcp"' \
  app-server --listen stdio://
```

During MCP elicitation development, Claw intentionally does not pass
`mcp_servers.codex_claw.default_tools_approval_mode = "approve"` so the
renderer approval flow is exercised. We expect to bring that scoped override
back for normal Claw MCP collaboration once the flow is proven. The override is
scoped to `codex_claw`; it does not put the entire Codex session into
full-access/yolo mode.

Each `thread/start` still receives agent-specific developer instructions, such
as the Claw agent ID and guidance to register with the MCP server.

This keeps normal Codex config and normal Codex data untouched, including when
`CODEX_CLAW_CODEX_HOME` is used for an isolated Codex home.

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
- `turn/diff/updated`: needed for git/diff status and the future environment
  panel.
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

Server requests are not renderer implementation details. Main stores the
pending request, emits an app-owned prompt event, and resolves or rejects the
server request when the renderer answers. Until a request type is implemented,
main must log `not implemented` and respond with a JSON-RPC error so the
app-server does not wait forever.

`mcpServer/elicitation/request` with `_meta.codex_approval_kind =
"mcp_tool_call"` maps to the same renderer-facing confirmation shape as id8:
`kind: "confirm_tool"` with a stable request id, summary, integration/server
name, tool name, arguments preview, and supported persistence choices. The
renderer returns `allow`, `allow_conversation`, `always_allow`, or `deny`;
main translates that back to Codex's `accept`/`decline` elicitation response
and optional `_meta.persist`.

`item/tool/requestUserInput` maps to an app-owned `ask_user` client request.
The request carries Codex's `questions[]` shape with stable question ids,
headers, option lists, and secret/free-form flags. The renderer answers with
`{ answers: { [questionId]: { answers: string[] } } }`, and main resolves the
original JSON-RPC request with that exact response shape. This is separate from
tool approvals because the request is asking Nicolas for information, not for
permission.

Context compaction is primarily represented by the `contextCompaction`
`ThreadItem`. Main converts the item into a `context.compactionStarted`
app-owned event so the reducer can split the active assistant message and insert
the visible compaction marker exactly where the item arrived in the stream. The
deprecated `thread/compacted` notification maps to the same app-owned event for
compatibility.

Unhandled notifications should also log `not implemented`, but they do not need
a response because notifications cannot block the app-server.

## Plan And Goal Modes

Composer Plan mode is sent through Codex's experimental
`turn/start.collaborationMode` override. Main builds the `collaborationMode`
object from app-owned prompt options and the selected model/reasoning effort;
renderer code only sees a boolean Plan toggle.

Composer Goal mode creates or updates the Codex thread goal before starting the
turn by calling `thread/goal/set` with the submitted prompt as the objective and
`active` status.

Mode notifications stay app-owned:

- `thread/settings/updated` is still emitted for persistence/thread mapping.
- If the thread settings include `collaborationMode.mode`, main also emits
  `thread.modeUpdated` with `default` or `plan`.
- `thread/goal/updated` and `thread/goal/cleared` become app-owned goal events
  so the composer indicator can stay in sync.
- `turn/plan/updated` becomes transcript text for now; this is the rendering
  hook for a richer native plan component later.
- `item/plan/delta` is accepted as an assistant delta so streaming plan text can
  appear at the point Codex emits it.

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

Main converts this into `thread.tokenUsageUpdated` with an app-owned
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
agent. Main emits `account.rateLimitsUpdated` and the reducer stores it as
global app state. Main also persists the latest snapshot to `state.json` when
this event arrives because the app-server only sends it opportunistically
during streaming.

## Generated Protocol Types

The app-server can generate TypeScript bindings:

```bash
codex app-server generate-ts --out <dir>
```

Generated types should live in a main-process protocol package, for example:

```text
src/main/codex-protocol/generated
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
should preserve that structure in main-process adapters and expose app-owned
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
- `TurnDiffUpdated` updates the turn-level diff panel.
- MCP and dynamic tool calls become renderer tool calls.
- `rawResponseItem/completed` is adapted in main into the same app-owned tool
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
