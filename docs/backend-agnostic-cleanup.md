# Backend Agnostic Cleanup

Status: pre-Claude cleanup implemented, 2026-06-06.

This document describes the cleanup needed before adding a Claude Code driver.
The goal is not to turn Codex Claw into a generic lowest-common-denominator
provider app. The goal is narrower: keep Codex and Claude backend details inside
main-process drivers, while the renderer and persistence layer speak in
app-owned concepts.

Related docs:

- `docs/architecture.md`: target process boundaries and backend seam.
- `docs/codex.md`: current Codex app-server integration.
- `docs/claude.md`: Claude Code websocket/SDK research and Codex-bias
  inventory.

## Implementation Status

The pre-Claude cleanup in this document has been implemented for the existing
Codex path:

- Agents and Bench templates use `backend`, `backendSession`, and
  `backendDefaults`.
- Persisted snapshots no longer write new `codexThreadId` or `codexDefaults`
  fields; migration from old state is intentionally out of scope.
- Runtime status is stored as `backendRuntimes` and emitted as
  `backend.statusChanged`.
- Prompt sending, interrupts, request responses, history hydration, rollback,
  model loading, and skill loading route through a backend driver seam.
- Renderer catalogs, composer controls, and prompt options use backend-neutral
  names with Codex-specific options nested under `backendOptions`.

The Claude driver itself remains out of scope for this cleanup pass.

## Target Outcome

Before the Claude driver starts, the codebase should make these statements true:

- An agent has a selected backend and backend-specific session metadata.
- The renderer does not know whether a message came from Codex JSON-RPC or
  Claude SDK/control messages.
- Backend runtime status is not named `appServer`.
- Sending prompts, answering approvals, interrupting, and loading backend
  capabilities route through a backend-neutral main-process interface.
- Backend-specific actions such as steer, goal mode, rollback, edit, and retry
  are represented as backend capabilities instead of universal commands. Plan
  mode remains a universal product concept, but each backend declares whether
  it supports plan mode natively, through prompt shaping, or not at all.
- New Codex agents and Bench templates persist backend-neutral fields from the
  start.

## Non-Goals

- Do not make every UI component provider-aware.
- Do not expose Claude SDK message types to the renderer.
- Do not move process lifecycle, websocket handling, JSON-RPC ids, or SDK
  control envelopes out of Electron main.
- Do not block the Claude driver on full parity with Codex thread rollback,
  active-turn steering, skills, or goal mode.
- Do not hide product-specific features behind vague names when they are
  genuinely Codex-specific. Make them capability-gated instead.

## Naming Rules

Use these names consistently:

- `backend`: the provider/runtime family, initially `codex` or `claude`.
- `backendSession`: persisted backend-specific session identity for an agent.
- `backendDefaults`: persisted backend-specific defaults for an agent or Bench
  template.
- `backendRuntime`: process/transport health for a backend family.
- `capabilities`: feature flags exposed by a backend driver for an agent
  session.

Avoid using these names outside Codex-specific modules:

- `codexThreadId`
- `codexDefaults`
- `appServer`
- `CodexModelOption`
- `CodexSkillSummary`
- `CodexAgentSessionManager`

Those names can remain inside `src/main/codex/*` and Codex-specific tests.

## 1. Persisted Product Model

Current problem:

- `Agent.codexThreadId` is the only persisted session identity.
- `BenchTemplate.backend` can only be `'codex'`.
- `BenchTemplate.codexDefaults` cannot represent Claude defaults.

Target shape:

```ts
type AgentBackend = 'codex' | 'claude'

type BackendSession =
  | {
      kind: 'codex'
      threadId: string
    }
  | {
      kind: 'claude'
      sessionId: string
      transport: 'stdio' | 'websocket'
      transcriptSessionId?: string
      serverUrl?: string
    }

type BackendDefaults =
  | {
      kind: 'codex'
      model?: string
      approvalPolicy?: string
      sandboxMode?: string
      reasoningEffort?: string
    }
  | {
      kind: 'claude'
      model?: string
      permissionMode?: string
      thinking?: {
        type: 'enabled' | 'disabled'
        budgetTokens?: number
      }
    }
```

Recommended fields:

```ts
type Agent = {
  backend: AgentBackend
  backendSession?: BackendSession
  backendDefaults?: BackendDefaults
}

type BenchTemplate = {
  backend: AgentBackend
  backendDefaults?: BackendDefaults
}
```

Migration scope:

