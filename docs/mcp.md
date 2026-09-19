# MCP Servers

Codex Claw owns local MCP endpoints for agent-to-agent collaboration and for
credentialed access to provider-hosted MCP servers. These are app surfaces,
not Codex-specific protocols. Codex and Claude receive the same Claw-owned
endpoints through their session-local configuration; each backend translates
only that configuration into its native launch contract.

## Boundary

`clawd` owns the MCP server, collaboration state, and backend-owned tool
effects. Electron main does not start this HTTP server; it only receives
app-owned backend events for desktop effects such as displaying Markdown in the
side panel. The renderer never talks to MCP directly.

Backend responsibilities:

- start and stop the MCP server;
- proxy installed provider-hosted MCP servers without exposing credentials to
  Codex, Claude, or renderer state;
- obtain provider credentials from the existing work integration and refresh
  them before an upstream request or once after an upstream `401`;
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
- `/mcp/providers/<provider>` transparently proxies the provider's Streamable
  HTTP MCP endpoint when that provider is installed and connected.

`GET /mcp` and `DELETE /mcp` are rejected because the current implementation is
stateless per HTTP request while Claw's process-local coordinator owns the
collaboration state.

Provider endpoints preserve Streamable HTTP methods, session headers, response
content types, and response bodies. They replace any caller authorization with
a current Claw-owned provider credential. The upstream token never appears in
backend session config, MCP tool input/output, renderer state, or logs.

## Hosted MCP Gateway

Provider-hosted MCP servers are represented by a small backend-owned catalog.
The catalog contains public transport facts such as the server id and upstream
URL plus the work integration that owns its credential. It does not duplicate
provider tool schemas or implement provider APIs. The gateway is a transparent
reverse MCP proxy:

```text
Codex or Claude
  -> agent-scoped Claw loopback MCP URL
  -> clawd hosted MCP gateway
  -> current credential from WorkIntegrationManager
  -> provider-hosted MCP server
```

The first catalog entry is GitHub. Connecting the existing GitHub integration
currently also installs its hosted MCP server. A newly started or resumed agent
then receives a local server named `github`, preserving GitHub's native tool
names under the backend's normal MCP namespace. Disconnecting GitHub disables
the catalog entry for future session configuration; an already-running session
keeps its local URL but calls fail until GitHub is reconnected.

Claw also launches its Codex app-server with
`plugins."github@openai-curated-remote".enabled=false`. This process-local
override prevents the globally installed GitHub plugin from contributing a
second GitHub tool surface inside Claw. It does not edit the shared Codex config
or disable the plugin in ChatGPT and other Codex clients.

For each Codex thread, Claw disables the ChatGPT GitHub connector only when the
same thread receives Claw's authenticated `github` MCP proxy. If Claw has no
usable GitHub integration, it leaves the ChatGPT connector enabled as a
fallback so the model can still access GitHub even though Claw-specific GitHub
features are unavailable. The choice is session-local and never changes the
user's shared Codex or ChatGPT configuration.

`WorkIntegrationManager` is the runtime credential authority. The gateway asks it
for an authorization header on every upstream request, so the ordinary expiry
check and concurrent refresh de-duplication apply to both Claw's GitHub product
features and GitHub MCP calls. If GitHub MCP rejects a credential with `401`,
the gateway asks the manager to rotate it and retries that request exactly once.
Refresh failure marks the shared GitHub connection as requiring reconnection.

Do not configure a provider's remote URL or bearer token directly in Codex,
Claude, or user-global MCP settings. That would expose a rotating secret to the
harness, split credential ownership, and make Claw unable to refresh an active
session safely. Future Apps should add catalog/install state and provider auth
adapters behind this gateway; they should not add provider-specific transcript,
tool-schema, or API wrappers to the renderer.

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

When GitHub is connected, the same extension also adds:

```json
{
  "mcp_servers.github.url": "http://127.0.0.1:<port>/mcp/providers/github?agentId=<agent-id>"
}
```

Only `codex_claw` collaboration tools receive Claw's automatic approval mode.
Hosted provider tools keep the backend's normal approval behavior.

The agent id in the MCP URL is the app's session-local caller identity. Tool
calls infer the caller from the URL instead of asking the model to provide its
own `agentId` or `from`. The same unique ID is also injected into the agent's
developer instructions and returned by `list-agents`, so agents can coordinate
precisely.

The scoped `mcp_servers.codex_claw.default_tools_approval_mode = "approve"`
override authorizes only Claw's own collaboration tools; it does not authorize
all Codex shell/file operations and does not mutate the user's global MCP
config.

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

## Computer Use

