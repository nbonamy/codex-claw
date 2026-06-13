# Codex Claw Architecture

Status: updated for backend driver capability seam, 2026-06-11.

Codex Claw is an Electron app that merges the team/agent product model from
Skwad with the native chat and artifact rendering already built in id8. The app
implements Codex through Codex app-server and Claude through the local Claude
Code CLI stream-json surface behind a backend-aware main-process seam. It does not launch a
terminal emulator as the primary user experience; main-process backend drivers
own protocol/process communication and the renderer displays app-owned events.

## Goals

- Ship a native desktop app shell with Skwad-like teams and agents.
- Use `docs/codex.png` as a concrete visual reference for the native shell:
  left team/agent navigation, central conversation, and right-side
  document/artifact panes.
- Treat Bench as a first-class product primitive: saved agent templates that
  can be deployed into a team quickly.
- Keep Codex as the primary implemented backend for the current product. Do not carry
  Skwad's full multi-provider abstraction forward, but keep the narrow backend
  seam so coding backends such as Claude can be added without rewriting the UI.
- Use the Codex app-server protocol as the long-term integration boundary.
- Keep all app-server communication in Electron main. Renderer code never owns
  Codex process lifecycle, JSON-RPC request IDs, approval callbacks, or auth.
- Keep native helper execution in Electron main as well. For example, composer
  voice dictation records browser audio in the renderer, sends audio bytes
  through typed IPC, and lets main invoke the Apple speech helper.
- Reuse id8 renderer primitives for messages, streaming text, tool calls,
  approvals, markdown, mermaid, media, and diffs.
- Build theme support from day one with semantic tokens, not hardcoded colors.
- Keep milestones demoable: product state is teams plus agents, while backend
  drivers own session/thread details and renderer UI stays app-owned.

## Tech Stack

- Electron desktop app.
- Electron Forge for packaging and desktop build orchestration.
- TypeScript across main, preload, renderer, and shared contracts.
- Vue 3 with TypeScript for the renderer.
- Element Plus for base UI components, matching id8.
- Vitest for unit and integration-style tests.

## Product Model

Skwad calls the top-level grouping a workspace. Codex Claw should use "team" in
the product language unless we decide otherwise during UX review.

Core persisted entities:

```ts
type Team = {
  id: string
  name: string
  avatar?: string
  color?: string
  agentIds: string[]
  activeAgentId?: string
}

type Agent = {
  id: string
  teamId: string
  name: string
  avatar?: string
  folder: string
  backend: "codex" | "claude"
  backendSession?: BackendSession
  backendDefaults?: BackendDefaults
  status: AgentStatus
  createdAt: string
  updatedAt: string
}

type BenchTemplate = {
  id: string
  name: string
  avatar?: string
  folder: string
  backend: "codex" | "claude"
  backendDefaults?: BackendDefaults
  createdAt: string
  updatedAt: string
}

type BackendSession =
  | { kind: "codex"; threadId: string }
  | {
      kind: "claude"
      sessionId: string
      transport: "stdio" | "websocket"
      transcriptSessionId?: string
      serverUrl?: string
    }

type AgentStatus =
  | { type: "idle" }
  | { type: "starting" }
  | { type: "working"; detail?: string }
  | { type: "awaitingInput"; detail?: string }
  | { type: "error"; message: string }
```

Codex app-server owns the conversation transcript and thread history in
`CODEX_HOME`. Codex Claw owns only product state: teams, agents, selected
folders, the global source folder, Bench templates, view preferences, theme
preference, and backend session metadata such as the Codex thread id.

Bench templates are reusable saved agents, not active sessions. Saving an agent
to Bench captures the deployable shape: name, avatar, folder, backend, and
backend defaults. Deploying from Bench creates a new active agent in the current
team. Initially we can match Skwad and dedupe/update Bench entries by folder;
later we may allow multiple templates for the same folder if the product needs
different roles or model defaults.

On a fresh install, create a default team when no teams exist. Do not create a
default agent automatically; an empty team shows the New Agent empty state.

## Source Folder And Repo Discovery

The source folder is a global convenience setting borrowed from Skwad. It is
not team membership, it is not an agent backend setting, and it does not replace
the explicit folder stored on each agent. Instead, it gives the app and Claw MCP
tools a common place to discover local source repositories when creating agents
or worktrees.

