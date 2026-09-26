# Claude Code Integration Research

Status: implementation notes plus historical research, 2026-08-09.

Update, 2026-06-06: the Codex-bias inventory in this document was written
before the backend driver seam landed. The current code now has
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

Codex Claw currently talks to provider runtimes through `clawd`. The daemon
owns the Codex app-server and Claude Code child processes, request routing, and
provider-to-app event adaptation. Electron and Web clients consume app-owned
backend events and `RendererMessage` shapes.

The backend driver seam has landed. The current shared/main seam is:

```ts
type AgentBackendDriver = {
  readonly backend: AgentBackend
  getRuntimeStatus(): BackendRuntimeStatus
  getCapabilities(agent: Agent): BackendCapabilities
  tryHandlePromptCommand?(agent: Agent, prompt: string): Promise<BackendSendResult> | null
  sendPrompt(agent: Agent, prompt: string, options?: SendPromptOptions): Promise<BackendSendResult>
  setConversationTitle?(agent: Agent, title: string): Promise<void>
  setGoal?(agent: Agent, objective: string): Promise<BackendGoalResult>
  clearGoal?(agent: Agent): Promise<BackendGoalResult>
  setCodexApprovalPreset?(agent: Agent, preset: CodexApprovalPreset): Promise<BackendCodexApprovalPresetResult>
  interrupt(agent: Agent): Promise<BackendSendResult>
  respondToAgentRequest(response: ClientRequestResponse): Promise<void>
  loadConversation?(agent: Agent): Promise<BackendSession | null>
  listConversations?(agent: Agent, input?: ConversationListInput): Promise<ConversationSummary[]>
  resumeConversation?(agent: Agent, target: ConversationResumeTarget): Promise<BackendConversationResumeResult>
  readConversationMessages?(ref: BackendConversationRef, agentId: string): Promise<RendererMessage[]>
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
shared contracts and capabilities.

Update, 2026-08-09: Codex Claw's Claude driver lives under
`backend/src/claude/` and now uses the official
`@anthropic-ai/claude-agent-sdk` as its default transport. The SDK launches the
user-installed Claude Code executable, so it keeps Claude Code's coding-agent
behavior, local login, settings, skills, hooks, and project instructions. Claw
does not call the Messages API directly or replace Claude Code with a generic
model loop.

Each live Claude session owns one long-running Agent SDK query. Claw sends
subsequent turns through that query's streaming input instead of spawning a new
`claude -p` process for every prompt. A persisted agent with no live query is
resumed through the SDK's `resume` option. Claw retains at most one idle live
query per agent: switching conversations releases the previous query, while an
agent-identity, instruction, MCP, or permission-safety change restarts and
resumes the query so stale configuration cannot leak into later turns. The
transport configures:

Code review defaults to a separate visible reviewer agent in the same workspace.
The user may instead use the current agent and session. Review turns use the
normal Claude conversation replica while adding only the review-session finding
tools; clarification and batched remediation resume that same session id. An
independent reviewer starts without the source conversation history but inherits
its selected model and reasoning effort. For an independent reviewer, `Review
again` deletes the old Claude session and starts a fresh one on the same sidebar
agent. Current-thread reviews preserve the user-owned session for every round
and after finish; an independent reviewer's agent and session are removed when
the review finishes.

- the Claude Code system-prompt and tool presets;
- user, project, and local setting sources;
- the active Claw agent's working directory, model, and permission mode;
- Claw's agent-scoped collaboration MCP server and allowed-tool rule;
- partial streaming events for responsive text and tool cards.

The live Claude transport uses the Agent SDK and feeds its messages into one
Claude conversation host. The host is the sole owner of the normalized Claude
transcript and maps SDK stream messages into immutable
`ClaudeConversationEvent`s:

- `system/init` or any message with `session_id` records a Claude
  `BackendSession`.
- `stream_event` text deltas become incremental `message.delta` events.
- `stream_event` tool starts and input JSON deltas create and update running
  tool cards before the final assistant message arrives.
- assistant text blocks become `message.delta`.
- `tool_use` blocks pass through a shared Claude semantic adapter. Bash keeps
  its command and description; Read, Write, Edit, Glob, Grep, web, Agent, and
  MCP tools expose app-owned titles, paths, actions, icons, and available line
  statistics without making the renderer provider-aware.
- Read, Write, Edit, and NotebookEdit emit app-owned file activity so file
  links and authoritative repository Git status stay current while Claude is
  working.
- `tool_result` blocks update those tool cards and their semantic lifecycle.
- `result` completes the turn or emits an app error.

Claude text currently has no equivalent explicit work/final phase in Claw's
adapter. It therefore remains unphased and uses the shared SDK renderer's
existing flat message layout. Claw does not guess a final-answer boundary or
label every Claude message as final; if the provider exposes reliable phase
semantics later, the driver can populate the same provider-neutral fields.

The host maintains one `ClaudeConversationSnapshot` per agent and publishes a
bounded reset followed by revisioned provider deltas. The renderer applies
those deltas with the shared Claude replica; `AppSnapshot` and the generic Claw
coordination reducer never contain or mutate Claude messages.

This gives Claude agents local prompt send, persistent multi-turn sessions,
streaming display, session resume, and interrupt through the
`AgentBackendDriver` lifecycle seam. Agent SDK permission callbacks are
normalized into the Claude provider snapshot. Claude's `AskUserQuestion` tool
is normalized to the provider's multi-question form, and the response is
routed back to the blocked SDK tool call. Session-scoped and persistent
permission suggestions back Claw's Allow for conversation and Always allow
choices.
Claude's proactive permission posture remains distinct from Codex approval
presets. The composer renders a capability-driven Permissions submenu with
Claude's own `default`, `acceptEdits`, `dontAsk`, `auto`, and
`bypassPermissions` modes. Native `plan` permission mode remains behind
Claw's separate Plan-mode control. The last permission choice is persisted in
the Claude branch of the agent defaults and routed to the Claude driver as an
opaque mode ID. The driver validates the advertised mode before applying it;
`bypassPermissions` also enables the Agent SDK's explicit dangerous-skip
safety gate. Codex continues to use its independent approval-preset contract
and menu.
Claude advertises prompt attachments through the shared composer. The Electron
attachment registry resolves renderer-safe references before they reach
`clawd`; the Agent SDK transport sends supported images, PDFs, and text/source
files as native multimodal content blocks. Other binary files remain available
to Claude Code by their trusted local path. Rollback and edit/retry remain
disabled until those surfaces are implemented reliably for Claude. Model
listing is local.
Claude context usage comes from the Agent SDK's `getContextUsage()` control
request and is normalized into Claw's provider-neutral context gauge after
session initialization, turns, and compaction. Selecting a persisted Claude
conversation also opens a short-lived, non-persisting SDK query to restore the
exact gauge without sending a prompt or changing the transcript. Claude's
automatic and manual compaction status/boundary messages reuse Claw's existing
compaction lifecycle.
`/compact` (including optional summary instructions) remains a Claude-owned
local command; Claw routes it without displaying a user prompt, and completed
boundaries are restored from Claude transcript history.
Skill listing is filesystem-derived: Claw reads user skills from `~/.claude/skills`
and project skills from `<agent-folder>/.claude/skills`, parses each
`SKILL.md` frontmatter, and lets project skills override global skills with the
same name.
Folderless Quick Chats use the user's home directory as Claude's runtime cwd,
without assigning a project folder to the agent. Model discovery, turns, and
transcript recovery use that same directory; skill discovery includes only
user skills. Claude conversation references retain a null folder for these chats.
Claude advertises `planMode: "prompted"`: Claw owns the composer Plan-mode
flag, and when the renderer sends `planMode: true`, the driver keeps the prompt
text unchanged and starts the Agent SDK turn with its native `permissionMode:
"plan"`. This avoids relying on the interactive `/plan` slash command, which
is not available in every SDK environment. Claude's stream output then exposes
a provider-specific plan flow:

- `EnterPlanMode` marks the Claude session as planning.
- `system/status.permissionMode: "plan"` is normalized to
  `conversation.modeUpdated`.
- Claude may write a private plan file under `~/.claude/plans/...`; Claw treats
  that `Write` tool's streamed `content` as `turn.proposedPlanDelta` and does
  not render the private write as a generic chat tool.
- `ExitPlanMode` carries the final `input.plan`; Claw normalizes it to
  `turn.proposedPlanCompleted` and opens the app-owned plan preview.

Claude's plan file is a provider artifact, not Claw's source of truth. The
source of truth for the UI is the app-owned agent plan stored from normalized
plan events. Plan comments keep `planMode` enabled and send a follow-up prompt
so Claude can emit a new `ExitPlanMode` plan; confirming clears Plan mode and
sends the implementation prompt through the normal Claude path.

Claude transcript history is loaded from Claude Code's local JSONL transcripts,
not from the CLI. Claude stores project transcripts under
`~/.claude/projects/<project-directory>/<session-id>.jsonl`, where the project
directory is the absolute folder path with path separators replaced by `-`
(`"/Users/nbonamy/src/id8"` becomes `"-Users-nbonamy-src-id8"`). A
`sessions-index.json` file can also point to the transcript path.

The Claude transcript adapter lives in `backend/src/claude/` and reads only the
displayable records:

- `type: "user"` entries with non-meta text become user `RendererMessage`s.
- `type: "assistant"` text blocks become assistant message text parts.
- assistant `tool_use` blocks use the same semantic Claude tool adapter as the
  live stream, preserving commands, filenames, MCP identity, and available
  line statistics after restart.
- user `tool_result` blocks complete the matching tool cards.
- Claude queue operations, attachments, `last-prompt`, sidechains, and meta
  local-command records are ignored.

On agent selection or startup hydration, the Claude conversation host emits a
`claude.conversationSnapshotChanged` frame. Later SDK and transcript events are
transported in `claude.conversationEventReceived` frames. Claw owns the outer
agent/revision envelope but does not reinterpret the provider event.

The Resume Session dialog opened from an agent's sidebar menu is the Claude
implementation of the generic driver capability documented in
`docs/architecture.md`. Main process scans that agent folder's
`~/.claude/projects/.../*.jsonl` entries, sorts them
newest first by file modification time, and returns app-owned
`ConversationSummary` rows with an opaque `BackendConversationRef`. Clicking a
session row stores that session id as the agent's current
`BackendSession`, reloads its transcript messages, and the next prompt resumes
that session through the Agent SDK. Resume is allowed only while the agent is
idle.

The Agent SDK launches the configured executable directly rather than through
a shell. Prompt and developer-instruction text is delivered over the SDK input
stream and is not included in Claw's process logs.

Before a Claude session starts, Claw offers the safe local aliases `opus`,
`sonnet`, and `haiku`, with `sonnet` as the default. When a Claude agent is
selected, Claw opens a short-lived Agent SDK query with session persistence
disabled, reads its initialization model catalog, and closes it without sending
a prompt. The composer therefore refreshes to the SDK's current models after a
restart without creating an empty Claude conversation. Display names,
descriptions, and supported effort levels come from the SDK, so the composer
only offers an effort selector for models that advertise it. The selected
effort is passed to the Agent SDK on the first turn and updated on later turns
with its runtime flag settings API. Claude transcript hydration also reads the
latest main-thread assistant model and effort from the JSONL record, so opening
or reloading a conversation restores its own selection. When older history has
no such metadata, Claw falls back to the last Claude model and effort used by
that agent; resolved transcript model IDs are matched back to the SDK catalog's
friendly model entry.

The transport prepends common user binary folders such as `~/.local/bin`,
`~/bin`, `/opt/homebrew/bin`, and `/usr/local/bin` to `PATH` because packaged or
GUI-launched Electron processes often do not inherit the user's shell PATH. Set
`CODEX_CLAW_CLAUDE_COMMAND=/absolute/path/to/claude` to override executable
resolution. If Claude Code emits the common unauthenticated stream result, Claw
normalizes it to an actionable app error telling the user to open Claude Code
and run `/login`.

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

Historical recommended module shape (the implemented equivalents now live
under `backend/src/claude/`):

```text
src/main/claude/
  protocol.ts
  websocket-transport.ts
  process-transport.ts
  sdk-message-adapter.ts
  session-manager.ts
  __tests__/
```

The implemented ownership flow is:

```text
Claude Agent SDK -> Claude conversation host -> provider snapshot/event
                 -> Claw revisioned transport frame -> Claude renderer replica -> UI
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

The current Claw model and skill contracts are backend-neutral. Codex returns
its catalog from app-server; Claude refreshes its model catalog from the Agent
SDK after session initialization and exposes only model-supported effort levels.

Claude exposes model information through the Agent SDK and `system/init`
messages. The SDK's `supportedModels()` response supplies model-specific effort
levels, which Claw maps to its backend-neutral reasoning-effort picker and
passes as the SDK `effort` option. Adaptive thinking remains SDK-controlled for
now: Claw does not expose a separate thinking-budget control.

Claude `system/init` contains `skills`, `plugins`, `slash_commands`, and
`tools`, but the inspected websocket protocol does not show a direct equivalent
to Codex `skills/list` scoped by cwd. Composer command and skill menus should
either:

- become provider-aware behind a generic `BackendSkillSummary`, and
- keep provider-specific skills behind the backend skill catalog. Codex uses
  `skills/list`; Claude currently supplies the same app contract by parsing
  `~/.claude/skills` and `<agent-folder>/.claude/skills`.

## Historical Codex Bias Inventory

This section is retained as historical context. Most items below were fixed by
the backend driver seam cleanup on 2026-06-06 and should not be treated as
current code facts. Current remaining Claude work is listed in "Remaining
Claude Driver Work".

### Shared Contracts

- Previously, `Agent.codexThreadId` stored the only persisted backend session
  id.
- Previously, `CodexModelOption`, `CodexSkillSummary`, and `ReasoningEffort`
  were shared renderer-facing types.
- Previously, `SendPromptOptions` mixed Codex-specific `reasoningEffort`,
  `planMode`, `goals`, and `skills`.
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
- Model, reasoning, skill, goal, and steering controls are capability gated.
  Claude starts with local model aliases, then receives its live model catalog
  and supported effort levels from the Agent SDK after initialization.
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

## Current Claude Follow-ups

The local Agent SDK path, provider-owned conversation host, renderer replica,
streaming, resume, permissions, user questions, plans, compaction, context, and
interrupt are implemented. Remaining work should add provider capabilities
without widening Claw's ownership:

- Codex-style active-turn steering;
- Codex-style goals;
- Codex `skills/list` parity beyond filesystem parsing, if Claude exposes a
  richer runtime catalog later;
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
- Which Claude permission persistence options should map to Claw's
  `allow_conversation` and `always_allow` buttons?
- Does Claude have a safe equivalent to Codex `turn/rollback`, or should edit
  and retry start as unsupported for Claude agents?
- Does Claude expose a richer runtime skills catalog than the filesystem
  `SKILL.md` sources Claw currently parses?
