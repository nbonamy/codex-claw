# Claude Code Integration Research

Status: research notes, 2026-06-06.

This document summarizes findings from
`/Users/nbonamy/src/claude-code-source-code-full-main` and maps them against
Codex Claw's current Codex app-server integration. The goal is to understand
Claude Code's websocket JSON solution, identify a viable Claude backend path,
and name the places where Codex assumptions have leaked into our app-owned
contracts.

## Scope And Caveats

The inspected Claude source tree is not a git checkout and appears internally
inconsistent in a few direct-connect areas:

- `src/main.tsx` references `src/server/server.ts`,
  `src/server/sessionManager.ts`, `src/server/backends/dangerousBackend.ts`,
  `src/server/parseConnectUrl.ts`, and `src/server/connectHeadless.ts`.
- Those files are not present in the inspected folder.
- The present `src/server/web/*` files implement a browser terminal over PTY.
  That is a terminal-streaming server, not the structured JSON agent protocol
  Codex Claw wants.

So this document treats the client-side direct-connect protocol as real, but
marks the missing server implementation as unresolved. We should verify against
the installed Claude Code binary or a fuller source snapshot before building on
the `claude server` path.

## Existing Claw Integration Shape

Codex Claw currently talks to Codex through `codex app-server --listen
stdio://`. Electron main owns the process, JSON-RPC request ids, server
requests, and event adaptation. Renderer code consumes app-owned
`MainToRendererEvent` and `RendererMessage` shapes.

The architecture docs already have the right future seam:

```ts
type AgentBackendDriver = {
  startSession(agent: Agent): Promise<BackendSession>
  resumeSession(agent: Agent, threadId: string): Promise<BackendSession>
  sendPrompt(sessionId: string, input: PromptInput): Promise<void>
  steerTurn(sessionId: string, input: PromptInput): Promise<void>
  interruptTurn(sessionId: string): Promise<void>
  answerRequest(requestId: string, payload: unknown): Promise<void>
  onEvent(listener: (event: BackendEvent) => void): () => void
}
```

The implementation is not yet at that seam. `AppController` constructs a
`CodexAgentSessionManager` directly, `sendAgentPrompt` accepts that concrete
type, and shared contracts still expose Codex names.

## Claude Websocket Surfaces

Claude Code has three websocket-adjacent surfaces in the inspected source.
Only the first two are relevant for a native structured Claw integration.

### CCR Remote Sessions

Files:

- `src/remote/SessionsWebSocket.ts`
- `src/remote/RemoteSessionManager.ts`
- `src/hooks/useRemoteSession.ts`
- `src/remote/sdkMessageAdapter.ts`

This path connects a local Claude Code UI to Anthropic-hosted CCR sessions.
The websocket URL is built from the OAuth API base:

```text
wss://.../v1/sessions/ws/{sessionId}/subscribe?organization_uuid={orgUuid}
```

Authentication is through websocket upgrade headers:

```json
{
  "Authorization": "Bearer <access token>",
  "anthropic-version": "2023-06-01"
}
```

The websocket receives SDK-format messages and control messages. User prompts
are not sent over the websocket; `RemoteSessionManager.sendMessage()` uses an
HTTP helper (`sendEventToRemoteSession`) to POST user events to the remote
session. Permission responses and interrupts do go over the websocket as
control messages.

Reliability behavior:

- accepts any JSON object with a string `type` so new server message types are
  logged downstream instead of dropped at the transport boundary;
- pings every 30 seconds when connected;
- reconnects up to 5 times after normal drops;
- treats close code `4003` as permanent unauthorized;
- treats `4001` as "session not found", but retries three times because
  compaction can briefly make a session look stale.

This is valuable as protocol evidence, but it is not the right first Claw
backend because it depends on Anthropic-hosted sessions, OAuth org context,
CCR APIs, and HTTP event submission.

### Direct Connect

Files:

- `src/server/createDirectConnectSession.ts`
- `src/server/directConnectManager.ts`
- `src/hooks/useDirectConnect.ts`
- `src/main.tsx` references feature-gated `claude server` and `claude open`
  flows, but the server implementation files are missing in this tree.

This path is closer to what Codex Claw could own locally.

Session creation is HTTP:

```http
POST /sessions
content-type: application/json
authorization: Bearer <token>

{
  "cwd": "/absolute/project",
  "dangerously_skip_permissions": true
}
```