Codex Claw persists the selected source folder path, whether initial detection
has already run, and up to five recent repository names. On a fresh app state,
main may initialize the source folder once from common source-code locations.
After the user clears or changes the folder, the app respects that explicit
choice and does not keep auto-detecting behind their back.

Repository discovery is read-only and shallow. Electron main scans only direct
children of the configured source folder; a child with a `.git` directory is a
clone, and a child with a `.git` file pointing into a parent repo worktree is a
worktree. Worktrees are grouped under their parent clone when that clone is
also present under the source folder. Orphan worktrees are ignored. Discovery
does not run `git` and must tolerate missing, unreadable, detached, or malformed
git metadata.

Creating a worktree is the one source-folder git write. It is an explicit
main-process operation that runs `git worktree add -b <branch> <destination>`
for the selected repository, then refreshes discovery. Renderer code and MCP
tools request this through typed app APIs; they never scan arbitrary folders or
spawn git directly.

The renderer uses source repositories only as creation affordances: Settings
chooses or clears the source folder, the agent dialog can pick a discovered
repo/worktree or browse another folder, and new worktree creation can feed back
into agent creation. The Claw MCP server exposes the same app-owned operations
with `list-repos`, `list-worktrees`, `create-worktree`, and `create-agent`.

## Process Architecture

The current implementation keeps the app backend core inside Electron main. A
future extraction to a separate `clawd` process is documented in
`docs/backend-architecture.md`; until that lands, this section describes the
active architecture.

```mermaid
flowchart LR
  Renderer["Renderer: Vue UI"]
  Preload["Preload: typed bridge"]
  Main["Electron main"]
  Store["App store in userData"]
  Server["Codex app-server"]
  CodexHome["CODEX_HOME sessions/config"]

  Renderer <--> Preload
  Preload <--> Main
  Main <--> Store
  Main <--> Server
  Server <--> CodexHome
```

### Main Process

The main process is the backend of the desktop app.

Modules:

- `AppServerManager`: resolves the Codex executable, starts or connects to
  app-server, performs initialization, monitors readiness, restarts with
  backoff, and exposes server health.
- `CodexRpcClient`: owns the app-server JSON-RPC transport, request IDs,
  request/response matching, notifications, server-initiated requests, and
  backpressure.
- `CodexAgentSessionManager`: maps app agents to Codex threads and active turns.
  It starts/resumes/forks threads, starts turns, steers active turns,
  interrupts turns, and routes events back to the right agent.
- `AgentBackendDriver`: backend-facing interface used by app-level chat and
  controller services. The first concrete driver wraps
  `CodexAgentSessionManager`; future drivers can wrap Claude Code or another
  agent without changing renderer IPC.
- `CodexEventAdapter`: converts app-server notifications into the smaller
  renderer event protocol. This is where app-server churn is contained.
- `ApprovalCoordinator`: stores pending approval and user-input requests from
  app-server, emits UI prompts, and resolves/rejects server requests when the
  renderer answers. In the current implementation this coordination is owned by
  backend session/controller code rather than a standalone module.
- `AppStateStore`: persists teams, agents, settings, window state, and theme
  preference under Electron `userData`.
- `BenchManager`: creates, updates, removes, sorts, validates, and deploys
  Bench templates. It is product state, so it belongs with the app store rather
  than inside the Codex backend driver.

Preferred first transport: spawn one app-server process from main using
`codex app-server --stdio` or `codex app-server --listen stdio://`. A single
app-server process can host many threads; agents are routed by `threadId`.

Future transport options:

- connect to a managed daemon via the Unix control socket and
  `codex app-server proxy`;
- bundle a known Codex binary in the app resources;
- use a user-installed Codex binary resolved from config, environment, or PATH.

### Backend Seam

Codex Claw should not pretend to be provider-agnostic on day one. The product
is Codex-native and should expose Codex semantics where they matter: app-server
threads, turns, steering, approvals, diffs, and persisted Codex sessions.

