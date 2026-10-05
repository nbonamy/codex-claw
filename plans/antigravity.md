# Antigravity Provider Integration

## Objective

Add **Google Antigravity** as a first-class coding agent backend in Korus
alongside OpenAI Codex and Claude Code. The integration uses a native TypeScript
stdio transport to drive the Antigravity CLI (`agy`) over bidirectional
`stream-json`, providing full parity with Korus features: multi-turn chat, live
streaming, reasoning blocks, tool approvals, Plan Mode, Goals, and team MCP
collaboration.

```text
Vue Renderer (Shared Conversation Pane)
       ↓ Typed Preload IPC
Electron Main (AppController)
       ↓ JSON-RPC
daemon Daemon
       ↓ AntigravityBackendDriver
AntigravityCliTransport (stdio stream-json)
       ↓
agy child process (cwd: agent workspace)
```

## Product Model & User Experience

1. **Provider Selection**:
   - Offer Antigravity alongside Codex and Claude in `BackendSelector` when enabled.
   - Available across New Agent, Worktree session, Project creation, Quick Chat,
     Missions, and Code Review.
   - Respect the pre-prompt backend switch on fresh, empty conversations.
2. **Composer & Settings**:
   - Model dropdown lists supported Gemini models (e.g. Gemini 2.5 Flash, Pro)
     and thinking budgets.
   - Expose Antigravity permission policies (`always-proceed`, `request-review`,
     `strict`) through capability-driven menus.
3. **Rich Conversation & Artifacts**:
   - Render Gemini reasoning / thinking deltas in collapsible thought cards.
   - Streamed tool calls (`run_command`, `write_to_file`, `replace_file_content`,
     `browser_subagent`) render as native Korus tool cards and authoritative file
     activity.
   - Turn-level approvals prompt the user with diffs and parameters before
     execution.
4. **Plan Mode & Goals**:
   - Plan Mode captures proposed markdown plans into Korus's native
     `ConversationPlanPanel`.
   - Thread goals (`/goal`) autonomously coordinate multi-step implementation
     until verification passes.
5. **Team Collaboration**:
   - Inject Korus's built-in MCP server (`workspace`) into Antigravity's
     configuration so Antigravity agents can collaborate with Codex and Claude
     teammates seamlessly.

## Architecture

### Process & Boundaries

- **Electron Main**: Remains the desktop adapter and IPC bridge; unaware of
  Antigravity protocol specifics.
- **daemon Daemon**: Owns the Antigravity child process lifecycle, stdio streams,
  session persistence, and event adaptation.
- **Renderer**: Consumes normalized app-owned `RendererMessage`s and conversation
  snapshots through the existing `CodexConversationPane` controller.

### Transport: Bidirectional `stream-json`

Instead of introducing third-party npm packages or a Python daemon, `daemon`
spawns `agy` in long-running streaming mode:

```bash
agy --input-format stream-json --output-format stream-json --conversation <sessionId>
```

- **Outbound**: User prompts, in-flight steering, and permission approval responses
  are written as NDJSON lines to `stdin`.
- **Inbound**: Incremental text tokens, reasoning deltas, tool call proposals,
  and completion events are read line-by-line from `stdout`.
- **Interrupt**: Handled cleanly via SIGINT or control cancel messages.
- **Resumption**: Reconnects to persisted sessions using `--conversation <id>`
  stored in `BackendSession`.

## Implementation Phases

### Phase 1: Shared Contracts & Settings (`core/`)

- [ ] Extend `AgentBackend` union with `'antigravity'` in `core/src/contracts/shared.ts`.
- [ ] Define Antigravity `BackendSession`:
  ```ts
  | {
      kind: 'antigravity';
      sessionId: string;
      model?: string;
      reasoningEffort?: ReasoningEffort;
    }
  ```
- [ ] Define Antigravity `BackendDefaults` (model, reasoning budget, permission mode).
- [ ] Update `core/src/agent-backends.ts` to include `antigravityEnabled` in settings
  and provider resolution.
- [ ] Add `antigravityEnabled` and optional binary override path to `AppGeneralSettings`.

