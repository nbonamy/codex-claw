# Claude Code Integration Research

Status: research notes with historical bias inventory, 2026-06-06.

Update, 2026-06-06: the Codex-bias inventory in this document was written
before the backend-agnostic cleanup landed. The current code now has
`backendSession`, `backendDefaults`, `backendRuntimes`, backend-neutral model
and skill catalogs, and a main-process backend driver seam. The Claude protocol
research below still applies; the old-field bias list is retained as historical
context.

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

The backend-agnostic cleanup has landed. The current shared/main seam is:

```ts
type AgentBackendDriver = {
  readonly backend: AgentBackend
  getRuntimeStatus(): BackendRuntimeStatus
  getCapabilities(agent: Agent): BackendCapabilities
  sendPrompt(agent: Agent, prompt: string, options?: SendPromptOptions): Promise<BackendSendResult>
  interrupt(agent: Agent): Promise<BackendSendResult>
  respondToRequest(response: ClientRequestResponse): Promise<void>
  hydrateAgent?(agent: Agent): Promise<BackendSession | null>
  steerPrompt?(agent: Agent, prompt: string): Promise<BackendSendResult>
  rollbackToTurn?(agent: Agent, turnId: string): Promise<BackendRollbackResult>
  listModels?(agent: Agent): Promise<BackendModelOption[]>
  listSkills?(agent: Agent): Promise<BackendSkillSummary[]>
  onEvent(listener: (event: BackendEvent) => void): () => void
  close(): Promise<void>
}
```

`CodexBackendDriver` wraps `CodexAgentSessionManager`; `AppController` routes
prompt send, interrupt, history hydration, rollback, request responses, model
loading, and skill loading through the backend driver. Claude is represented in
shared contracts and capabilities, but no Claude driver is implemented yet.

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

The current Claw model and skill contracts are backend-neutral, but only the
Codex driver currently returns real model and skill catalogs.

Claude exposes model information in `initialize` responses and `system/init`
messages, and it can accept `set_model`. Thinking is `ThinkingConfig` or older
`max_thinking_tokens`, not Codex `ReasoningEffort`.

Claude `system/init` contains `skills`, `plugins`, `slash_commands`, and
`tools`, but the inspected websocket protocol does not show a direct equivalent
to Codex `skills/list` scoped by cwd. Composer command and skill menus should
either:

- become provider-aware behind a generic `BackendSkillSummary`, or
- hide provider-specific skills until the Claude driver can supply them.

## Historical Codex Bias Inventory

This section is retained to explain why `docs/backend-agnostic-cleanup.md`
exists. Most items below were fixed by the backend-agnostic cleanup on
2026-06-06 and should not be treated as current code facts. Current remaining
Claude work is listed in "Remaining Claude Driver Work".

### Shared Contracts

- Previously, `Agent.codexThreadId` stored the only persisted backend session
  id.
- Previously, `BenchTemplate.backend` could only represent `'codex'`.
- Previously, `BenchTemplate.codexDefaults` only modeled Codex settings.
- Previously, `CodexModelOption`, `CodexSkillSummary`, and `ReasoningEffort`
  were shared renderer-facing types.
- Previously, `SendPromptOptions` mixed Codex-specific `reasoningEffort`,
  `planMode`, `goalMode`, and `skills`.
- Previously, `AppSnapshot.appServer` described a single Codex app-server
  instead of a generic backend runtime.
- Previously, `CodexClawApi` exposed `listCodexModels()` and
  `listCodexSkills()`.

### Main Process

- Previously, `AppController` owned one concrete Codex session manager.
- Previously, session manager creation was hardwired to
  `CodexProcessTransport`, `CodexRpcClient`, and `CodexAgentSessionManager`.
- MCP enablement is still implemented only for Codex through command-line
  config overrides; future backends need their own enablement path.
- Previously, app-level prompt sending accepted `CodexAgentSessionManager`
  directly and emitted text like `Starting Codex app-server...`.
- Previously, `respondToClientRequest()` assumed Codex.
- Rollback, edit, delete, and retry remain Codex-capability-driven product
  actions until a Claude equivalent is verified.
- `steerPrompt()` remains a Codex capability. The analyzed Claude websocket
  protocol has interrupt and additional user messages, but not a
  Codex-equivalent `turn/steer`.

### Renderer

- Previously, renderer components passed `codexModels` and `codexSkills`.
- Model, reasoning, skill, goal, and steering controls are now capability
  gated, but Codex is the only backend with populated model/skill catalogs.
- Composer and headers may still show user-visible Codex copy for Codex agents;
  another backend should supply its own display name through app-owned state.
- Tool rendering logic still understands descriptors with `source: "codex"`
  because Codex is the only implemented backend.

### Persistence And State

- Previously, persistence read/wrote `codexThreadId` and `codexDefaults`.
- Current persistence writes `backend`, `backendSession`, and
  `backendDefaults`; legacy migration was intentionally left out of scope.
- Message ids and rollback helpers may still carry Codex turn concepts where
  Codex-specific rollback is implemented.
- Initial default data uses Codex as the implemented backend.

### Documentation

- `docs/architecture.md` now documents the backend seam as current.
- `docs/codex.md` remains intentionally Codex-specific.
- `docs/mcp.md` says backend enablement should be backend-specific; only Codex
  enablement is implemented today.

## Remaining Claude Driver Work

The broad pre-Claude cleanup is implemented. The remaining work is a concrete
Claude driver and fixtures, not another generic provider refactor.

Recommended next steps:

1. Add captured Claude SDK/control fixtures before adding UI surface area.
2. Implement a Claude process `stream-json` transport behind
   `AgentBackendDriver`.
3. Map Claude assistant/result/tool/permission events to app-owned
   `BackendEvent`, `ClientRequest`, and `RendererMessage` shapes.
4. Implement interrupt and clear unsupported behavior for steering, rollback,
   edit, retry, goal mode, and skills until Claude support is verified.
5. Add main-process and renderer tests proving Codex agents keep working while
   Claude agents use only Claude-supported capabilities.

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