The important constraint is that renderer and IPC should be backend-shaped by
our app, not by Codex. Keep one narrow main-process interface:

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
  respondToRequest(response: ClientRequestResponse): Promise<void>
  hydrateAgent?(agent: Agent): Promise<BackendSession | null>
  listConversations?(agent: Agent): Promise<ConversationSummary[]>
  resumeConversation?(agent: Agent, ref: BackendConversationRef): Promise<BackendConversationResumeResult>
  readConversationMessages?(ref: BackendConversationRef, agentId: string): Promise<RendererMessage[]>
  steerPrompt?(agent: Agent, prompt: string): Promise<BackendSendResult>
  rollbackToTurn?(agent: Agent, turnId: string): Promise<BackendRollbackResult>
  listModels?(agent: Agent): Promise<BackendModelOption[]>
  listSkills?(agent: Agent): Promise<BackendSkillSummary[]>
  onEvent(listener: (event: BackendEvent) => void): () => void
  close(): Promise<void>
}
```

For the first implementation, `BackendEvent` is produced by the Codex
app-server adapter. If Claude Code becomes a supported backend later, it gets
its own driver and adapter that emit the same app-owned `BackendEvent` shape.
That is the seam we want; a generic lowest-common-denominator provider model is
not.

#### Backend Feature Rule

Backend-dependent features must be added through the app seam, not directly in
renderer UI. The required path is:

1. Define an app-owned shared contract that describes product behavior rather
   than provider protocol. Examples include `RendererMessage`,
   `ConversationSummary`, `BackendConversationRef`, `BackendModelOption`, and
   `BackendSkillSummary`.
2. Add or extend an optional `AgentBackendDriver` method or declared backend
   capability in Electron main. Optional methods are the parity boundary when
   Codex and Claude do not support the same feature yet.
3. Keep provider details inside concrete driver/adapter code such as
   `src/main/codex/*` or `src/main/claude/*`.
4. Route renderer requests through app controller/preload IPC using app-owned
   contracts. Renderer components may branch on app capabilities or empty data,
   but must not import Codex/Claude protocol types or know where a backend
   stores history.
5. Test the seam: fake backend-driver routing in controller tests, concrete
   provider adapter/session tests for protocol behavior, and renderer component
   tests against app-owned data.

Conversation history is the canonical example. The sidebar renders
`ConversationSummary` rows and sends a `BackendConversationRef` to main. Codex
implements that with `thread/list` and `thread/resume`; Claude implements it by
scanning local JSONL transcripts and resuming a session id. The renderer does
not know either storage model.

### Preload

The preload script exposes a narrow typed bridge. It should be the only
renderer entrypoint to Electron APIs.

```ts
type CodexClawApi = {
  getSnapshot(): Promise<AppSnapshot>
  listBackendModels(agentId: string): Promise<BackendModelOption[]>
  listBackendSkills(agentId: string): Promise<BackendSkillSummary[]>
  listAgentFiles(agentId: string): Promise<AgentFileSearchItem[]>
  chooseAgentFolder(): Promise<string | null>
  createTeam(input: CreateTeamInput): Promise<AppSnapshot>
  updateTeam(input: UpdateTeamInput): Promise<AppSnapshot>
  closeTeam(teamId: string): Promise<AppSnapshot>
  selectTeam(teamId: string): Promise<AppSnapshot>
  createAgent(input: CreateAgentInput): Promise<AppSnapshot>
  updateAgent(input: UpdateAgentInput): Promise<AppSnapshot>
  listAgentConversations(agentId: string): Promise<ConversationSummary[]>
  resumeAgentConversation(agentId: string, ref: BackendConversationRef): Promise<AppSnapshot>
  duplicateAgent(agentId: string): Promise<AppSnapshot>
  moveAgentToTeam(input: MoveAgentToTeamInput): Promise<AppSnapshot>
  saveAgentToBench(agentId: string): Promise<AppSnapshot>
  deployBenchTemplate(templateId: string, teamId?: string): Promise<AppSnapshot>
  removeBenchTemplate(templateId: string): Promise<AppSnapshot>
  restartAgent(agentId: string): Promise<AppSnapshot>
  closeAgent(agentId: string): Promise<AppSnapshot>
  selectAgent(agentId: string): Promise<AppSnapshot>
  selectAgentFolder(agentId: string): Promise<AppSnapshot | null>
  updateSettings(input: UpdateSettingsInput): Promise<AppSnapshot>
  transcribeAppleSpeech(audioData: ArrayBuffer, options?: AppleSpeechTranscriptionOptions): Promise<AppleSpeechTranscriptionResult>
  quit(): Promise<void>
  sendPrompt(agentId: string, prompt: string, options?: SendPromptOptions): Promise<AppSnapshot>
  steerPrompt(agentId: string, prompt: string): Promise<AppSnapshot>
  interruptAgent(agentId: string): Promise<AppSnapshot>
  deleteMessage(agentId: string, messageId: string): Promise<AppSnapshot>
  editMessage(agentId: string, messageId: string, prompt: string): Promise<AppSnapshot>
  retryMessage(agentId: string, messageId: string): Promise<AppSnapshot>
  respondToClientRequest(response: ClientRequestResponse): Promise<AppSnapshot>
  onEvent(listener: (event: MainToRendererEvent) => void): () => void
  onAppCommand(listener: (command: AppCommand) => void): () => void
}
```

### Renderer

The renderer is a Vue app. It owns visual state and user interactions, not Codex
process state.

Renderer layers:

- app shell inspired by Skwad: team rail, agent list, agent header, status, and
  conversation area;
- native workspace panes inspired by `docs/codex.png`: the active conversation
  should be able to sit beside document, plan, read-only source, git diff, or
  file viewer tabs rather than forcing every artifact into the chat column;
- Bench surface for saved agent templates, starting as a New Agent menu section
  and eventually supporting faster deployment into any team;
- chat state store that reduces `MainToRendererEvent` into message/tool/diff
  state;
- id8-derived components for `MessageList`, `ChatMessage`, `ChatToolCall`,
  composer, markdown, mermaid, media, and diff summaries. These components are
  a rendering starting point, not a required data contract;
- git status and turn diff display consume runtime snapshot state. Repo git
  status is requested through the active `AgentBackendDriver` capability and is
  not persisted; turn diff state comes from app-owned backend events such as
  Codex `turn/diff/updated`;
- side-panel previews are read-only app artifacts. Markdown and source file
  links read through the main-process agent file bridge; source highlighting
  uses Shiki, while git diff previews parse unified diff data and render with
  Claw-owned Vue components;
- theme provider that applies semantic CSS custom properties to the document.

## IPC Contract

IPC should be app-domain events, not app-server messages. Every emitted event
gets a monotonically increasing sequence number so the renderer can detect gaps
after reloads.

```ts
type MainToRendererEvent = {
  seq: number
  agentId?: string
  backend?: AgentBackend
  backendSessionId?: string
  threadId?: string
  turnId?: string
  type:
    | "backend.statusChanged"
    | "agent.updated"
    | "agent.statusChanged"
    | "thread.started"
    | "thread.historyLoaded"
    | "thread.settingsUpdated"
    | "thread.modeUpdated"
    | "thread.goalUpdated"
    | "thread.goalCleared"
    | "thread.tokenUsageUpdated"
    | "turn.started"
    | "turn.planUpdated"
    | "turn.completed"
    | "message.steer"
    | "context.compactionStarted"
    | "account.rateLimitsUpdated"
    | "skills.changed"
    | "message.delta"
    | "item.started"
    | "item.updated"
    | "item.completed"
    | "diff.updated"
    | "approval.requested"
    | "toolInput.requested"
    | "error"
  payload: unknown
  occurredAt: string
}
```

The main process should keep a bounded per-window event buffer. On renderer
reload, `getSnapshot()` returns current app state plus enough recent events to
rebuild in-flight UI without losing a streamed message.

## Codex App-Server Integration

This section captures the architecture-level shape. Detailed working guidance
for Codex communication lives in `docs/codex.md`.

The app-server protocol is JSON-RPC-like but omits the `"jsonrpc":"2.0"` field
on the wire. It supports stdio JSONL, experimental websocket, Unix socket, and
off transports. Production should start with stdio because it is simple and
local.

Connection lifecycle:

1. Start app-server.
2. Send `initialize` with `clientInfo.name = "codex_claw"` and
   `capabilities.experimentalApi = true`.
3. Send `initialized`.
4. Call `thread/start` or `thread/resume` for the selected agent folder.
5. Call `turn/start` with `input: [{ type: "text", text, textElements: [] }]`.
6. Consume notifications and server requests until `turn/completed`.

Important app-server messages for the current native agent:

- Requests: `thread/start`, `thread/resume`, `thread/list`, `turn/start`,
  `turn/steer`, `turn/interrupt`.
- Notifications: `thread/started`, `thread/settings/updated`,
  `thread/status/changed`, `thread/tokenUsage/updated`, `turn/started`,
  `turn/plan/updated`, `turn/completed`, `item/started`, `item/completed`,
  `rawResponseItem/completed`, `item/agentMessage/delta`,
  `item/plan/delta`, `item/commandExecution/outputDelta`,
  `item/fileChange/patchUpdated`, `turn/diff/updated`,
  `account/rateLimits/updated`, and `skills/changed`.
- Server-initiated requests: `mcpServer/elicitation/request`,
  `item/tool/requestUserInput`, `item/commandExecution/requestApproval`,
  `item/fileChange/requestApproval`, and
  `item/permissions/requestApproval`.

The app-server can generate TypeScript protocol bindings with:

```sh
codex app-server generate-ts --out <dir>
```

Those generated types should live under a main-process protocol package, for
example `src/main/codex-protocol/generated`. Renderer code should depend on
our IPC event types instead.

## Agent Collaboration MCP

Codex Claw's MCP server is the app-owned collaboration protocol for agents.
It lives in Electron main, exposes Skwad-shaped communication tools, stores
runtime inbox state, and emits app-owned agent updates. Detailed behavior lives
in `docs/mcp.md`.

Backend drivers enable this server in backend-specific ways. Codex receives the
server through app-server command-line config overrides for
`mcp_servers.codex_claw`. During MCP elicitation development, the scoped
`default_tools_approval_mode = "approve"` override stays disabled so the
approval UI path is exercised; we expect to bring it back for normal Claw MCP
collaboration after that flow is proven. Future backends should keep the Claw
tool semantics and only change the backend-specific enablement path.

## SDK Decision

The TypeScript SDK is useful, but it is not the target integration boundary. It
wraps `codex exec --experimental-json`, spawns the CLI, and streams JSONL
events over stdin/stdout. That is a good spike tool and may help bootstrap a
throwaway single-agent demo quickly.

For Codex Claw proper, use app-server directly from the first implementation
phase if possible. The product needs app-server concepts the SDK does not fully
model: thread list/read/resume, active turn steering, approval routing, turn
diff updates, server-initiated requests, and future realtime/control surfaces.

If we temporarily use the SDK, it must sit behind the same
`AgentBackendDriver` interface as the app-server implementation so the renderer
and IPC contract do not change when it is removed.

## Event Adaptation

Codex Claw owns its renderer message model. The current id8 `Message` type came
from multi-llm-ts and is not a rigid contract for this app. We can reuse id8 UI
components, but we should freely reshape data where Codex-native semantics need
a better model.

The durable pattern is backend-specific translation into an app-owned message
model:

```ts
type RendererMessage = {
  id: string
  agentId: string
  kind?: "compaction" | "steer"
  role: "user" | "assistant" | "system"
  status: "streaming" | "complete" | "error"
  turnId?: string
  parts: RendererMessagePart[]
  createdAt: string
}

type RendererMessagePart =
  | { type: "text"; text: string; itemId?: string }
  | {
      type: "tool"
      id: string
      kind: "command" | "mcp" | "dynamic" | "fileChange" | "generic"
      title: string
      status: "running" | "completed" | "failed"
      statusText?: string
      body?: string
      input?: unknown
      output?: unknown
      metadata?: Record<string, unknown>
    }
  | { type: "status"; text: string }
```

For the first backend, the flow is Codex app-server event -> Codex adapter ->
`RendererMessage`. If we support Claude Code later, the flow should be Claude
event -> Claude adapter -> `RendererMessage`, with no renderer rewrite.

id8 chat rendering currently expects a compact stream shape:

- content chunks;
- reasoning chunks;
- tool chunks with `preparing | running | completed | canceled | error`;
- usage/error/done.

Codex app-server emits richer thread items. The adapter should map them into
Codex Claw's UI model first. Compatibility helpers for id8-derived components
are allowed, but they should sit at the edge and should not dictate the core
message schema.

Mapping sketch:

- `UserMessage` -> user `Message`
- `AgentMessageDelta` -> append assistant text to an in-flight assistant
  `Message`
- completed `AgentMessage` -> finalize assistant `Message`
- `CommandExecution` -> tool call named `command_execution`
- `CommandExecutionOutputDelta` -> append command output to the matching tool
  call result/output buffer
- `FileChange` and `FileChangePatchUpdated` -> file change tool item plus diff
  state
- `TurnDiffUpdated` -> aggregate diff panel/state for the turn and git diff
  side-panel preview
- `McpToolCall` and `DynamicToolCall` -> tool calls
- approval server requests -> pending UI prompts, not transcript items until
  answered
- `TurnCompleted` -> mark assistant streaming false and update usage/status

The adapter should preserve original app-server payloads in debug fields during
development, but renderer components should use normalized fields by default.

## Theming

Themes are a first-class architecture concern. Components should never import
fixed product colors directly.

Use a semantic token layer:

```ts
type ThemeDefinition = {
  id: string
  name: string
  appearance: "light" | "dark"
  colors: Record<ThemeToken, string>
  syntax?: unknown
}
```

The renderer applies a theme by writing CSS custom properties on
`document.documentElement`, for example:

- `--color-app-background`
- `--color-sidebar-background`
- `--color-panel-background`
- `--color-text`
- `--color-text-muted`
- `--color-border`
- `--color-accent`
- `--color-danger`
- `--color-success`
- `--diff-added`
- `--diff-removed`

id8 already uses CSS custom properties in `@id8/shared/styles/variables.css`;
Codex Claw should keep that pattern but rename tokens to app-owned names rather
than depending on id8 branding.

For VS Code themes, add an importer that maps `workbench.colorCustomizations`
and common VS Code color ids into our semantic tokens. Syntax highlighting and
diff code blocks should use the same theme source, likely through a generated
Shiki theme or equivalent syntax theme adapter.

## Persistence

Initial persistence can be a versioned JSON file under Electron `userData`.
Keep the schema explicit and migration-friendly:

```ts
type PersistedStateV1 = {
  version: 1
  teams: Team[]
  agents: Agent[]
  bench: BenchTemplate[]
  settings: AppSettings
}
```

Move to SQLite only when we need local queryable app state beyond what
app-server already persists. Conversation history should not be duplicated in
Codex Claw unless we need an app-specific cache for performance.

## Work Backlog Integrations

Work backlog providers are app-owned integrations, not agent backend features.
The renderer consumes provider-neutral `WorkRepository` and `WorkItem`
contracts and emits assignment intents. GitHub-specific OAuth, REST payloads,
and token handling stay in Electron main behind the work-integration manager.

Provider tokens must not be stored in the persisted app snapshot. The snapshot
can persist safe metadata such as connection status, account label, and
provider-specific backlog configuration. GitHub currently stores the selected
repository id and optional tag name as its backlog configuration. Secret
material belongs in the main-process token store, using Electron encrypted
storage when available.

GitHub uses OAuth device flow for the desktop app. It requires a public client
ID but no client secret or localhost callback route. The main process reads
`CODEX_CLAW_GITHUB_CLIENT_ID` from the environment as the default client ID,
and Settings can persist a per-provider client ID override. Actual GitHub
access tokens remain in the encrypted token store. Starting device flow only
returns the code to the renderer; opening GitHub is a separate user action so
the user can see and copy the code before the browser takes focus. The main
process owns that browser-open action and may append the user code to the
verification URL as a best-effort prefill. After the device flow starts, the
renderer polls the main-process completion endpoint on the provider interval
instead of requiring a manual "finish connection" step.

Dragging a work item onto an agent records provider-neutral assignment metadata
in `workBacklog.assignments`, keyed by provider and provider-generated item id,
then sends a deterministic prompt through the existing prompt path. Assignment
state is local and provider-neutral: newly assigned items are `working`, and
agents mark them `completed` through the `mark-work-item-completed` Claw MCP
tool using the exact work item id from that prompt. Loop-created assignments
also store loop origin metadata so loop completion instructions can be shown at
completion time without polluting the initial work context. Assigning the same
work item to another agent overwrites that key and resets it to `working`.
Assignment status belongs to the backlog record, so it is preserved even when
the stored agent id no longer exists; only the live assignee navigation/avatar
depends on the agent still being present. Resetting an assignment clears Codex
Claw's local assignment metadata and its local working/completed state.
Loops may also clean up their generated workspace after confirmed completion:
existing-team loops can delete the generated agent, while dedicated-team loops
can delete the generated team.
Future provider-specific actions, such as claiming tickets, commenting, or
changing status, should be added behind the work-provider seam without changing
cockpit tiles into provider-aware UI.

## Testing Strategy

- Unit-test `CodexRpcClient` with JSON-RPC fixtures and malformed responses.
- Unit-test `CodexEventAdapter` with captured app-server notifications.
- Unit-test renderer reducers using ordered event sequences, including reload
  snapshots and duplicate events.
- Contract-test main-process session flows against a fake app-server transport
  first.
- Add a real app-server smoke test gated behind an environment variable once
  the first agent works.
- Use Playwright screenshots for the app shell, message streaming, approvals,
  and theme switching.

## Current Product Boundary

Implemented product surfaces:

- Electron app boots to a native team/agent shell.
- Teams can be created, edited, selected, cycled, and closed.
- Agents can be created, edited, duplicated, moved between teams, saved to
  Bench, restarted, closed, and selected.
- Empty teams show a first-agent call to action instead of creating a default
  agent.
- Main process starts/connects to Codex app-server, creates or resumes Codex
  threads, hydrates history, sends prompts, steers active turns, and
  interrupts.
- Renderer displays ordered chat/tool parts, Markdown, links, diff stats,
  queued prompts, ask-user prompts, approvals, context usage, rate limits,
  file mentions, skills, plan/goal controls, and voice transcription controls.
- Settings can connect work backlog integrations, starting with GitHub OAuth.
- Cockpit can show connected repository issues and assign them to agents by
  drag and drop.
- Claw's local MCP server supports agent registration, status, listing,
  direct messages, broadcast, and inbox checks.

Still intentionally incomplete:

- Claude Code driver;
- worktree creation and companion agents;
- full VS Code theme import UI;
- full history browser;
- right-side artifact/file/git panes at the level shown in the long-term visual
  reference.

## Direction Set

- Use "team" as the product term.
- Bench is a first-class concept from Skwad: a global set of saved agent
  templates that can be deployed into teams. It should not be hidden as merely
  a create-agent shortcut.
- Codex bundling is undecided. The first implementation can launch an installed
  `codex` CLI, and the architecture keeps room for a bundled binary later.
- Current local access exists through `codex app-server`; a separate
  `codex-app-server` binary is not required for the first prototype.
- Prefer an isolated Codex identity for Codex Claw, potentially including a
  custom `CODEX_HOME`, so the app does not disturb normal Codex CLI/app data.
- Hard-copying id8 renderer code into this repo is acceptable for the initial
  build. Extraction can happen only after the shared surface is obvious.
- VS Code JSON theme import is the desired theme direction, but not a launch
  priority.

## Remaining Questions

- What is the exact Codex binary resolver order once packaging starts:
  bundled, configured path, managed install, then PATH?
- Should a custom `CODEX_HOME` be mandatory from day one, or only for packaged
  builds?
- Do we need a custom app-server session source in Codex itself, or is
  `clientInfo.name = "codex_claw"` plus custom `CODEX_HOME` enough for now?

## References Studied

- Skwad: `Skwad/Models/Agent.swift`, `Workspace.swift`,
  `AgentManager.swift`, `TerminalCommandBuilder.swift`,
  `TerminalSessionController.swift`, sidebar/dashboard views, and
  `CodexHookHandler.swift`.
- Visual reference: `docs/codex.png`, a hacked Codex desktop shell with
  team/agent navigation, central native chat, and right-side document panes.
- id8: Electron main/preload split, desktop settings patterns,
  `web/src/shared/chat/*`, chat stream/event types, and CSS token setup.
- Codex: `codex-rs/app-server/README.md`, app-server protocol types,
  app-server client transport, CLI app-server command wiring, and the
  TypeScript SDK README.
