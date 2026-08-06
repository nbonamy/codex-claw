# MCP Server

Codex Claw owns a local MCP server for agent-to-agent collaboration. This is an
app collaboration surface, not a Codex-specific protocol. Codex is the first
backend client, but a future Claude Code backend should use the same Claw MCP
tools where possible and translate only the backend-specific enablement path.

## Boundary

`clawd` owns the MCP server, collaboration state, and backend-owned tool
effects. Electron main does not start this HTTP server; it only receives
app-owned backend events for desktop effects such as displaying Markdown in the
side panel. The renderer never talks to MCP directly.

Backend responsibilities:

- start and stop the MCP server;
- expose only tools backed by real Claw product behavior;
- keep message inboxes and connection state;
- enforce team visibility;
- notify the right agent when inbox work arrives;
- translate status updates into app-owned `agent.updated` events.
- route Computer Use requests to the connected desktop client; `clawd` never spawns the native helper itself.

Electron main responsibilities:

- fan backend events out to renderer windows;
- perform native desktop effects requested by app-owned backend events;
- keep preload IPC independent from MCP SDK and provider protocol types.
- package the product-specific Computer Use helper and execute it only in response to explicit `client/computerUse/*` requests.

Renderer responsibilities:

- render agent status and unread/working state from app-owned events;
- send normal user actions through preload IPC;
- never import MCP SDK types;
- never call MCP tools directly.

## Transport

The server uses the official TypeScript MCP SDK with Streamable HTTP on a
loopback address:

```text
http://127.0.0.1:<port>/mcp
```

The port is ephemeral by default. The server starts inside `clawd` before
backend drivers are constructed so Codex and Claude sessions receive a valid
backend-owned MCP URL. Keep the server loopback-only unless we explicitly
design a remote-control product surface.

The transport uses JSON responses for normal request/response calls
(`enableJsonResponse: true`) rather than one-shot SSE responses. This mirrors
id8's embedded MCP servers and keeps tool call results easy for backend clients
and app-server event adapters to consume.

Auxiliary endpoints:

- `GET /health` returns a simple health response.
- `GET /` returns debug agent state for local development.
- `POST /mcp` handles MCP requests.

`GET /mcp` and `DELETE /mcp` are rejected because the current implementation is
stateless per HTTP request while Claw's process-local coordinator owns the
collaboration state.

## Backend Enablement

Backends should receive the MCP server through request-local or session-local
configuration. Do not mutate a user's global tool configuration as part of the
normal app path.

For Codex, `clawd` starts `codex app-server` with only process-wide feature
overrides, then passes the Claw MCP server through each agent's
`thread/start.config` or `thread/resume.config`:

```json
{
  "mcp_servers.codex_claw.url": "http://127.0.0.1:<port>/mcp?agentId=<agent-id>",
  "mcp_servers.codex_claw.default_tools_approval_mode": "approve"
}
```

The agent id in the MCP URL is the app's session-local caller identity. Tool
calls infer the caller from the URL instead of asking the model to provide its
own `agentId` or `from`. The same unique ID is also injected into the agent's
developer instructions and returned by `list-agents`, so agents can coordinate
with duplicates created from the same Bench template.

The scoped `mcp_servers.codex_claw.default_tools_approval_mode = "approve"`
override authorizes only Claw's own collaboration tools; it does not authorize
all Codex shell/file operations and does not mutate the user's global MCP
config.

## Computer Use

## In-app Browser

The same MCP server exposes an agent-scoped `browser-open` tool that accepts an
HTTP or HTTPS URL, opens that agent's Browser workspace without changing the
user's selected agent, and waits for its sandboxed page to load. The agent can
then use `browser-get-dom`,
`browser-screenshot`, `browser-click`, `browser-type`, `browser-scroll`, and
`browser-console-logs`. `clawd` routes opening through `client/browser/open`
and page operations through `client/browser/execute`; Electron main performs
the operations against its sandboxed `WebContentsView`. Browser instances are
addressed by agent id and browser id; today's UI uses one stable `primary`
browser id per agent, while the contract and native host can support multiple
browser tabs later. Inactive agent workspaces and their native views remain
mounted but hidden, so browser MCP work can continue in the background. The
renderer never receives page DOM, cookies, screenshots, or arbitrary
page-script access.

Computer Use is a local macOS capability exposed through the same Claw MCP
server. The shared native helper lives in `~/src/computer-use/macos`; Codex
Claw packages its own signed `Codex Claw Computer Use.app` copy.

Computer Use tools are omitted from an agent's MCP server unless the user
enables Computer Use in Settings -> Plugins. Chrome is a separate bundled
ChatGPT plugin: it is not reimplemented as a Claw MCP server. When enabled in
ChatGPT using Claw's shared `CODEX_HOME`, the `chrome:control-chrome` skill is
available to agents that have Chrome enabled in Claw settings.

When Claw launches Codex app-server, it disables that child process's
`node_repl` MCP server unless Chrome is enabled in Settings -> Plugins. This
keeps the raw host bridge out of the default Claw session while allowing the
bundled Chrome skill to use it when explicitly enabled; it does not change the
user's global MCP configuration.