Computer Use is a local macOS capability exposed through the same Claw MCP
server. The shared native helper lives in `~/src/computer-use/macos`; Codex
Claw packages its own signed `Codex Claw Computer Use.app` copy. The release
artifact and checksum are pinned in `computer-use-release.json`; local helper
development remains available through `npm run build:computer-use:local`.
Claw and the bundled helper move together on the v2 contract; there is no v1
compatibility layer or protocol negotiation. The version returned by status is
diagnostic only.

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

Tools are `computer-use-guide`, `computer-use-status`, `computer-use-request-accessibility`,
`computer-use-request-screen-recording`,
`computer-use-list-apps`, `computer-use-list-windows`, `computer-use-find-apps`,
`computer-use-launch-app`, `computer-use-focus-app`,
`computer-use-get-app-state`, `computer-use-screenshot`, `computer-use-click`,
`computer-use-dismiss`,
`computer-use-press-key`, `computer-use-type-text`, `computer-use-paste`,
`computer-use-set-value`, `computer-use-select-text`, `computer-use-scroll`,
`computer-use-drag`, and `computer-use-perform-secondary-action`.

The developer prompt tells agents to call `computer-use-guide` before their
first Computer Use action. The guide returns the cross-tool workflow and
fallback rules on demand, keeping individual MCP descriptions focused on their
own contracts without permanently loading detailed operating instructions.

Window targeting is explicit. Agents call `computer-use-list-windows` for the
selected app, choose its positive session-local `window_id`, and pass that ID
to application state, window screenshots, focus, and every action, including
native menu actions. There is no implicit current-window fallback. Opening or
closing a window invalidates assumptions about the list, so agents list again
instead of silently retrying against another window. Read-only menu-bar state,
full-screen screenshots, discovery, app launch, status, and permission commands
do not require a window ID.

Closed or foreign IDs return `window_not_found`; cross-window elements or
coordinates return `window_mismatch`; keyboard focus verification can return
`window_focus_failed`; and window capture can return
`window_capture_ambiguous` when the exact Accessibility-to-ScreenCaptureKit
match is unavailable. These errors require refreshing `computer-use-list-windows`,
not falling back to another window.

`computer-use-get-app-state` returns one coherent observation: compact
Accessibility hierarchy text, with screenshots opt-in (`includeScreenshot: true`).
The first observation for a window/configuration is full; later observations
are per-window `+`/`~` diffs and compact removed-ID ranges, with `stateRevision`
and `baseRevision`. A full baseline replaces a diff when it is smaller.
Leading numbers are helper-session-stable `element_index` values.
`rootElementIndex` and indexed actions are valid only in the selected window.
`disableDiff: true` forces a new full baseline, while
`includeScreenshot: false` avoids capture when the AX state is sufficient. A
screenshot failure leaves the Accessibility result usable and reports
`screenshotError`; screenshot bytes are emitted as MCP image content and
removed from structured JSON. Hierarchy text is emitted only once, in text
content; structured metadata excludes duplicate text and context snapshots.

Window-targeted actions accept `observe: {}` to return a settled observation in
the same call. `observe` may include `includeScreenshot`, `waitForText`, and
`timeoutMs` (1–15000); standalone observations accept the same readiness options.
The helper checks bounded AX stability, not application-level success. Inspect
the resulting state and `settling.timedOut`. Combined responses preserve
`actionDelivered: true` and `actionResult` if the following observation fails;
do not blindly retry an already-delivered action. Tool schemas reject unknown
arguments so misspelled targeting and observation options cannot be ignored.
Native Computer Use callbacks have a 35-second outer deadline, allowing the
helper's 30-second transport deadline to return its result. Other callbacks
retain their existing deadline. If an observation response is lost, the MCP
adapter forces a new full baseline on the next read of each scope; it never
replays the action. Web loading state participates in readiness, and explicit
text conditions need not wait for unrelated content to stop changing.

AX inspection and actions do not require foregrounding the app. Targeted
`computer-use-type-text` accepts `element_index`, `replace`, and `submit`,
verifies editable focus internally, and stops if focus is lost. Background
keyboard targeting does not raise the window; physical input still requires
foreground activation.

`computer-use-screenshot` remains available for explicit window or full-screen
capture. Window scope requires an explicit `window_id` from the current helper
session; screen scope captures the main or explicitly selected display,
including the menu bar. Screenshot results state the captured region's
absolute macOS logical bounds, image scale factor, and pixel-to-screen
conversion next to the image.
Coordinate actions always use absolute logical screen points from the top-left
of the main display; they never use window-relative positions or screenshot
pixels. Displays left of or above the main display can have negative origins.
Screenshot capture is gated by the helper's separately reported Screen
Recording trust, surfaced in General -> System permissions.

