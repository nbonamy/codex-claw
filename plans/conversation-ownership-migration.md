# Conversation ownership migration

## Goal

Make each provider runtime the single owner of its conversations while Codex
Claw owns only agent coordination and product metadata.

The migration is complete when:

- Codex conversation behavior comes directly from `CodexSurface` and the
  Codex App SDK bridge;
- Claude session behavior comes from one deep adapter around the Anthropic
  Agent SDK;
- Claw no longer independently constructs, mutates, reconciles, or persists
  provider transcripts;
- provider fixes to send, stream, edit, retry, delete, fork, approvals, queued
  prompts, or history require no equivalent Claw implementation change;
- Claw-specific decorations remain possible without changing provider message
  identity or lifecycle.

## Why this work exists

The current Codex path has two conversation state machines:

1. `CodexSurface` owns the authoritative snapshot and actions.
2. `CodexSurfaceAgentAdapter` converts SDK state changes into Claw events.
3. Claw reducers rebuild messages, tools, plans, turns, requests, and status in
   `AppSnapshot`.
4. `AppShell` rebuilds an SDK controller from that second state model.

This duplicated ownership has already produced divergent optimistic message
identity, stale turn mutation results, history races, and SDK fixes that must be
retrofitted into Claw.

The Claude path has a different problem. The Anthropic Agent SDK owns process,
session, and stream behavior but does not provide a complete Vue conversation
surface. Claw therefore needs an adapter, but that adapter must be the only
Claude transcript owner rather than feeding a second generic transcript engine.

## Ownership after migration

| Concern | Owner |
| --- | --- |
| Codex messages, turns, streaming, optimistic updates, history, requests, approvals, queued prompts, composer settings, and mutations | Codex App SDK `CodexSurface` |
| Claude sessions, streamed SDK messages, tool/request lifecycle, interruption, context, and transcript hydration | One deep Claude conversation adapter around the Anthropic Agent SDK |
| Agent identity, team membership, repository/worktree, work item, automation, conversation reference, unread/attention projection, and selected agent | Codex Claw |
| Collaboration labels, right-workspace routing, image behavior, TTS, celebrations, handoff metadata, and other Claw presentation policy | Codex Claw overlays and slots |
| Provider process lifetime and filesystem access | `clawd` |
| Electron windows, preload, native dialogs, and transport to `clawd` | Electron main |

Provider status may be projected into the sidebar, but Claw must not become the
source of truth for provider busy, turn, or error state.

## Non-negotiable invariants

1. Exactly one production writer owns a provider conversation.
2. Claw never creates a second optimistic Codex message.
3. Claw never fabricates a provider history event to apply an SDK action
   result.
4. Provider message and turn identifiers remain unchanged end to end.
5. A background agent action cannot target the globally selected conversation
   by accident. Every operation is bound to an agent and conversation reference.
6. Claw persists conversation references and Claw metadata, not provider
   transcripts.
7. Provider payloads are decoded once at their trust boundary. `unknown` may be
   used for transport envelopes but not propagated into product logic.
8. Electron and Web hosts exercise the same `clawd` conversation interface.
9. Temporary comparison code is read-only. It must never execute an action
   twice.
10. A fallback path may exist while a provider cutover is being validated, but
    it is removed before that provider phase is complete.

## Target shape

### Claw conversation registry

Claw retains a small registry keyed by `agentId`:

```text
agentId -> backend + conversationRef + Claw metadata
```

The registry selects the provider host and supplies common activity summaries
needed by the sidebar. It does not expose provider transcript operations as a
large generic driver interface.

### Provider conversation frames

Provider state crosses the `clawd` seam in a discriminated envelope:

```text
agentId + backend + conversationRef + revision + provider snapshot
```

The envelope is app-owned. The snapshot is provider-owned and is validated by
the matching provider adapter. Stale revisions are ignored by the renderer.

### Codex bridge

Reuse the SDK's existing surface bridge operation inventory, argument
validation, snapshots, and state notifications. Add conversation-targeted
bridge behavior in the SDK if the existing active-conversation operations
cannot safely serve simultaneous Claw agents.

The intended route is:

```text
SDK Vue pane -> SDK renderer bridge -> Electron/clawd transport
             -> targeted CodexSurface conversation -> SDK snapshot
```

Claw may adapt transport, attachments, and Claw overlays. It must not translate
the resulting snapshot into a second transcript.