```text
agent -> codex_claw MCP -> clawd -> client/computerUse RPC -> Electron main -> native helper -> macOS Accessibility
```

Tools are `computer-use-status`, `computer-use-request-accessibility`,
`computer-use-request-screen-recording`,
`computer-use-list-apps`, `computer-use-find-apps`,
`computer-use-launch-app`, `computer-use-focus-app`,
`computer-use-get-app-state`, `computer-use-screenshot`, `computer-use-click`,
`computer-use-type-text`, `computer-use-set-value`, and
`computer-use-scroll`.

`computer-use-screenshot` returns MCP image content rather than embedding PNG
base64 in text. Its `window` scope targets the frontmost or explicitly selected
application; its `screen` scope captures the main or explicitly selected
display. Screenshot capture is gated by the helper's separately reported
Screen Recording trust, surfaced in General -> System permissions.

The helper reports its own Accessibility trust. Agents must check status or
request permission before inspection/actions and refresh app state before
acting on an indexed element. Normal MCP approval applies to each call.

For Claude, `clawd` passes the same request-scoped agent URL through the Claude
CLI instead of mutating global Claude Code config:

```bash
claude -p "<prompt>" \
  --mcp-config '{"mcpServers":{"codex_claw":{"type":"http","url":"http://127.0.0.1:<port>/mcp?agentId=<agent-id>"}}}' \
  --allowed-tools 'mcp__codex_claw__*' \
  --append-system-prompt "<Codex Claw developer instructions>"
```

The `--allowed-tools` pattern mirrors Skwad's Claude integration and
authorizes only tools from the `codex_claw` MCP server.

`clawd` also adds developer instructions that give the backend agent its Claw
agent ID/name/folder and tell it to set status, list agents, send messages,
and check inboxes through the `codex_claw` MCP server. Agents do not need to
register or pass their own agent ID to tools.

For another backend, keep the tool semantics below unchanged and implement the
smallest equivalent enablement path for that backend.

## Tools

The first collaboration tools copy Skwad's names where they still fit, but the
caller identity is app-owned and inferred from the backend session.

### `list-agents`

Lists visible agents for the caller.

Input: none.

Visibility is team-scoped. Agents with a `teamId` see agents in the same team.
Agents without a team see other no-team agents.

Output uses unique agent IDs, display names, folders, and status. If several
visible agents share the same display name, `send-message` uses the agent ID as
the disambiguator.

### `set-status`

Updates the caller's short collaboration status.

Input:

- `status`: short status text; an empty string clears the status.

Effects:

- stores `agent.statusText`;
- emits `agent.updated`;
- lets other agents understand who is working, idle, blocked, or ready.

Developer instructions make this mandatory before starting work, changing
direction, and finishing.

### `send-message`

Sends a direct message to another visible agent.

Input:

- `to`: recipient agent ID, or recipient name if visible names are unique.
- `content`: message content.

Effects:

- resolves the recipient inside the sender's visibility scope;
- rejects ambiguous recipient names and asks the agent to use the ID from
  `list-agents`;
- stores an unread inbox message;
- steers the message into the recipient's active Codex turn when steering is
  available;
- otherwise exposes it in the recipient's visible prompt queue and sends it as
  the next prompt after the active turn completes;
- `clawd` owns that same queue for user and teammate prompts; renderer actions
  request steer/delete mutations and only reflect confirmed snapshot changes;
- returns the resolved recipient ID and display name so tool activity uses a
  human-friendly label even when the caller addressed an agent by UUID.

### `check-messages`

Manual recovery tool that returns unread messages for the caller.

Normal agent-to-agent messages are delivered directly as backend prompts. An
agent should only call `check-messages` when explicitly asked to recover missed
messages or debug message delivery.

Input:

- `markAsRead`: optional boolean, default `true`.

Returned messages include message ID, sender display name, sender agent ID,
content, and timestamp. Message IDs are inbox item IDs, not agent IDs. When
`markAsRead` is true, returned messages are marked read immediately.

### `broadcast-message`

Sends a message to every other connected visible agent.

Input:

- `content`: message content.

Effects are the same as `send-message`, repeated for each connected recipient.
Visible agents without an active MCP session are skipped internally.

### `display-markdown`

Displays Markdown in Codex Claw's right side panel.

Input:

- `path`: optional Markdown file path relative to the caller agent's folder, or
  an absolute path inside that folder.
- `markdown`: optional inline Markdown content.
- `title`: optional side panel title.

Exactly one of `path` or `markdown` must be provided. Path reads use the same
agent-folder boundary as renderer file previews: files must resolve inside the
caller agent folder, must be regular files, and must fit the app preview size
limit. Inline Markdown is emitted directly as app-owned renderer content.

Effects:

- emits `sidePanel.markdownRequested`;
- renderer opens the Markdown side panel for the active agent;
- returns a structured success result with the displayed title and path when
  available.