The response shape is:

```json
{
  "session_id": "session id",
  "ws_url": "ws://.../session websocket",
  "work_dir": "/optional/actual/workdir"
}
```

The direct-connect websocket then carries newline-delimited JSON messages inside
websocket text frames. The client splits every incoming frame on `\n`, parses
each line, and ignores malformed lines.

Outbound user prompt shape:

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "prompt text or content blocks"
  },
  "parent_tool_use_id": null,
  "session_id": ""
}
```

Permission response shape:

```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "request id",
    "response": {
      "behavior": "allow",
      "updatedInput": {}
    }
  }
}
```

Deny uses:

```json
{
  "behavior": "deny",
  "message": "user denied permission"
}
```

Interrupt shape:

```json
{
  "type": "control_request",
  "request_id": "uuid",
  "request": {
    "subtype": "interrupt"
  }
}
```

Incoming direct-connect handling is simpler than CCR:

- `control_request` with `request.subtype = "can_use_tool"` becomes a
  permission prompt.
- unsupported control request subtypes are answered with a `control_response`
  error so the server does not hang.
- `control_response`, `keep_alive`, `control_cancel_request`,
  `streamlined_text`, `streamlined_tool_use_summary`, and
  `system/post_turn_summary` are filtered out of the interactive UI path.
- every other SDK message is forwarded to the SDK message adapter.

### WebSocketTransport / Session Ingress

Files:

- `src/cli/transports/WebSocketTransport.ts`
- `src/cli/remoteIO.ts`
- `src/cli/transports/transportUtils.ts`

This is the lower-level bidirectional stream transport used by remote/bridge
execution. It writes `StdoutMessage` objects as NDJSON lines over websocket and
reads incoming data into `StructuredIO`.

It has useful transport patterns we should copy if we own a websocket transport:

- last 1000 UUID-bearing messages are buffered for reconnect replay;
- reconnect sends `X-Last-Request-Id` when available;
- server-confirmed messages are evicted from the replay buffer;
- reconnect uses exponential backoff with jitter and a 10-minute budget;
- sleep/wake detection forces reconnect when timers resume after a long gap;
- ping/pong detects dead sockets;
- `keep_alive` data frames are sent so proxies that ignore websocket ping
  control frames still see traffic;
- close codes `1002`, `4001`, and `4003` are permanent unless `4003` can be
  recovered by refreshed auth headers.

This is more robust than the direct-connect client. If Claw uses a websocket
backend, it should use this design rather than the minimal
`DirectConnectSessionManager` behavior.

### PTY Web Server

Files:

- `src/server/web/pty-server.ts`
- `src/server/web/session-manager.ts`
- `src/server/web/terminal.ts`

This server spawns `claude` in a PTY and bridges raw terminal bytes to a browser
terminal. Its websocket protocol mixes raw strings with small JSON control
messages such as `resize`, `ping`, `pong`, `session`, `resumed`, `error`, and
`exit`.

This is not a good fit for Codex Claw. It recreates a terminal UI instead of
exposing structured assistant/tool events.

## Claude SDK Message Protocol

Claude's structured protocol is SDK-shaped, not JSON-RPC-shaped.

### Message Families

The SDK message union is defined in `src/entrypoints/sdk/coreSchemas.ts`.
Important message types:

- `assistant`: complete Anthropic assistant message, including content blocks
  such as text, thinking, and tool use.
- `user`: user message or tool result message.
- `stream_event`: raw Anthropic stream event for partial updates.
- `result`: turn/session completion with duration, cost, usage, model usage,
  permission denials, and result text for success.
- `system/init`: session metadata such as model, cwd, tools, MCP server status,
  permission mode, slash commands, skills, plugins, and account source.
- `system/status`: currently used for `compacting` or `null`.
- `system/compact_boundary`: visible compaction boundary with compact metadata.
- `system/api_retry`, `local_command_output`, `hook_started`,
  `hook_progress`, `hook_response`, `files_persisted`, `task_started`,
  `task_progress`, `task_notification`, `session_state_changed`,
  `elicitation_complete`.
- `tool_progress`: elapsed-time progress for long-running tools.
- `auth_status`: authentication progress/error output.
- `rate_limit_event`: rate-limit information.
- `tool_use_summary` and `prompt_suggestion`: SDK-only helper events.

The existing Claude `sdkMessageAdapter` converts only a subset for its REPL:

- `assistant` -> complete assistant message
- `stream_event` -> stream event
- non-success `result` -> system warning
- `system/init` -> informational message
- `system/status` -> informational compaction/status
- `system/compact_boundary` -> compact boundary
- `tool_progress` -> informational progress
- many other types are ignored

Claw should build its own adapter rather than reuse this REPL adapter directly,
because we need native tool placement, app-owned statuses, and artifact panes.

### Control Messages

Control schemas live in `src/entrypoints/sdk/controlSchemas.ts`.

Control request envelope:

```json
{
  "type": "control_request",
  "request_id": "uuid",
  "request": {
    "subtype": "can_use_tool"
  }
}
```

Control response envelope:

```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "uuid",
    "response": {}
  }
}
```

Error response:

```json
{
  "type": "control_response",
  "response": {
    "subtype": "error",
    "request_id": "uuid",
    "error": "message"
  }
}
```

Cancellation:

```json
{
  "type": "control_cancel_request",
  "request_id": "uuid"
}
```

Keepalive:

```json
{
  "type": "keep_alive"
}
```

Important control request subtypes:

- `initialize`: initializes an SDK session with hooks, MCP servers, schema,
  system prompt, agents, prompt suggestions, and progress summaries.
- `interrupt`: interrupts the current turn.
- `can_use_tool`: asks whether a tool may run. Includes `tool_name`, `input`,
  optional permission suggestions, blocked path, reason/title/display name,
  `tool_use_id`, optional `agent_id`, and optional description.
- `set_permission_mode`: changes permission mode.
- `set_model`: changes model.
- `set_max_thinking_tokens`: changes older extended-thinking budget.
- `mcp_status`: asks for MCP server status.
- `get_context_usage`: asks for a detailed context usage breakdown.
- `rewind_files`: asks to rewind file changes from a user message.
- `cancel_async_message`, `seed_read_state`, `hook_callback`.
- `mcp_message`, `mcp_set_servers`, `mcp_reconnect`, `mcp_toggle`.
- `reload_plugins`, `stop_task`, `apply_flag_settings`, `get_settings`.
- `elicitation`: asks the SDK consumer to handle MCP elicitation.

For Claw's first Claude milestone, the minimum useful set is:

- incoming SDK message stream;
- outbound `user`;
- incoming `control_request/can_use_tool`;
- outgoing `control_response`;
- outgoing `control_request/interrupt`;
- `result` for completion and usage;
- `system/status` and `system/compact_boundary` for compaction;
- `rate_limit_event` if present.

`set_model`, `set_permission_mode`, `get_context_usage`, `mcp_status`, and
`elicitation` are useful next.

## Recommended Claw Architecture

Claude support should arrive as a backend driver in Electron main, not as
renderer remote-session hooks.

Recommended module shape:

```text
src/main/claude/
  protocol.ts
  websocket-transport.ts
  process-transport.ts
  sdk-message-adapter.ts
  session-manager.ts
  __tests__/