### Claude host

Create one deep Claude conversation module around the Agent SDK. Its interface
returns one renderer snapshot, accepts conversation actions, and emits activity
summaries. Its internal implementation owns SDK message normalization,
transcript hydration, active-turn state, request correlation, and interruption.

Do not force Claude runtime semantics through Codex turn assumptions. Share
presentation primitives only where the two providers actually have the same
meaning.

## Regression strategy

### Characterization matrix

Before a provider cutover, capture the following observable workflows:

| Workflow | Required assertions |
| --- | --- |
| Send | One user row, stable provider identity, one backend invocation |
| Stream | Ordered deltas, stable assistant row, correct terminal status |
| Edit and resubmit | Original turn replaced according to provider behavior; one new active turn |
| Retry | Provider-selected turn retried once with no Claw prompt reconstruction |
| Delete | Selected turn and provider-defined descendants disappear immediately and remain absent after late hydration |
| Fork | Stable turn identity reaches the provider and the returned conversation reference is preserved |
| Queue and steer | Ordering, edits, deletion, retry, and attachment identity remain provider-owned |
| Approval and user input | Request is rendered once, response is correlated once, answered state survives updates |
| Attachments and dictation | Attachment descriptors and input provenance arrive unchanged |
| History | Initial load, older-page load, retry, replacement, and late events cannot resurrect removed state |
| Restart | Claw restores the provider reference and rehydrates from the provider |
| Switching | Two agents can stream concurrently without active-conversation cross-talk |
| Failure | Provider errors remain visible and retryable without corrupting the last good snapshot |

### Differential harness

Captured provider traces run through the legacy presentation path and the new
provider-owned path. Compare user-visible text, message order and identity,
turn identity, tools, requests, approvals, queue, busy state, and available
actions. Differences must be classified as intended corrections or regressions.

The harness is read-only: actions execute once against a fake provider, then
both projections inspect the resulting trace or snapshot.

### Test ownership

- SDK tests own exact Codex conversation semantics.
- Claude adapter tests own exact Claude normalization and session semantics.
- Claw provider integration tests own agent-to-conversation routing, transport,
  snapshot revision handling, and Claw overlays.
- One representative renderer composition suite proves the real SDK pane is
  connected; Claw does not copy SDK component tests.
- Desktop smoke validates startup, send, edit, retry, delete, approval,
  switching, restart, and background activity.

## Execution phases

### Phase 0 — baseline and red-capable harness

1. Record current file/interface/LOC and test-runtime baselines.
2. Add a real-order failing regression for edit-and-resubmit using the SDK fake
   transport through the current Claw renderer state.
3. Add the complete Codex characterization matrix.
4. Build the read-only differential trace harness.
5. Capture manual smoke steps and current results on a disposable repository.

Exit gate: the edit defect is reproducible in seconds and the matrix can catch
identity, ordering, action, and history regressions.

Commit checkpoint:

```text
test: characterize codex conversation ownership
```

### Phase 1 — targeted SDK bridge

1. Audit the SDK surface bridge for per-conversation safety.
2. If required, add conversation-targeted operations and state subscriptions in
   `codex-app-sdk`, with SDK-owned tests.
3. Commit and push the SDK change before consuming it in Claw.
4. Add a typed `clawd` transport adapter for the SDK bridge.
5. Carry `agentId`, conversation reference, and monotonic revision on every
   snapshot notification.
6. Add Electron and Web adapters without exposing raw app-server protocol.

Exit gate: two fake Codex conversations can stream and mutate concurrently
without selected-conversation cross-talk. No renderer cutover yet.

Commit checkpoints:

```text
feat: target codex surface bridge conversations
feat: transport codex surface snapshots
```

### Phase 2 — Codex renderer cutover

1. Add a Codex provider controller that consumes the bridged SDK snapshot and
   delegates SDK actions unchanged.
2. Route Codex agents to that controller as one atomic provider-level choice.
3. Keep Claw-specific headers, mentions, attachment annotation, link/image
   routing, plan side panel, and load-error presentation as decorations.
4. Derive sidebar activity from the provider snapshot without writing provider
   status back into transcript state.
5. Run the differential matrix and desktop smoke with the new path selected.

Exit gate: the real Codex pane uses SDK state/actions directly for every
characterized workflow. The legacy Codex state machine is not a writer.

