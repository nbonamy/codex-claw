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

Prefer a custom `CODEX_HOME` for Codex Claw so normal Codex CLI/app data is not
disturbed. Whether this is mandatory from day one or only for packaged builds is
still a product decision.

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

## Requests

Important requests for the first product:

- `thread/start`
- `thread/resume`
- `thread/list`
- `turn/start`
- `turn/steer`
- `turn/interrupt`

The main process should expose these through app-level services such as
`AgentSessionManager`, not directly through renderer IPC.

## Notifications And Server Requests

Important notifications:

- `thread/started`
- `thread/status/changed`
- `turn/started`
- `turn/completed`
- `item/started`
- `item/completed`
- `item/agentMessage/delta`
- `item/reasoning/*`
- `item/plan/delta`
- `item/commandExecution/outputDelta`
- `item/fileChange/patchUpdated`
- `turn/diff/updated`

Important server-initiated requests:

- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/permissions/requestApproval`
- `item/tool/requestUserInput`

Server requests are not renderer implementation details. Main stores the
pending request, emits an app-owned prompt event, and resolves or rejects the
server request when the renderer answers.

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

Mapping sketch:

- `UserMessage` becomes a user message.
- `AgentMessageDelta` appends assistant text to an in-flight assistant message.
- completed `AgentMessage` finalizes the assistant message.
- `CommandExecution` becomes a tool call named `command_execution`.
- `CommandExecutionOutputDelta` appends output to the matching tool call.
- `FileChange` and `FileChangePatchUpdated` become file-change tool/diff
  state.
- `TurnDiffUpdated` updates the turn-level diff panel.
- MCP and dynamic tool calls become renderer tool calls.
- approval and ask-user requests become pending UI prompts.
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