```

The app-owned flow should mirror Codex:

```text
Claude SDK stream/control event -> Claude adapter -> app event -> renderer store -> UI
```

### Transport Choice

There are two viable implementation routes.

Route A: process stream-json first.

- Spawn Claude Code with `--print`, `--input-format stream-json`, and
  `--output-format stream-json`.
- Use stdin/stdout NDJSON and the same SDK/control envelopes.
- This avoids relying on the missing direct-connect server files.
- It probably gives us the fastest local prototype for native rendering,
  tool approvals, and interrupt.
- It may be weaker for long-lived multi-agent sessions than Codex app-server;
  we need to verify resume/session behavior through `--resume`,
  `--session-id`, and local transcript files.

Route B: direct-connect websocket, if the installed Claude binary supports it.

- Start `claude server` from Electron main with localhost binding, an
  app-generated bearer token, workspace/default cwd, idle timeout, and max
  session limit.
- `POST /sessions` per agent folder.
- Connect to the returned `ws_url`.
- Send and receive SDK/control NDJSON over websocket.
- Copy the robust reconnect/replay behavior from `WebSocketTransport`, not the
  minimal direct-connect client.

Route B is closer to the user's websocket request, but Route A is the safer
first spike unless we can verify `claude server` in the real binary.

### Session Mapping

Do not map Claude directly onto `codexThreadId`.

Introduce backend-owned session metadata, for example:

```ts
type Agent = {
  backend: "codex" | "claude"
  backendSession?: {
    kind: "codex"
    threadId: string
  } | {
    kind: "claude"
    sessionId: string
    transport: "stdio" | "websocket"
    serverUrl?: string
    transcriptSessionId?: string
  }
}
```

Codex has threads and turns. Claude has sessions, SDK messages, transcript
session ids, and control requests. The app can still expose `turn.started` and
`turn.completed` events if they are useful UI concepts, but the backend storage
must not pretend Claude has Codex thread ids.

### Event Mapping

Initial Claude mapping:

- outbound user prompt -> append local user message, send SDK `user`.
- `stream_event` -> update the active assistant message from Anthropic stream
  events. Preserve ordered text/thinking/tool-use placement.
- completed `assistant` -> finalize assistant message and reconcile tool blocks.
- `user` with `tool_result` blocks -> update matching tool parts with result
  output.
- `result` -> emit `turn.completed`, update usage/cost, set agent idle/error.
- `system/init` -> mark backend running, capture model/tools/MCP/skills summary.
- `system/status` with `compacting` -> emit `context.compactionStarted` or a
  backend status event.
- `system/compact_boundary` -> insert visible compaction boundary.
- `tool_progress` -> `item.updated` for the matching tool use id.
- `control_request/can_use_tool` -> `approval.requested`.
- `control_cancel_request` -> clear pending approval.
- `rate_limit_event` -> provider-owned rate-limit state.
- `auth_status` -> provider runtime/auth status.

Unknown SDK/control types should be logged with summarized keys and ignored
unless they are blocking requests. Unknown blocking `control_request` subtypes
must receive a `control_response` error.

### Permissions

Claude permission requests map cleanly to Claw's existing
`approval.requested` UI:

- `tool_name` -> tool name.
- `input` -> arguments preview.
- `description`, `title`, or `display_name` -> summary/title.
- `permission_suggestions` -> possible persistence choices when we support
  Claude permission rule updates.
- `tool_use_id` and `request_id` -> stable matching ids.

Response mapping:

- allow once -> `behavior: "allow"` with `updatedInput`.
- deny -> `behavior: "deny"` with a message.
- always/remember choices need more investigation because Claude's permission
  response can carry `updatedPermissions`, but the remote direct-connect helper
  only sends `updatedInput`.

### MCP Enablement

Do not globally mutate Claude Code MCP config for Claw.

Likely options:

- pass a temporary `--mcp-config` JSON file or JSON string when spawning
  process stream-json;
- for direct-connect, rely on the server/session creation path if it supports
  session-local MCP config;
- after initialization, use `control_request/mcp_set_servers` only if verified
  to work in the chosen runtime path.

Claude's control schema includes MCP status, dynamic MCP message forwarding, and
server replacement. That is promising, but the first implementation should
prefer startup/session-local config because it mirrors our Codex approach and
avoids mutating global user state.

### Models, Thinking, Skills

The current Claw model and skill contracts are Codex-specific.

Claude exposes model information in `initialize` responses and `system/init`
messages, and it can accept `set_model`. Thinking is `ThinkingConfig` or older
`max_thinking_tokens`, not Codex `ReasoningEffort`.

Claude `system/init` contains `skills`, `plugins`, `slash_commands`, and
`tools`, but the inspected websocket protocol does not show a direct equivalent
to Codex `skills/list` scoped by cwd. The composer slash menu should either:

- become provider-aware behind a generic `BackendSkillSummary`, or
- hide provider-specific skills until the Claude driver can supply them.

## Current Codex Bias Inventory

These are not all bugs. Many were correct for the first Codex-only milestone.
They are the concrete seams to unwind before Claude support.

### Shared Contracts

- `Agent.codexThreadId` stores the only persisted backend session id.
- `BenchTemplate.backend` is the literal union `'codex'`.
- `BenchTemplate.codexDefaults` only models Codex settings.
- `CodexModelOption`, `CodexSkillSummary`, and `ReasoningEffort` are shared
  renderer-facing types.
- `SendPromptOptions` contains Codex-specific `reasoningEffort`, `planMode`,
  `goalMode`, and `skills`.
- `AppSnapshot.appServer` describes a single Codex app-server, not a generic
  backend runtime.
- `CodexClawApi` methods include `listCodexModels()` and
  `listCodexSkills()`.

### Main Process

- `AppController` owns one `codexSessionManager`.
- `getCodexSessionManager()` always creates `CodexProcessTransport`,
  `CodexRpcClient`, and `CodexAgentSessionManager`.
- MCP enablement is hardwired through Codex command-line config overrides.
- `sendAgentPrompt()` accepts `CodexAgentSessionManager` directly and emits
  text like `Starting Codex app-server...`.
- `respondToClientRequest()` assumes the active backend is Codex.
- hydrate, rollback, edit, delete, and retry all depend on `codexThreadId`,
  Codex turns, and `thread/rollback`.
- `steerPrompt()` assumes Codex active-turn steering. The analyzed Claude
  websocket protocol has interrupt and additional user messages, but not a
  Codex-equivalent `turn/steer`.

### Renderer

- `App.vue`, `AppShell.vue`, `ConversationPane.vue`, and `ChatComposer.vue`
  pass `codexModels` and `codexSkills`.
- `ChatModelReasoningSelector` assumes Codex model catalog shape and reasoning
  effort choices.
- `ChatComposerSkillMenu` assumes `CodexSkillSummary`.
- Composer and headers show user-visible Codex strings such as
  `Codex is working`, `Codex pending`, and `Codex error`.
- History hydration checks `agent.codexThreadId`.
- Tool rendering logic understands descriptors with `source: "codex"`.

### Persistence And State

- `state-persistence.ts` reads/writes `codexThreadId`, `backend: 'codex'`,
  and `codexDefaults`.
- `snapshot.ts` sets `codexThreadId` from thread events and clears it on
  restart.
- message ids and rollback helpers infer Codex turn ids from ids like
  `assistant-{turnId}`.
- initial snapshot data and defaults are Codex-branded.

### Documentation

- `docs/architecture.md` says Codex-only for the first product but names a
  future backend seam.
- `docs/codex.md` is correctly Codex-specific.
- `docs/mcp.md` says backend enablement should be backend-specific, but only
  Codex enablement is implemented.

## Refactor Before Claude

The right prep work is not a broad generic provider abstraction. It is a narrow
main-process backend seam with app-owned renderer contracts.

Recommended steps:

1. Introduce backend-neutral main-process interfaces:
   `AgentBackendDriver`, `BackendSession`, `BackendPromptOptions`,
   `BackendModelOption`, `BackendSkillSummary`, and `BackendRuntimeStatus`.
2. Rename persisted runtime fields:
   `codexThreadId` -> backend-specific session state.
   Keep a migration from existing `codexThreadId`.
3. Split app state:
   global app runtime status should not be named `appServer`; agent-specific
   backend status should sit on the agent or backend session.
4. Make model and skill loading route through the active agent backend.
5. Keep Codex-specific plan, goal, steering, thread rollback, and skills as
   backend capabilities, not universal UI assumptions.
6. Add a Claude driver behind the same event contract.
7. Add captured Claude SDK/control fixtures before adding UI surface area.

## First Claude Milestone

The smallest useful Claude milestone:

- one Claude agent in one folder;
- spawn process stream-json or verified direct-connect websocket;
- send a prompt;
- render streaming assistant text;
- render completed assistant messages;
- show and answer `can_use_tool` permission requests;
- interrupt the active turn;
- show completion/error state from `result`;
- preserve Codex agents unchanged.

Explicit non-goals for the first milestone:

- Codex-style active-turn steering;
- Codex-style goal mode;
- Codex `skills/list` parity;
- rollback/edit/delete/retry parity;
- hosted CCR remote sessions;
- PTY terminal embedding.

## Open Questions

- Does Nicolas' installed Claude Code binary expose `claude server` and
  `cc://` direct-connect with the same protocol implied by `main.tsx`?
- If direct-connect is available, does session creation support MCP config,
  model, permission mode, system prompt, and resume parameters?
- Is direct-connect websocket exactly one JSON object per frame, NDJSON per
  frame, or both? The client accepts NDJSON frames; outgoing direct-connect
  messages are single JSON strings.
- How should Claude transcript history be loaded without relying on missing
  direct-connect server files?
- Which Claude permission persistence options should map to Claw's
  `allow_conversation` and `always_allow` buttons?
- Does Claude have a safe equivalent to Codex `turn/rollback`, or should edit
  and retry start as unsupported for Claude agents?
- Can Claude skills be listed without launching a session, or should the first
  Claude composer omit the skills menu?