Commit checkpoint:

```text
feat: delegate codex conversations to sdk
```

### Phase 3 — delete the Codex shadow engine

1. Remove Codex message/turn conversion from `CodexSurfaceAgentAdapter`.
2. Remove Codex `BackendTurnActionResult` reconstruction and synthetic
   `thread.historyLoaded` application.
3. Remove Codex transcript, tool, plan, request, queue, and busy-state branches
   from Claw reducers.
4. Remove Codex transcript persistence and migration-only compatibility code.
5. Delete tests whose behavior is now owned by the SDK; retain transport and
   Claw overlay tests.
6. Remove the temporary path selector and differential production wiring.

Exit gate: changing SDK edit/retry/delete/history behavior requires no Claw
implementation change. Knip finds no legacy Codex conversation code.

Commit checkpoint:

```text
chore: remove codex conversation shadow state
```

### Phase 4 — characterize the Claude owner

1. Capture Agent SDK stream fixtures for text, reasoning, tools, permissions,
   user input, interruption, errors, context, and resume.
2. Establish red-capable tests for Claude send, stream, history, switching, and
   restart behavior.
3. Identify behavior currently split between `ClaudeBackendDriver`, transport,
   Claw reducers, and renderer policy.
4. Specify the smallest renderer snapshot and action interface that preserves
   Claude semantics.

Exit gate: every behavior to be moved has one current owner, one intended owner,
and a regression test at the intended interface.

Commit checkpoint:

```text
test: characterize claude conversation ownership
```

### Phase 5 — Claude deep-module cutover

1. Move Claude conversation state ownership behind the new deep module.
2. Route Agent SDK stream/control events into that module exactly once.
3. Expose immutable renderer frames and common activity summaries.
4. Connect the renderer without passing Claude events through the legacy
   generic transcript reducer.
5. Preserve Claw overlays through the same decoration seam used by Codex.
6. Validate concurrent Codex and Claude agents.

Exit gate: Claude conversation changes are localized to the Claude module;
Claw coordination code is provider-agnostic and transcript-free.

Commit checkpoint:

```text
feat: delegate claude conversations to agent sdk
```

### Phase 6 — remove the legacy shared engine

1. Delete unused `RendererMessage` construction and conversation reducers.
2. Delete transcript persistence and hydration code superseded by provider
   rehydration.
3. Reduce `AgentBackendDriver` to provider lifecycle and Claw integration that
   remains outside provider conversation hosts.
4. Reduce `AppShell` conversation controller plumbing to provider selection and
   Claw decorations.
5. Update architecture, protocol, Codex, Claude, frontend, and testing docs.
6. Run dead-code analysis and verify no compatibility façade preserves the old
   ownership accidentally.

Exit gate: Claw stores provider references and Claw metadata only; no module can
mutate a provider transcript outside its provider owner.

Commit checkpoints:

```text
chore: remove legacy conversation engine
chore: document provider-owned conversations
```

### Phase 7 — final qualification

1. Run all focused provider and bridge suites.
2. Run full tests, coverage, typecheck, lint, Stylelint, and Knip.
3. Run unsigned builds for Core, Backend, Vue, Electron, and Web only when final
   release qualification begins.
4. Execute the manual desktop smoke matrix on a packaged development build.
5. Measure transcript memory, switching latency, streaming render cost, and
   full test runtime against Phase 0.
6. Record before/after LOC, interface sizes, deleted ownership paths, and known
   follow-ups.

Exit gate: automated and manual matrices pass, coverage does not regress, the
new path is measurably smaller, and provider behavior has one owner.

## Rollback policy

- Each phase ends with a clean commit and updated progress ledger.
- SDK changes land and are referenced by commit before dependent Claw work.
- Infrastructure commits do not switch production behavior.
- Codex and Claude cutovers are separate commits and separate release risks.
- Never roll back by replaying provider actions; restore the previous code path
  and rehydrate from the provider conversation reference.
- Do not delete a legacy provider path until its new path passes the complete
  provider matrix and manual smoke.
- If a cutover fails qualification, revert that cutover commit while retaining
  the characterization harness and safe bridge infrastructure.

## Progress ledger