### Phase 2: Antigravity CLI Transport (`backend/src/antigravity/transport.ts`)

- [ ] Implement `AntigravityCliTransport` managing child process lifecycle.
- [ ] Handle stdio NDJSON framing (buffering, line splitting, JSON validation).
- [ ] Implement robust error recovery on process exit or malformed output.
- [ ] Support runtime discovery for `agy` across standard system paths (`PATH`,
  `~/.gemini/antigravity-cli/`, and user overrides).
- [ ] Implement turn cancellation and interrupt handling.

### Phase 3: Conversation Host & Driver (`backend/src/antigravity/`)

- [ ] Implement `AntigravityConversationHost` and `AntigravityBackendDriver`
  conforming to `AgentBackendDriver`.
- [ ] Map incoming Antigravity stream events to Korus conversation events:
  - Text tokens $\rightarrow$ `message.delta`.
  - Thinking deltas $\rightarrow$ reasoning blocks.
  - Tool invocations $\rightarrow$ `approval.requested` or executed tool cards.
  - Turn completion $\rightarrow$ `turn.completed` with token usage metrics.
- [ ] Map approvals: respond to tool permission requests over `stdin`.
- [ ] Implement Plan Mode: capture planning instructions and stream proposed plan
  deltas to `turn.proposedPlanCompleted`.
- [ ] Implement Goals: handle `setGoal` and `clearGoal` via `/goal` workflows.
- [ ] Implement `listModels` and `listSkills` (discovering from `.agents/skills/`
  and global `~/.gemini/config/skills/`).
- [ ] Transcript hydration: restore historical sessions from Antigravity logs.

### Phase 4: UI & App Integration (`vue/`)

- [ ] Add Antigravity to `BackendSelector.vue` when enabled.
- [ ] Update creation dialogs (`AgentDialog`, `NewSourceWorktreeDialog`,
  `NewProjectDialog`, `RepositoryAcquireDialog`, `CodeReviewPanel`).
- [ ] Add Antigravity section in Settings (toggle, status probe, default model,
  permission posture).
- [ ] Wire composer model/effort dropdown to Antigravity model catalog.

### Phase 5: Verification & Hardening

- [ ] Scripted mock transport harness for testing multi-turn sessions, streaming,
  approvals, and interrupts.
- [ ] Unit tests for protocol parsing, event translation, and tool adapters.
- [ ] Component tests for `BackendSelector` and dialog flows with Antigravity.
- [ ] End-to-end multi-agent scenario: Antigravity agent collaborating with Codex
  and Claude teammates via MCP.
- [ ] Meet or exceed the mandatory $\ge 85\%$ test coverage threshold.

## Testing Strategy

### Core & Contracts
- Snapshot defaults, migrations, and schema validation.
- Backend resolution and capability negotiation.

### Backend & Stdio Protocol
- NDJSON framing, backpressure, and broken-pipe recovery.
- Mock CLI tests verifying prompt delivery, live token streaming, and SIGINT interrupt.
- Approval grant/deny roundtrips.
- Session resume and history hydration.

### Vue & Components
- `BackendSelector` conditional rendering when Antigravity is enabled/disabled.
- Pre-prompt backend switching on fresh agents.
- Composer model selection and reasoning budget binding.

## Commit Checkpoints

- `chore: add antigravity shared contracts, backend types, and settings`
- `feat: implement antigravity stdio stream-json transport`
- `feat: implement antigravity conversation host and backend driver`
- `feat: add antigravity to backend selector, creation dialogs, and settings`
- `test: add unit, contract, and component tests for antigravity provider`

## Definition of Done

- Antigravity appears in `BackendSelector` when enabled in settings.
- Agents can be created with Antigravity across all standard entry points.
- Multi-turn conversation streams text, thoughts, and tool cards in real time.
- Plan Mode, Goals, and tool approvals work natively in the Korus UI.
- Antigravity agents can discover and message teammates via Korus MCP.
- Coverage threshold $\ge 85\%$ is maintained across all modified packages.