`computer-use-click` uses Accessibility `AXPress` by default. Agents may set
`physical: true` for a visible Electron/web control known to require actual
mouse input, or after an `AXPress` reports success but refreshed state shows no
change. Physical clicks require the target app to remain frontmost and the
target position to remain unobstructed.

Indexed actions validate the latest observation and target app PID, returning
`stale_element` rather than redirecting an obsolete index. Click and dismiss
also accept semantic AX selectors (`role`, `title`, `description`, `value`,
`subrole`, and optional occurrence) for dialogs and menus. Right and middle
clicks use physical mouse events. `accessibilityScope: "menu_bar"` lets agents
inspect and activate native application menus through AX without moving the
user's pointer. After using a native menu, `computer-use-dismiss` applies its
AX cancel action before the agent continues typing or acting in the app.

Keyboard operations (`press-key`, `type-text`, and `paste`) select and verify
the explicit window before posting to its app process; selection may raise the
window. `set-value` handles
ordinary settable AX controls; `select-text` provides exact UTF-16-safe text or
cursor placement with optional context. `perform-secondary-action` invokes
only actions advertised by the latest observed element. Physical clicks and
`drag` require the target app to remain frontmost and unobstructed. Computer
Use intentionally exposes no mouse-move/hover action.

The helper reports its own Accessibility trust. Agents must check status or
request permission before inspection/actions and refresh app state before
acting on an indexed element. Normal MCP approval applies to each call.

Electron keeps one helper process alive for the Computer Use session so stable
window IDs, element IDs, and per-window diff baselines stay valid. The native virtual cursor keeps its
existing show trigger, then remains visible for that session. Every Computer
Use call, including a screenshot, resets the 30-second inactivity timeout.
Screenshots temporarily hide the cursor while capturing and restore it
afterward. `computer-use-stop` closes the session immediately; inactivity
closes it automatically, so the next interaction must begin with a fresh app
observation.

For Claude, `clawd` passes the same request-scoped agent URL through the Claude
CLI instead of mutating global Claude Code config:

```bash
claude -p "<prompt>" \
  --mcp-config '{"mcpServers":{"codex_claw":{"type":"http","url":"http://127.0.0.1:<port>/mcp?agentId=<agent-id>"}}}' \
  --allowed-tools 'mcp__codex_claw__*' \
  --append-system-prompt "<Codex Claw developer instructions>"
```

The `--allowed-tools` pattern authorizes only tools from the `codex_claw` MCP
server. Connected hosted servers are added to `mcpServers`, but are not added to
that allowlist, so their normal permission flow remains intact.

`clawd` also adds developer instructions that give the backend agent its Claw
agent ID/name/folder and advertise the product workflows models do not reliably
discover from schemas alone. The instructions distinguish engine-native
subagents, which remain inside the current Codex or Claude Code session, from
Claw co-agents, which are separate team agents created with `create-agent`.
Explicit subagent and co-agent requests use the corresponding mechanism;
ambiguous requests to delegate, parallelize, or use another agent require a
clarifying question. The same instructions cover `display-markdown`, meaningful
celebrations, status, and teammate messaging. Agents do not need to register or
pass their own agent ID to tools.

For another backend, keep the tool semantics below unchanged and implement the
smallest equivalent enablement path for that backend.

## Tools

Collaboration tool names are app-owned, and caller identity is inferred from
the backend session.

See [Custom MCP Tools](custom-tools.md) for the implementation path, structured
results, agent status updates, tool-row lifecycle presentation, and required
tests.

### `list-agents`

Lists visible agents for the caller.

Input: none.

Visibility is team-scoped. Agents with a `teamId` see agents in the same team.
Agents without a team see other no-team agents.

Output uses unique agent IDs, display names, folders, and status. An agent name
is an optional custom label; when it is absent, model-facing output uses the
same branch-or-folder fallback as the product UI instead of rendering `null`.
If several visible agents share the same display name, `send-message` uses the
agent ID as the disambiguator.

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

### `toggle_thread_flag`

Sets or clears predefined, typed state for the caller's current conversation.

Input:

- `id`: an allowlisted flag identifier;
- `value`: `true` to set the flag or `false` to clear it;
- `payload`: optional kind-specific data, accepted only when that flag's
  contract defines a payload.