| Date | Phase | Status | Evidence | Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-09-06 | Plan | Complete | Existing Codex/Claude ownership, SDK bridge, renderer controller, reducers, and mutation route inspected | — | Awaiting approval to begin Phase 0 |
| 2026-09-06 | Phase 0 | Complete | Real SDK Vue edit emits `{turnId, content}`; SDK fake transport rolls back and starts exactly one replacement turn; Claw/SDK projections compared; 2,074 tests pass in 19.6s | `0ab52f6` | Both halves work in isolation. The live defect is only possible because the renderer can expose Claw-owned history that the SDK runtime does not own; eliminating the second transcript is the fix. |
| 2026-09-06 | Phase 1 | Complete | SDK targeted bridge `93d2ae3`; one targeted subscription per agent; concurrent A/B snapshots carry independent identity and monotonic per-agent revisions; reconnect regression; Core/backend/Vue focused tests and typechecks pass | `4940076` | Generic Electron/Web backend-event adapters already carry the app-owned snapshot frame, so no provider protocol leaked across those boundaries. SDK operations are invoked through the targeted bridge where renderer attachment resolution is not required. |
| 2026-09-06 | Phase 2 | Complete | SDK replica `33f24a3`; Claw consumes one bounded reset plus revisioned SDK events; divergent legacy rows cannot win; real dev send streamed one user row and one assistant row; no new buffer overflow; Core 285, Backend 597, Vue 884, and Electron runtime 19 tests pass; all four lint/typecheck gates pass | `3535ddd` | The live 1.97 MB snapshot flood forced the correct reset-plus-delta design. The old Claw Codex reducer still runs only as a temporary metadata/overlay bridge and is removed in Phase 3. |
| 2026-09-06 | Phase 3 | Complete | Codex adapter no longer emits Claw transcript, turn, tool, request, approval, queue, compaction, or history projections; turn actions return no reconstructed transcript; renderer workspace state derives from the provider snapshot; Knip is clean; all 2,075 workspace tests pass | `chore: remove codex conversation shadow state` | 594 net lines removed in this checkpoint. Claw state persistence already excluded all transcripts, so no persistence migration was required. Generic conversation reducers remain only for Claude until its owner is cut over in Phases 4–6. |

### Phase 0 baseline

- Production conversation-path LOC: 6,525 across the five Claw conversation
  reducer files, Codex adapter, Claude driver, `ConversationPane`, and
  `AppShell`.
- Largest owners: Codex adapter 1,776 LOC; Claude driver 1,266 LOC; Claw
  conversation reducers 1,397 LOC; `AppShell` 1,807 LOC.
- Conversation representations on the Codex render path: SDK surface snapshot,
  adapter `BackendEvent`/`RendererMessage`, Claw `AppSnapshot`, SDK Vue
  controller state (four representations, three conversion hops, two writers).
- Full AI-oriented suite: 272 files / 2,074 tests, 19.6 seconds wall time.
- Five-agent long-transcript benchmark: 130.18 ms mean, 128.68–133.59 ms,
  10 samples.
- Manual development-build startup reproduced the long-thread load failure.
  Retry remained unavailable while the same provider thread was open in the
  release build, as expected from the single-writer constraint.

## Metrics to record

- Codex adapter production LOC before and after.
- Claude driver/adapter production LOC before and after.
- Claw conversation reducer production LOC before and after.
- `AppShell` conversation state/action bindings before and after.
- Number of conversation representations and conversion hops per provider.
- Number of writers capable of changing a provider transcript.
- Provider integration tests versus duplicated provider semantic tests.
- Full-suite runtime and provider-focused runtime.
- Coverage by workspace.
- Streaming render latency and agent-switch latency on a long conversation.

## Lessons learned

Append durable lessons after each completed provider cutover. At minimum record
which compatibility assumptions were wrong, which differential assertions
caught real regressions, and which interfaces gave Claw less knowledge of
provider internals.

- A provider reset followed by provider-native deltas is both smaller and more
  reliable than reconstructing the same conversation from app-owned semantic
  events. The reset must be bounded; publishing the complete live surface on
  every change recreated the memory and transport costs of the shadow model.
- Claw still needs provider-derived activity, settings, goals, diffs, and
  subagent topology for product chrome. Those are projections, not transcript
  ownership: none can create, replace, or mutate a provider message or turn.
- Tests that asserted exact Codex tool, compaction, or message conversion in
  Claw were duplication, not protection. SDK tests own those semantics; Claw
  tests now protect routing, provider-frame delivery, and overlay correlation.
