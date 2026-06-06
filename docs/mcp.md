# MCP Server

Codex Claw owns a local MCP server for agent-to-agent collaboration. This is an
app collaboration surface, not a Codex-specific protocol. Codex is the first
backend client, but a future Claude Code backend should use the same Claw MCP
tools where possible and translate only the backend-specific enablement path.

## Boundary

Electron main owns the MCP server, collaboration state, and all tool effects.
The renderer never talks to MCP directly.

Main responsibilities:

- start and stop the MCP server;
- expose only tools backed by real Claw product behavior;
- keep message inboxes and connection state;
- enforce team visibility;
- notify the right agent when inbox work arrives;
- translate status updates into app-owned `agent.updated` events.

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

The port is ephemeral by default. The server starts lazily before the first
backend session that needs it. Keep the server loopback-only unless we
explicitly design a remote-control product surface.

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

For Codex, main starts `codex app-server` with only process-wide feature
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

Main also adds developer instructions that give the backend agent its Claw
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
- notifies main so the recipient can be prompted.

### `check-messages`

Returns unread messages for the caller.

Input:

- `markAsRead`: optional boolean, default `true`.

Returned messages include message ID, sender display name, content, and
timestamp. Message IDs are inbox item IDs, not agent IDs. When `markAsRead` is
true, returned messages are marked read immediately.

### `broadcast-message`

Sends a message to every other connected visible agent.

Input:

- `content`: message content.

Effects are the same as `send-message`, repeated for each connected recipient.
Visible agents without an active MCP session are skipped internally.

## Inbox Prompting

When a recipient receives a direct or broadcast message:

- if the recipient is idle, main starts a normal backend turn with the inbox
  prompt;
- if the recipient is busy, main waits until the current turn completes and
  prompts them only if unread messages remain.

The current inbox prompt is:

```text
Check your inbox for questions or instructions from other agents. Update your status and immediately execute what is being asked without confirmation.
```

This keeps agent-to-agent messaging inside the same turn pipeline as normal
user prompts. There is no separate renderer-side command path.

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
  Claw owns those product capabilities.
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