- Out of scope. Nicolas will clean up the local `state.json` manually.
- Do not add compatibility readers for `codexThreadId` or `codexDefaults`
  unless we later decide to support existing external installs.
- After this cleanup, new persisted data should write only `backend`,
  `backendSession`, and `backendDefaults`.
- Tests should cover the new persisted shape, not legacy migration.

Commit checkpoint:

- `feat: add backend session model`

## 2. Runtime Status

Current problem:

- `AppSnapshot.appServer` describes the Codex app-server, but the field lives
  in the app-wide snapshot and renderer as if every backend has an app-server.
- Events emit `appServer.statusChanged`.

Target shape:

```ts
type BackendRuntimeStatus = {
  backend: AgentBackend
  status: 'notConfigured' | 'starting' | 'running' | 'error'
  detail?: string
}

type AppSnapshot = {
  backendRuntimes: BackendRuntimeStatus[]
}
```

Renderer copy should use the active agent backend name only at the edge:

- `Codex starting...`
- `Claude starting...`
- `Backend error`

Event cleanup:

- Introduce `backend.statusChanged`.
- Keep `appServer.statusChanged` only as a compatibility bridge during the
  runtime-status rename, or update all reducers/tests in the same commit.

Commit checkpoint:

- `fix: rename backend runtime status`

## 3. Main-Process Backend Seam

Current problem:

- `AppController` owns a concrete `CodexAgentSessionManager`.
- `sendAgentPrompt()` accepts `CodexAgentSessionManager` directly.
- Prompt, interrupt, approval response, history hydrate, retry, edit, delete,
  and rollback are wired to Codex semantics from app-level services.

Target interface:

```ts
type AgentBackendDriver = {
  readonly backend: AgentBackend
  getRuntimeStatus(): BackendRuntimeStatus
  getCapabilities(agent: Agent): BackendCapabilities
  startOrResumeSession(agent: Agent): Promise<BackendSession>
  sendPrompt(agent: Agent, prompt: string, options?: BackendPromptOptions): Promise<BackendSendResult>
  interrupt(agent: Agent): Promise<void>
  respondToRequest(response: ClientRequestResponse): Promise<void>
  loadHistory?(agent: Agent): Promise<RendererMessage[]>
  steerPrompt?(agent: Agent, prompt: string): Promise<void>
  deleteMessage?(agent: Agent, messageId: string): Promise<void>
  editMessage?(agent: Agent, messageId: string, prompt: string): Promise<void>
  retryMessage?(agent: Agent, messageId: string): Promise<void>
  listModels?(agent: Agent): Promise<BackendModelOption[]>
  listSkills?(agent: Agent): Promise<BackendSkillSummary[]>
  onEvent(listener: (event: BackendEvent) => void): () => void
}
```

The first implementation should wrap the existing Codex manager without
changing behavior. That keeps this cleanup honest: same UI, same Codex
features, different ownership boundary.

Module direction:

```text
src/main/backends/
  types.ts
  registry.ts
  capability-service.ts

src/main/codex/
  codex-driver.ts
  agent-session.ts
  rpc-client.ts
  process-transport.ts

src/main/claude/
  claude-driver.ts
  sdk-message-adapter.ts
  process-transport.ts
  websocket-transport.ts
```

Commit checkpoint:

- `feat: introduce agent backend driver seam`

## 4. Backend Capabilities

Current problem:

- Renderer assumes every backend supports Codex model reasoning, skills, goal
  mode, steering, rollback, edit, retry, and thread history. Plan mode needs a
  subtler shape: it is a universal workflow, but backend support varies.

Target shape:

```ts
type BackendCapabilities = {
  models: boolean
  skills: boolean
  reasoningEffort: boolean
  thinkingBudget: boolean
  planMode: 'native' | 'prompted' | 'unsupported'
  goalMode: boolean
  steerPrompt: boolean
  interrupt: boolean
  history: boolean
  rollback: boolean
  editMessage: boolean
  retryMessage: boolean
  approvals: boolean
}
```

Renderer behavior:

- Hide unavailable controls instead of rendering disabled controls that imply
  support is coming during the current session.
- Keep Codex-only controls visible for Codex agents.
- Start Claude with prompt, interrupt, approvals, status, and message rendering.

Important distinction:

- `planMode` is a universal product feature with backend-specific execution.
- `goalMode` is Codex-specific until another backend proves an equivalent
  durable mechanism.
- Claude thinking budget is not Codex reasoning effort.
- Claude permission persistence is not automatically the same as Codex
  `allow_conversation` and `always_allow`.

Commit checkpoint:

- `feat: gate composer actions by backend capabilities`

## 5. Prompt Options

Current problem:

- `SendPromptOptions` mixes app prompt options with Codex-specific options.

Target shape:

```ts
type SendPromptOptions = {
  model?: string | null
  planMode?: boolean
  backendOptions?: BackendPromptOptions
}

type BackendPromptOptions =
  | {
      kind: 'codex'
      goalMode?: boolean
      reasoningEffort?: string | null
      skills?: PromptSkillInput[]
    }
  | {
      kind: 'claude'
      thinkingBudgetTokens?: number | null
      permissionMode?: string | null
    }
```

Short-term compatibility option:

- Keep the old flat fields while adding `backendOptions`.
- Normalize at the IPC boundary.
- Delete the flat fields after the renderer is updated.

Commit checkpoint:

- `fix: isolate backend prompt options`

## 6. Models, Skills, And Composer Controls

Current problem:

- `listCodexModels()` and `listCodexSkills()` are exposed on
  `CodexClawApi`.
- `ChatModelReasoningSelector` assumes Codex model catalog shape.
- `ChatComposerSkillMenu` assumes `CodexSkillSummary`.

Target API:

```ts
type CodexClawApi = {
  listBackendModels(agentId: string): Promise<BackendModelOption[]>
  listBackendSkills(agentId: string): Promise<BackendSkillSummary[]>
}
```

Target model shape:

```ts
type BackendModelOption = {
  id: string
  displayName: string
  description?: string
  isDefault?: boolean
  capabilities?: BackendCapabilities
  providerMetadata?: Record<string, unknown>
}
```

Target skill shape:

```ts
type BackendSkillSummary = {
  id: string
  name: string
  displayName?: string
  description?: string
  enabled: boolean
  providerMetadata?: Record<string, unknown>
}
```

Renderer cleanup:

- Split model selection from reasoning/thinking controls.
- Make reasoning/thinking controls capability-driven.
- For Claude milestone one, the skill menu can be hidden until the driver can
  provide a real list.

Commit checkpoint:

- `feat: generalize backend model controls`

## 7. Requests And Approvals

Current problem:

- The UI request shape is already mostly app-owned, but the response path is
  handled by the Codex manager.
- `ToolConfirmationDecision` names map well to Codex. Claude may need a
  different persistence mapping.

Target behavior:

- `ClientRequest` remains app-owned.
- Every pending request records the owning `backend`, `agentId`, and provider
  request id.
- `respondToClientRequest()` routes through the active backend driver or a
  request registry instead of assuming Codex.

Claude mapping:

- `control_request/can_use_tool` -> `ClientRequest.kind = 'confirm_tool'`.
- allow once -> Claude `behavior: 'allow'`.
- deny -> Claude `behavior: 'deny'`.
- persistence choices stay disabled or downgraded until we verify Claude's
  `updatedPermissions` behavior in the runtime path we choose.

Commit checkpoint:

- `fix: route approvals through backend registry`

## 8. Thread, Turn, And Session Language

Current problem:

- IPC events and reducers use `thread.*` for app-level lifecycle events.
- Codex has thread ids and turn ids. Claude has sessions, SDK messages, and
  result events. Some concepts overlap, some do not.

Recommended cleanup:

- Keep `turn.started`, `turn.completed`, `message.delta`, `item.*`,
  `approval.requested`, and `context.compactionStarted`; those are app-owned
  enough.
- Replace new uses of `threadId` in app-owned code with `backendSessionId` or
  `sessionId`.
- Avoid adding new `thread.*` events for Claude.
- Consider introducing `session.started`, `session.historyLoaded`, and
  `session.settingsUpdated` when touching the current `thread.*` reducers.

Compatibility:

- Existing Codex `thread.started` can continue until the backend seam is in
  place.
- The Claude driver should emit `session.started` or app-owned `agent.updated`
  rather than pretending it started a Codex thread.

Commit checkpoint:

- `fix: separate session events from codex threads`

## 9. Message Contract

Current state:

- `RendererMessage` and `RendererMessagePart` are close to the right app-owned
  contract.
- Tool parts already have generic kinds and metadata.
- Some ids and rollback helpers infer Codex turn ids from message ids.

Cleanup:

- Ensure message ids are app-generated or provider-adapter-generated opaque ids.
- Stop encoding Codex turn ids into ids that renderer logic later parses.
- Put provider ids under metadata, for example:

```ts
metadata: {
  backend: 'codex',
  providerMessageId: '...',
  providerTurnId: '...'
}
```