The first supported flag is `delegate_to_worktree`. It takes no payload. Claw
renders it as a compact **Delegate to worktree** action in the composer shelf.
Activating that affordance submits an app-owned prompt to the current agent to
delegate the implementation through the existing worktree/co-agent workflow.
The flag clears only after the prompt is accepted; a failed submission leaves
it available for retry. The user can also dismiss it, and the agent can clear
it by calling `toggle_thread_flag` with `value: false`.

Flags are persisted app state and are cleared with the agent's conversation
runtime when that conversation is restarted or replaced. Clients may present,
ignore, or programmatically respond to them without interpreting provider
transcripts.

### `celebrate`

Requests a transient visual celebration in the Claw renderer after a
meaningful user-visible accomplishment.

Input:

- `kind`: optional `confetti`, `stars`, `shapes`, or `schoolPride`; defaults to
  `confetti`.

When celebrations are enabled, developer instructions require one celebration
before the final response for releases, hard fixes, major features, migrations,
and other meaningful wins. Disabled celebrations are not advertised to the
model.
Agents choose the effect deliberately and vary it from the most recent visible
celebration; `schoolPride` is reserved for major product or team milestones.
The request emits `client.celebrationRequested`; it is not stored in conversation
history or app state. Users can disable agent celebrations in General settings.
The setting is enabled by default, and `clawd` suppresses the event when it is
off.

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

### `create-agent`

Creates a Claw co-agent in the caller's team without selecting it. The tool can
also create an isolated worktree and start the co-agent with initial
instructions as one backend-owned operation. It is distinct from the native
subagent mechanism owned by Codex or Claude Code.

Input:

- `repoPath`: repository or existing worktree folder;
- `createWorktree`: optionally create an isolated worktree from `repoPath`;
- `branchName`: required when creating a worktree;
- `destinationPath`: optional worktree destination;
- `backend` and `name`: optional agent configuration;
- `prompt`: optional self-contained initial instructions. The tool stays
  pending until the new agent accepts this prompt.

`clawd` emits transient `agentCreation.progress` events around worktree
creation, agent creation, and initial-prompt handoff. The renderer shows the
staged preparation dialog only when the calling agent is still active, so
background delegation never interrupts an unrelated conversation.

Agents created by this tool retain their delegating agent relationship. Their
pull-request and merge dialogs can optionally request a whole-task handoff from
the worker and deliver it back to that agent after the Git operation succeeds.

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

- emits `client.markdownDisplayRequested`;
- renderer opens the Markdown side panel for the active agent;
- returns a structured success result with the displayed title and path when
  available.

### `update-work-item`

Updates the local lifecycle of one of the caller's assigned backlog work items.

Input:

- `workItemId`: exact Work item ID from the assignment prompt, such as
  `github:owner/repo#123`.
- `status`: `inProgress`, `blocked`, `readyForReview`, or `completed`.
- `note`: concise user-facing context. It is required for `blocked` so the user
  knows what help or input is needed.

Effects:

- verifies that the work item is currently assigned to the caller;
- updates `workBacklog.assignments[workItemId]` with the requested status,
  timestamp, and optional note;
- completes the owning automation execution after all of its assignments finish,
  while preserving the created agents and worktrees for review;
- emits `workItem.assignmentUpdated` so the cockpit backlog reflects the
  lifecycle state;
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
- typed thread flags live durably on the app-owned agent snapshot;
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
- Keep provider access and refresh tokens in the backend token store. Never put
  them in harness configuration, query parameters, app snapshots, renderer
  contracts, tool results, or logs.
- Replace, rather than forward, any client-supplied `Authorization` header at
  the hosted MCP boundary.
- Do not expose filesystem, worktree, panel, or process-control tools until
  Claw owns those product capabilities. `display-markdown` is allowed because
  Claw now owns a constrained Markdown side panel and agent-folder-limited file
  preview path.
- Advertise only tools backed by real Claw product capabilities.
- Do not let renderer code call MCP directly.
- Prefer request-local backend configuration over global user config mutation.

## Testing

Cover MCP behavior at three layers:

- coordinator contract tests for session connection, visibility, messaging,
  broadcasts, status, and errors;
- Streamable HTTP MCP round-trip tests for tool listing and tool calls;
- hosted gateway tests for header filtering, provider credential injection,
  upstream session forwarding, and one-time refresh/retry after `401`;
- backend session tests proving the MCP server URL and developer instructions
  are injected into backend session startup.

When adding a tool, add coordinator tests first, then HTTP tool-call coverage,
then any backend enablement tests needed to prove agents can see it.

## Future Tools

Potential tools are intentionally not exposed yet:

- repo/worktree operations;
- create/close agent;
- markdown or artifact panel display;
- mermaid rendering;
- file or git actions.

Add them only when Claw has the matching product capability and a tested
main-process implementation.