### `mark-work-item-completed`

Marks one of the caller's assigned backlog work items as completed.

Input:

- `workItemId`: exact Work item ID from the assignment prompt, such as
  `github:owner/repo#123`.
- `confirmCompletion`: optional boolean. Use `true` only after following any
  completion instructions returned by the first call.

Effects:

- verifies that the work item is currently assigned to the caller;
- if the assignment came from a loop with before-completion instructions, the
  first call records that those instructions were delivered and returns them
  without completing the work item;
- if loop completion instructions were already delivered, requires
  `confirmCompletion: true` before completing;
- updates `workBacklog.assignments[workItemId].status` to `completed`;
- applies any loop cleanup configured for the assignment after confirmed
  completion;
- emits `workBacklog.assignmentUpdated` so the cockpit backlog reflects the
  completed state;
- persists the updated assignment.

## Direct Message Delivery

When a recipient receives a direct or broadcast message:

- the message is stored as unread in the MCP coordinator;
- if the recipient is idle, main drains unread messages for that agent and
  starts a normal backend turn containing the sender name, sender agent ID, and
  message body directly;
- the delivery prompt is also appended to the recipient's visible conversation
  as a user message, just like a normal prompt from the renderer;
- the renderer recognizes Claw's delivery envelope, labels the bubble with the
  sender name, and shows only the teammate-authored body; the complete envelope
  still reaches the backend agent and remains recoverable from hydrated thread
  history;
- if the recipient is busy, main waits until the current turn completes, then
  drains all pending unread messages into one direct delivery prompt.

The direct delivery prompt is intentionally not a generic "check your inbox"
instruction. Messages use a versioned, JSON-encoded envelope with stable marker
lines, followed by separately delimited delivery guidance:

```text
<<<CODEX_CLAW_AGENT_MESSAGES_V1>>>
{
  "version": 1,
  "messages": [
    {
      "senderName": "Dina",
      "senderId": "agent-dina",
      "sentAt": "2026-08-02T12:00:00.000Z",
      "content": "Please review this."
    }
  ]
}
<<<END_CODEX_CLAW_AGENT_MESSAGES_V1>>>
```

The renderer reads only the delimited envelope, so delivery-instruction wording
can change without breaking the sender label or message-body projection. It
also recognizes the earlier prose envelope for hydrated historical messages.
This keeps agent-to-agent messaging inside the same turn pipeline as normal
user prompts while avoiding the old extra `check-messages` indirection. There
is no separate renderer-side command path.

## Approval Flow

Codex may ask the app-server client to approve MCP tool calls through
`mcpServer/elicitation/request`. Claw does not auto-accept these requests.
Electron main translates the Codex elicitation into an app-owned
`confirm_tool` client request, emits `approval.requested`, and keeps the
JSON-RPC request pending until the renderer answers.

The renderer shows the approval inline on the running MCP tool call whenever
the matching item is already present. The decision maps back to Codex as:

- `allow` -> `accept`
- `allow_conversation` -> `accept` with `_meta.persist = "session"`
- `always_allow` -> `accept` with `_meta.persist = "always"`
- `deny` -> `decline`

## State Model

MCP collaboration state is process-local runtime state for now:

- agent connection state lives on the app `Agent` objects;
- short statuses live as `agent.statusText`;
- inbox messages live in the MCP coordinator;
- unread messages stay until checked;
- old read messages are bounded so long desktop sessions do not grow without
  limit.

Persisting MCP inbox history is not part of the first no-team communication
milestone. If we add durable collaboration history later, it should be app
state, not Codex transcript duplication.

## Error Handling

Tool errors return MCP tool results with `isError: true` and plain text
messages. Useful recovery messages matter because agents may need to repair
their own context after compaction. Model-facing agent lists include unique
agent IDs alongside names and folders. Unknown or ambiguous recipients include
visible IDs, names, and folders so the agent can recover cleanly.

## Security

- Bind to `127.0.0.1`.
- Do not expose filesystem, worktree, panel, or process-control tools until
  Claw owns those product capabilities. `display-markdown` is allowed because
  Claw now owns a constrained Markdown side panel and agent-folder-limited file
  preview path.
- Do not advertise copied Skwad tools unless Claw can actually perform them.
- Do not let renderer code call MCP directly.
- Prefer request-local backend configuration over global user config mutation.

## Testing

Cover MCP behavior at three layers:

- coordinator contract tests for session connection, visibility, messaging,
  broadcasts, status, and errors;
- Streamable HTTP MCP round-trip tests for tool listing and tool calls;
- backend session tests proving the MCP server URL and developer instructions
  are injected into backend session startup.

When adding a tool, add coordinator tests first, then HTTP tool-call coverage,
then any backend enablement tests needed to prove agents can see it.

## Future Tools

Potential tools from Skwad are intentionally not exposed yet:

- repo/worktree operations;
- create/close agent;
- markdown or artifact panel display;
- mermaid rendering;
- file or git actions.

Add them only when Claw has the matching product capability and a tested
main-process implementation.