Claude adapter requirements:

- Preserve ordered text, thinking, and tool-use placement.
- Map SDK `tool_progress` to `item.updated`.
- Map SDK `user` tool-result blocks to matching tool part output.
- Emit unknown message types as summarized system/status parts only when useful.

Commit checkpoint:

- `fix: make renderer message ids provider opaque`

## 10. MCP Enablement

Current problem:

- MCP enablement is implemented as Codex command-line config overrides.
- Docs already say backend enablement should be backend-specific, but code only
  has Codex.

Target:

- Keep the Claw MCP server app-owned.
- Move backend enablement behind driver-specific startup/session config.

Codex:

- Continue using app-server config overrides.

Claude:

- Prefer temporary/session-local MCP config when launching process stream-json.
- For direct-connect websocket, verify whether `/sessions` or `initialize`
  supports session-local MCP config before relying on dynamic
  `mcp_set_servers`.
- Do not mutate global Claude config as part of normal Claw startup.

Commit checkpoint:

- `fix: isolate mcp enablement by backend`

## 11. Tests And Fixtures

Required tests before Claude driver:

- Creating a Codex agent still writes `backend: 'codex'` and Codex defaults.
- Saving to Bench and deploying from Bench preserves backend/defaults.
- `sendPrompt()` routes through a fake backend driver.
- `respondToClientRequest()` routes by request owner/backend.
- Runtime status reducer handles `backend.statusChanged`.
- Composer hides unsupported capability controls.
- Codex model/skill listing still works through generic APIs.

Required tests when Claude driver starts:

- Captured Claude SDK assistant/result fixtures map to `RendererMessage`.
- Captured `control_request/can_use_tool` maps to `ClientRequest`.
- Approval allow/deny produces correct Claude `control_response`.
- Interrupt produces the correct Claude control request or process signal for
  the chosen transport.
- Unknown SDK messages are logged/ignored without crashing.
- Unknown blocking control requests receive an error response.

Test strategy:

- Keep Codex driver tests around existing Codex fixtures.
- Add Claude fixtures before adding UI surface area.
- Prefer main-process unit tests and component tests over broad desktop gates
  while iterating.
- Run `git diff --check` for every cleanup commit.

Commit checkpoint:

- `test: cover backend-neutral session routing`

## 12. Recommended Implementation Order

1. Add backend/session/defaults types and update persistence to write the new
   shape.
2. Rename app runtime status from `appServer` to backend runtime status.
3. Introduce `AgentBackendDriver` and wrap the existing Codex manager.
4. Route prompt send, interrupt, and approval response through the driver
   registry.
5. Convert model and skill loading to generic backend APIs.
6. Add backend capabilities and hide unsupported renderer controls.
7. Move backend-specific actions behind optional driver methods.
8. Stop parsing Codex turn ids from renderer message ids.
9. Add Claude SDK/control fixtures and adapter tests.
10. Implement the first Claude transport.

This order keeps Codex working after each step and gives us clean rollback
points.

## Acceptance Criteria Before Claude Driver

We are ready to start the Claude driver when:

- Existing Codex conversations still start, stream, approve tools, interrupt,
  and persist thread ids.
- The persisted snapshot no longer writes `codexThreadId` or `codexDefaults`
  for new data.
- The active runtime status is backend-named, not app-server-named.
- The renderer can render a conversation without importing Codex-specific
  shared types.
- Composer controls are driven by backend capabilities.
- Unsupported actions are hidden or return a clear unsupported error from main.
- `respondToClientRequest()` no longer assumes Codex.
- Focused tests cover the new persistence shape, routing, capabilities, and
  Codex parity.

## Current Decisions

- Bench templates specify `backend`; deploying from Bench creates an agent for
  that backend.
- Agent backend is immutable after creation for now. Switching backend should
  be modeled as duplicate/convert later, not mutation of a live session.
- New generic lifecycle code should use `session.*`. Existing Codex
  `thread.*` events can remain until touched, but Claude should not emit fake
  Codex thread events.
- Claude should start with process `stream-json`, even if direct-connect
  websocket is available, so the first driver proves the adapter, approvals,
  interrupt, and native rendering before transport complexity.
- Claude thinking controls are hidden for milestone one. Use model defaults
  until we verify runtime behavior.
- Plan mode remains in the universal composer surface, but backend support is
  capability-driven: `native`, `prompted`, or `unsupported`.
- Goal mode is Codex-specific for now and should live in Codex/backend options
  rather than the universal composer surface.
