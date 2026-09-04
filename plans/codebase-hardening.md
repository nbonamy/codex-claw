# Codex Claw codebase hardening plan

## Goal

Turn Codex Claw's high-churn orchestrators into deep modules with clear
ownership, small interfaces, direct tests, and no duplicated policy. Preserve
product behavior throughout: this is systematic hardening, not a rewrite.

## Baseline

Measured on 2026-09-04 before implementation begins.

| Area | Baseline |
| --- | ---: |
| Full test suite | 2,034 tests in 25.01s |
| Vue test suite | 118 files / 894 tests in 17.00s |
| `backend/src/server.ts` | 2,758 lines; 102-case request switch |
| `backend/src/server.spec.ts` | 7,270 lines; 116 tests |
| `core/src/snapshot.ts` | 2,558 lines; 42 event branches |
| `core/src/contracts.ts` | 1,745 lines; 213 exports; 238 consumers |
| Typed backend protocol | 12 of 156 methods |
| Electron app controller | 1,835 lines; about 120 IPC registrations |
| Renderer app state | 1,837 lines; 164 returned members |
| `AppShell.vue` | 1,798 lines; 112 props; 39 emits |
| `GitWorkflowControl` | 1,332 lines |
| Repository backlog | 1,310 lines |
| Image annotations | 1,298 lines |
| Automations | 804 lines |
| Architecture documentation | Current Bench docs were already removed; historical `shared` workspace/path terminology remained |

The update-badge visibility fix was resolved and committed separately before
structural hardening began, so it does not contaminate structural diffs or
their verification evidence.

## Non-negotiable rules

1. Preserve behavior first. Add or retain characterization coverage before
   changing ownership.
2. Use lossless mechanical moves before changing module boundaries or policy.
   Never combine a large relocation and semantic redesign in one step.
3. Do not replace one giant file with a giant options bag, controller bag, or
   index module.
4. Keep provider details behind `AgentBackendDriver`.
5. Keep Electron and Vue as adapters. Backend and domain policy must not leak
   into them.
6. Temporary compatibility façades are allowed only when they make a safe
   migration possible. Record them and delete them before completion.
7. Do not create shallow public pass-through modules that merely redistribute
   names without owning behavior.
8. Make one coherent commit per checkpoint, using the checkpoint commit title
   unless the actual scope warrants a more precise equivalent.
9. At every checkpoint:
   - run focused tests;
   - run the affected typecheck and lint checks;
   - run `git diff --check`;
   - record before/after lines and interface shape;
   - update this plan's progress ledger with commands, timing, commit SHA, and
     discoveries.
10. Run `npm run test:ai` at every phase boundary.
11. The final gate includes full tests, typecheck, lint, knip, coverage, backend
    build, and an unsigned Electron build.
12. Do not weaken assertions or coverage thresholds to make a checkpoint pass.

## Execution model

The root agent is the program orchestrator. Implementation work is delegated
to Codex subagents, with parallel work only where file ownership and contracts
are independent. The orchestrator owns sequencing, integration review, test
evidence, and this plan.

Each delegated checkpoint must identify:

- the exact files and responsibility in scope;
- the behavior that must remain unchanged;
- the focused verification required before handoff;
- whether the work may overlap with another active lane;
- the expected checkpoint commit, without allowing agents to commit unless
  explicitly instructed.

Phase dependencies are strict. Phases 1 through 4 establish the seams needed
for the parallel feature lanes in phase 5. Provider work starts only after the
backend request and event boundaries are stable.

## Progress

- [x] Audit the high-churn modules, interfaces, and test hot spots.
- [x] Design the hardening phases, dependency order, and exit criteria.
- [x] Review the proposed program with Nicolas.
- [x] Save the approved plan and establish the progress ledger.
- [x] Phase 0: establish the foundation and test seams.
- [x] Phase 0.1: resolve the update-badge change separately.
- [x] Phase 0.2: align stale architecture documentation.
- [x] Phase 0.3: split oversized test suites along ownership boundaries.
- [ ] Phase 1: harden core state and contracts. **Phase 1.4 slice 2 active — type backend status, catalogs, and pairing events.**
- [x] Phase 1.1: consolidate agent state ownership.
- [x] Phase 1.2: extract snapshot construction.
- [x] Phase 1.3: extract deep snapshot reducers.
- [x] Phase 1.3a: extract the subagent reducer.
- [x] Phase 1.3b: extract the runtime/global reducer.
- [x] Phase 1.3c: extract the conversation reducer.
- [x] Phase 1.4 slice 1: type connection and annotation events.
- [ ] Phase 1.4 slice 2: type backend status, catalogs, and pairing events. **Active.**
- [ ] Phase 2: modularize backend request, event, and persistence ownership.
- [ ] Phase 3: reduce Electron to focused desktop adapters.
- [ ] Phase 4: modularize renderer state and slim AppShell.
- [ ] Phase 5: deepen the four large feature modules.
- [ ] Phase 6: deepen provider internals without premature unification.
- [ ] Phase 7: remove transitional debt and run final qualification.

## Progress ledger

Update this table after every checkpoint. A checked box without the supporting
row is not complete.

| Date | Checkpoint | Status | Owner | Before / after | Verification and timing | Commit | Discoveries / follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-04 | Audit and baseline | Complete | root orchestrator | Full: 2,034 tests; Vue: 118 files / 894 tests | Full suite 25.01s; Vue 17.00s | — | Baseline established; update-badge fix tracked separately |
| 2026-09-04 | Plan save | Complete | plan steward | Approved draft → `plans/codebase-hardening.md` | Plan reviewed and saved; no runtime checks required | — | Status advanced from active to complete |
| 2026-09-04 | Phase 0.1: update-badge visibility | Complete | root orchestrator | Checking badge visible → hidden; downloading and update-available states retained | 31 focused badge/header tests passed; Vue lint and typecheck passed; all states checked in jsdom; `git diff --check` passed; timing not recorded | `d06531826baaf2dbaa2d94339adcbba4690e6a03` | Change remained independent from structural hardening |
| 2026-09-04 | Phase 0.2: architecture documentation | Complete | documentation agent / plan steward | Bench docs already current; stale `shared` workspace and source paths → current `core` terminology and paths | Docs-only review; `git diff --check` and `git diff --cached --check` passed; runtime tests not applicable | `78c37a7daa966a4c128331fd9066f30a16cb309b` | Audit corrected: Bench was not stale; phase 0.3 is next |
| 2026-09-04 | Phase 0.3: core snapshot specifications | Complete | core test agent / root integrator | 1 spec → 6 specs + 1 fixture; 81 → 81 runtime tests; 78/78 declarations and 10/10 fixture helpers byte-identical | Focused: 81 passed; full core: 226 passed in 558ms; focused runtime 258 → 244ms; core typecheck, lint, and diff checks passed | `d5baa3ffc93f25843bf1690f5252e0d2a4c89b6d` | Lossless core split complete; phase remains active with backend and Electron test lanes active |
| 2026-09-04 | Phase 0.3: backend server specifications | Complete | backend test agent / root integrator | 1 spec → 13 specs + 1 fixture; 116 → 116 tests; 116/116 test bodies and 13/13 fixture bodies byte-identical; largest spec 992 lines | Focused: 116 passed, 863ms before → about 974ms/1.02s after; full backend: 611 passed in 2.38s; backend typecheck, lint, and diff checks passed | `a30bc4d47fa827bc42abea4eefaa251563840bd2` | Backend lane complete; Electron lane active; renderer state split pending |
| 2026-09-04 | Phase 0.3: Electron app-controller specifications | Complete | Electron test agent / root integrator | 1 spec → 6 specs; 71 → 71 tests; original 2,827 → 96 lines; replacement specs total 2,805 lines plus a 91-line harness; largest spec 946 lines; 71/71 test bodies and 99/99 helpers byte-identical | Focused: 71 passed in 813ms, baseline 1.10s; full Electron: 3.88s, baseline 5.20s; Electron typecheck, lint, and diff checks passed | `174952716bb43b933e7034a07ba69ce089b479c4` | Electron lane complete; phase remains active with renderer state test lane active |
| 2026-09-04 | Phase 0.3: renderer app-state specifications | Complete | renderer test agent / root integrator | 1 spec / 4,739 lines → 7 owner-aligned specs / 4,825 lines + 30-line fixture; 113 declarations preserved: 112 regular tests and one three-row parameterized test; 115 → 115 runtime cases; every declaration body byte-identical; largest spec 946 lines | Focused: 115 passed in 1.80s, baseline 1.55s; full Vue: 896 passed in 13.22s, pre-split run 14.31s; Vue typecheck, lint, CSS lint, and diff checks passed | `076d905b7beef0e59106967eb5fae08c467bfb02` | Split required no singleton-isolation or production-state change |
| 2026-09-04 | Phase 0.3: split remediation | Complete | root integrator | Two oversized core specs at 1,346 and 1,145 lines → six cohesive specs, largest 611 lines; unused Electron `getSnapshot` export → private harness helper | Focused remediation tests passed; full core: 226 passed; Electron controller: 71 passed; core/Electron typecheck and lint passed; diff checks passed | `0e6af2ad4e8a5a653820552fd46f66e6f616ad9a` | Every Phase 0 split spec is now below 1,000 lines |
| 2026-09-04 | Phase 0 boundary qualification | Complete | plan steward / root orchestrator | 2,036 tests passed on every run; all split declarations preserved; largest Phase 0 split spec is 992 lines | `npm run test:ai` wall runs: 20.58s, 20.59s, 20.27s; median 20.58s, 4.43s faster than the 25.01s baseline. `npm run typecheck`: passed in 16.93s. `npm run lint`: passed in 19.42s, with one non-failing stale `lipo` ignore hint. Size gate and `git diff --check`: passed | `6eb9cecaa961a1462176b82002d6dba3acfa2b69` | Phase 0 exit criteria met; the earlier 29.51s run was not a persistent regression |
| 2026-09-04 | Phase 1.1: consolidate agent state ownership | Complete | core state agent / root integrator | `snapshot.ts` 2,558 → 2,367 lines; `agent-manager.ts` 449 → 651 lines; agent-state interface 15 → 23 exports, including 8 compatibility re-exports from `snapshot.ts`; lifecycle coverage 10 → 16 tests; core 226 → 232 tests | Moved helper bodies mechanically and verified them byte-for-byte before boundary edits; semantic review found no behavior drift. Focused lifecycle: 16 passed; full core: 232 passed; core typecheck, lint, and diff checks passed | `5ce6f800a24e8081527b9612e12ef5384d0cd016` | `agent-manager.ts` is now the authoritative owner for creation, update, selection, membership, and runtime reset; temporary `snapshot.ts` re-exports preserve callers during migration |
| 2026-09-04 | Phase 1.2: extract snapshot construction | Complete | core state agent / root integrator | `snapshot.ts` 2,367 → 2,240 lines; extracted a 152-line construction owner and one-line `seedTeamId` dependency leaf; core 232 → 236 tests, including five direct construction tests in a 209-line spec; three construction functions remain compatibility re-exports from `snapshot.ts` | Construction tests: 5 passed; full core: 236 passed in 598ms; core typecheck, lint, mechanical move review, independent semantic review, and diff checks passed | `30a7ae93306ac1ae9b3ffc4484a1d32b6107ec0a` | The independent review found nested mutable defaults were aliased across snapshots. Construction now clones nested arrays/objects, with mutation coverage proving fresh teams, runtimes, backlog, remote connections, general settings, source-folder state, and theme state. The dependency leaf avoids a construction/agent-state cycle; the temporary façade remains until consumer migration |
| 2026-09-04 | Phase 1.3a: extract subagent reducer | Complete | core reducer agent / root integrator | `snapshot.ts` 2,240 → 2,046 lines; extracted a 220-line reducer with one exported function; mixed façade spec 272 → 113 lines plus a 164-line direct reducer spec; five tests preserved across the split | Four dispatcher branches, five helpers, and all five original test bodies verified byte-for-byte. Focused: 2 files / 5 tests passed in 166ms; full core: 38 files / 236 tests passed in 611ms; core typecheck, lint, Knip, acyclic dependency check, and staged diff check passed | `5c8b7bd60b82782ee6fda5370dfe7e9937b90ce2` | Neutral subagent enum/value validators remain in `subagent-values.ts`; reducer-local structural validation stays private. `thread.started` remains the explicit façade bridge that clears a stale root tree before future runtime reduction |
| 2026-09-04 | Phase 1.3b: extract runtime/global reducer | Complete | core reducer agent / root integrator | `snapshot.ts` 2,046 → 1,591 lines; extracted a 468-line reducer with one exported handled-result function; runtime spec 419 → 590 lines and 11 → 15 tests; interaction spec 443 → 406 lines; core 236 → 239 tests; metadata helpers moved to construction and two shared agent helpers moved to `agent-manager.ts` | Focused runtime/façade coverage: 4 files / 28 tests passed in 191ms; full core: 38 files / 239 tests passed in 631ms; core typecheck, lint, Knip, fidelity review, acyclic dependency review, and staged/diff checks passed | `1518dfe8a29bf6d8ec4f59456538c540fe7223f9` | Review fixed two routing regressions before commit: `thread.settingsUpdated` is now reported handled even without a thread ID, and stale subagent-tree invalidation was restored to the façade before runtime delegation. Wall-clock agent-status timestamps, agentless global events, owned no-ops, and the legacy missing-agent gate now have direct characterization coverage |
| 2026-09-04 | Phase 1.3c: extract conversation reducer | Complete | core reducer agent / root integrator | `snapshot.ts` 1,591 → 64 lines; extracted payloads 273, transcript 413, tools 317, plans 305, and reducer 307 lines; largest private module 413 lines; one reducer entrypoint owns 24 conversation event types | Focused owners: 8 files / 55 runtime tests passed in 238ms, comprising 51 declared test bodies with four additional parameterized cases; full core at the boundary: 39 files / 239 tests passed in 649ms; core typecheck, lint, Knip, move-fidelity review, acyclic dependency review, and diff checks passed | `e03dd5da636a1545677fcf888ad67bb6bcd0d2bc` | The architecture review moved agent resolution to the reducer and passes the `Agent` into plan helpers, so plans do not import `agent-manager`; the dependency graph remains payloads → transcript → tools → plans → reducer. Temporary façade exports preserve callers, and frozen semantic risks move to 1.4 rather than contaminating the extraction |
| 2026-09-04 | Phase 1.3 boundary qualification | Complete | plan steward / root orchestrator | Three deep reducers complete; `snapshot.ts` 2,240 at the start of 1.3 → 64 lines; total suite 270 files / 2,049 tests | `npm run test:ai`: core 39 files / 239 tests in 649ms; backend 61 / 611 in 1.64s; Vue 124 / 896 in 13.76s; Electron 40 / 282 in 3.58s; Web 6 / 21 in 453ms; wall 21.57s, 3.44s faster than the 25.01s program baseline | `681b8b4cdd8ba0f95164fb750dd5beab6228b111` | Phase 1.3 exit is qualified; Phase 1.4 slice 1 is active |
| 2026-09-04 | Phase 1.4 slice 1: type connection and annotation events | Complete | core event agent / root integrator | Two client-local event variants now discriminate `client.connectionChanged` with `BackendConnectionState` and `browser.annotationCreated` with `BrowserAnnotation`; `BackendEvent`, `ClawBackendEvent`, and the Electron client emitter remain distributive | Focused: core 3 files / 10 tests; backend 1 / 8; Electron 2 / 21; Vue 1 / 8. Full `npm run test:ai`: 270 files / 2,052 tests, real 21.12s. All-workspace typecheck: 18.15s. Lint and Knip: 19.95s. Diff checks passed | `02510448b0b02517f3a89736d4a0b8c48f8a0d7a` | Independent review replaced an impossible annotation payload hidden behind a double cast with a valid source-less `BrowserAnnotation` and removed an adjacent unnecessary cast. Optional envelope/source fields, source-less fallback, payload-owned annotation `agentId`, broad transport compatibility, and existing runtime guards are preserved; no decoding or behavior change was bundled |
| 2026-09-04 | Phase 1.4 slice 2: type backend status, catalogs, and pairing events | Active | root orchestrator | Five event variants selected: backend runtime status, account rate limits, model catalog, skill catalog, and device pairing status | Read-only payload/context and consumer audit complete; implementation and gates pending | — | Require envelope `backend` for backend status, rate limits, models, and skills, but not pairing. Require no agent, thread, or source fields. Preserve flat rate-limit normalization; do not enforce equality between envelope and payload backend values. Keep catalog/pairing guards and deferred wire casts unchanged |
| 2026-09-04 | Phase 2.1: source workspace request manifest | Pending | root orchestrator | Prepared future move: `driver-rpc.ts` 466 lines / 47 cases, including 11 source/file/worktree cases; `server.ts` 2,759 lines / 102 cases; typed protocol baseline corrected to 12/156 methods | Read-only request, protocol, authority, filesystem-security, and test inventory complete | — | Introduce a deep source-workspace request owner with parsing, authoritative agent-folder resolution, local/remote routing, initialization, persistence, and error policy; retain filesystem confinement, symlink protection, size caps, remote stripping, and shared worktree ownership. Target driver dispatch 47 → 36 cases, server ≤93 cases, and typed protocol 23/154 after removing two obsolete internal file methods. Execute only after Phase 1 |

For each future row, include:

- checkpoint status: pending, active, blocked, or complete;
- responsible agent or integration owner;
- line counts and relevant interface counts before and after;
- focused and phase-boundary commands with elapsed time;
- resulting commit SHA;
- discoveries, temporary façades, deferred work, and changed assumptions.

## Phase 0 — Foundation and test seams

### 0.1 Resolve the update-badge change

- Finish and verify the already-started visibility change independently.
- Keep the checking state silent.
- Keep the downloading and update-available states visible.
- Commit it before structural hardening begins.

This is explicitly outside the hardening commit sequence.

### 0.2 Align architecture documentation

- Confirm current Bench documentation was already removed.
- Replace stale `shared` workspace and source-path terminology with the current
  `core` workspace and paths in backend and protocol architecture docs.
- Verify the architecture and documentation map reflect the current product
  and repository layout.
- Do not use this checkpoint to introduce new architecture decisions.

Commit checkpoint: `chore: align architecture documentation`

### 0.3 Split tests around the intended ownership seams

Mechanically split oversized suites before production modules move:

- split snapshot tests by construction, agent state, subagents,
  conversations, and global events;
- split backend server tests by the future request-handler domains;
- split Electron app-controller tests by backend replica and IPC registrar;
- isolate renderer app-state tests by state replica and domain command surface;
- share narrow harnesses and fixtures, not global mutable test bags;
- preserve every assertion during the move;
- leave no unjustified spec file above roughly 1,000 lines.

Commit checkpoints:

- `test: split core state specifications`
- `test: split backend server specifications`
- `test: split electron controller specifications`
- `test: split renderer state specifications`

### Phase 0 exit criteria

- The update-badge change is independently committed.
- Current product and architecture documentation does not present Bench as a
  live concept and no longer uses stale `shared` workspace/path terminology.
- Test files mirror the planned ownership boundaries.
- No oversized spec remains without a documented reason.
- Test counts and assertions are preserved.
- Focused gates pass after each split and `npm run test:ai` passes at the phase
  boundary.

## Phase 1 — Core state and contracts

### 1.1 Consolidate agent state ownership

- Identify every agent mutation path and establish one authoritative owner.
- Remove duplicate normalization, lookup, and mutation policy.
- Keep public behavior and persisted snapshot compatibility intact.

Commit checkpoint: `chore: consolidate agent state ownership`

### 1.2 Extract snapshot construction

- Move defaults, migration inputs, validation preparation, and snapshot
  assembly into a deep construction module.
- Keep `snapshot.ts` as the stable public façade during migration.
- Test construction directly rather than only through the façade.

Commit checkpoint: `chore: extract snapshot construction`

### 1.3 Extract deep snapshot reducers

- Give subagent, conversation, and global event reduction separate owning
  modules.
- Keep cross-domain transitions explicit at the façade.
- Move tests with their owning reducers.

#### 1.3a Subagent reducer

- Own operation, activity, identity, and status events plus subagent-tree
  construction behind one reducer function.
- Keep neutral subagent value validators in `subagent-values.ts`.
- Keep root-conversation invalidation in the `thread.started` façade bridge.

Commit checkpoint: `chore: extract snapshot subagent reducer`

#### 1.3b Runtime/global reducer

- Own `snapshot.updated`, work-routing request/resolution, backend status,
  account rate limits, backlog assignments, agent update/status, thread
  start/settings/token/goal/mode, and git-status events.
- Move `snapshotMetadata` and `applySnapshotMetadata` to snapshot construction,
  retaining temporary façade re-exports for existing callers.
- Move the shared agent lookup and status mutation helpers into
  `agent-manager.ts`; runtime and conversation reducers must use that
  authoritative owner rather than duplicate agent mutation policy.
- Keep the stale-subagent-tree check in `snapshot.ts` as the explicit
  cross-domain `thread.started` bridge before delegating the remaining runtime
  transition.
- Preserve `thread.modeUpdated` as an explicit no-op. Preserve
  `agentCreation.progress`, `browser.annotationCreated`,
  `celebration.requested`, `client.connectionChanged`,
  `clientRequest.resolved`, `devicePairing.statusChanged`, `file.activity`,
  `git.operationProgress`, `models.changed`, `sidePanel.gitDiffRequested`,
  `sidePanel.markdownRequested`, and `skills.changed` as no-ops without making
  their handling exhaustive until 1.4.

Commit checkpoint: `chore: extract snapshot runtime reducer`

#### 1.3c Conversation reducer

Completed in `e03dd5da636a1545677fcf888ad67bb6bcd0d2bc`.

- Own transcript streaming and hydration, compaction, plans, tools and diffs,
  approvals and user input, prompt queues, turn completion, and errors behind
  one reducer function.
- Own exactly these 24 event types: `thread.historyLoaded`; `turn.started`,
  `turn.planUpdated`, `turn.proposedPlanDelta`,
  `turn.proposedPlanCompleted`, and `turn.completed`; `message.delta`,
  `message.updated`, `message.userSubmitted`, and `message.steer`;
  `agent.promptQueued`, `agent.promptRetryScheduled`, and
  `agent.promptDequeued`; `backendApproval.requested` and
  `backendApproval.resolved`; `context.compactionStarted` and
  `context.compactionCompleted`; `item.started`, `item.completed`, and
  `item.updated`; `diff.updated`; `approval.requested`;
  `toolInput.requested`; and `error`.
- Build five private modules in one direction: payload validation depends only
  on contracts; transcript depends on payload validation; tools and diffs
  depend on payload validation, transcript, and `tool-output`; plans depend on
  payload validation, transcript, and tools; the reducer composes all four and
  the agent-state owner. No private module may import the façade or another
  top-level reducer.
- Move detailed reducer tests to their direct owner while retaining only
  composition and cross-domain smokes on `applyMainEventToSnapshot`. Preserve
  51 existing direct-owner cases: 21 transcript/hydration/compaction, eight
  plans, 13 tool/diff, eight interaction, and one retryable-error case.
- Keep temporary façade exports for `appendUserPrompt`, `appendSteerPrompt`,
  `appendSystemMessage`, and `formatThreadPlanMarkdown` while callers migrate.
- Target reducer ≤320 lines, transcript ≤550, tools ≤450, plans ≤330, payloads
  ≤300, no private file above 600, and the composed façade at roughly 150–250
  lines.
- Freeze the early `!agentId` behavior and unreachable all-agent
  `backendApproval.resolved` path; atomic turn completion and diff updates;
  approval/input/error status coupling; hydrated object identity and canonical
  placement; streaming IDs, segment, and compaction order; and proposed-plan
  tag filtering. Those semantics can change only in 1.4.

Commit checkpoint: `chore: extract snapshot conversation reducer`

Approved extraction order and boundaries:

1. Extract subagent operation, activity, identity, and status events with their
   tree helper.
2. Extract global/runtime state, routing, backend/account, agent, settings,
   goal, token, and git-status events.
3. Extract conversation events as one cohesive owner: thread history and
   turns, transcript and prompt queues, hydration and compaction, plans, tools,
   approvals, diffs, and errors.

`snapshot.ts` remains the temporary façade, owns the cross-domain
`thread.started` transition, and keeps the existing early `!agentId` gate.
Reducers must not import the façade. Preserve current no-op behavior for
`agentCreation.progress`, `browser.annotationCreated`,
`celebration.requested`, `client.connectionChanged`,
`clientRequest.resolved`, `devicePairing.statusChanged`, `file.activity`,
`git.operationProgress`, `models.changed`, `sidePanel.gitDiffRequested`,
`sidePanel.markdownRequested`, and `skills.changed`. Making ignored events
exhaustive and resolving the unreachable all-agent `backendApproval.resolved`
path are deliberately deferred to 1.4 so the move remains lossless.

### 1.4 Make event reduction honest and typed

#### Slice 1 — connection and annotation events

Completed in `02510448b0b02517f3a89736d4a0b8c48f8a0d7a`.

- Type `client.connectionChanged` with payload `BackendConnectionState`.
- Type `browser.annotationCreated` with payload `BrowserAnnotation`.
- Preserve optional envelope and source fields, including the source-less
  legacy/test fallback classification.
- Do not require an envelope `agentId` for annotations; annotation identity is
  carried by the payload.
- Keep `BackendEvent` and `ClawBackendEvent` distributive without excluding
  client-local events.
- Expect compile pressure at `nextMainEvent`, `eventForRenderer`, remote
  forwarding, and the Electron test harness; update those consumers without
  changing behavior.
- Keep existing runtime guards unchanged. Deep boundary decoding belongs to a
  later slice.

#### Slice 2 — backend status, catalogs, and pairing events

- Type `backend.statusChanged` with payload `BackendRuntimeStatus` and require
  the envelope `backend` field.
- Type `account.rateLimitsUpdated` with its accepted flat or nested payload and
  require the envelope `backend` field.
- Type `models.changed` with a `models` array payload and require the envelope
  `backend` field.
- Type `skills.changed` with `cwd`, `status: 'loaded'`, and a `skills` array,
  and require the envelope `backend` field.
- Type `devicePairing.statusChanged` with payload `DevicePairingStatus`; it does
  not require an envelope `backend` field.
- Do not add agent, thread, or source requirements to any of these events.
- Preserve flat rate-limit normalization and do not enforce equality between
  envelope and payload backend values.
- Keep the existing catalog and pairing guards unchanged. Existing wire casts
  remain deferred until the corresponding transport-decoding slice.

- Replace permissive event handling with discriminated events.
- Use exhaustive handling where the application owns the event union.
- Record intentionally ignored events explicitly.
- Replace broad casts and false guards with honest boundary validation.

Commit checkpoint: `chore: type snapshot event reduction`

### 1.5 Split contract domains

- Split `contracts.ts` into cohesive domains such as agents, conversations,
  teams, worktrees/git, automations, artifacts, settings, and transport.
- Retain a compatibility barrel while consumers migrate.
- Prevent circular domain ownership and provider-specific leakage.
- Delete the compatibility barrel's obsolete exports before final completion.

Commit checkpoint: `chore: split core contract domains`

### Phase 1 exit criteria

- `snapshot.ts` is approximately 300 lines and primarily composes deep modules.
- The contracts barrel is approximately 100 lines.
- Every owned event is exhaustive or explicitly ignored.
- Agent mutation policy has one owner.
- Direct module tests own detailed behavior; façade tests cover composition.
- `npm run test:ai` passes.

## Phase 2 — Backend orchestration

### 2.1 Isolate source and workspace requests

- Move source, filesystem, and worktree behavior out of driver RPC handling.
- Preserve backend filesystem ownership and security checks.
- Ensure repository initialization and worktree policy live in one service.

Future extraction discovery: `driver-rpc.ts` currently owns 11 non-provider
source/file/worktree cases among 47, while `server.ts` owns another nine cases
among 102. Introduce a deep source-workspace request service whose narrow
entrypoint is `tryHandle(message)` and whose legitimate domain operations are
folder validation and initial source-folder setup. It owns request parsing,
authoritative agent-folder lookup, local/remote targeting, initialization,
recent-repository persistence, local execution, and domain error shapes while
retaining realpath confinement, symlink-escape prevention, file-size caps,
remote-field stripping, and the shared worktree manager. Remove two obsolete
internal file methods and type the 11 app-owned methods, moving the corrected
protocol baseline from 12/156 toward 23/154. Phase 2.2 then deepens the
temporary location adapter rather than preserving a pass-through layer.

Commit checkpoint: `chore: isolate source workspace requests`

### 2.2 Extract local and remote routing

- Build a deep routing seam for ownership/location resolution.
- Keep local versus remote dispatch out of domain handlers.
- Preserve request identity, error mapping, and cancellation behavior.

Commit checkpoint: `chore: extract backend location routing`

### 2.3 Add typed support-domain request modules

- Convert support domains first: settings, files, git, automations,
  integrations, scheduler, and other low-coupling requests.
- Give each module typed request input and typed result contracts.
- Keep `handleMessage` limited to routing rather than policy.

Commit checkpoint: `chore: extract backend support requests`

### 2.4 Add typed team and connection request modules

- Extract teams, remote connections, and related projections.
- Centralize authorization/location behavior at the routing seam.
- Keep persistence mutations with their domain owner.

Commit checkpoint: `chore: extract backend team requests`

### 2.5 Add typed agent and conversation request modules

- Extract high-churn agent lifecycle, conversation, collaboration, and backend
  driver requests last.
- Preserve `AgentBackendDriver` as the provider boundary.
- Prevent request modules from reaching into one another's private state.

Commit checkpoint: `chore: extract backend agent requests`

### 2.6 Extract event coordination

- Give backend event ingestion, app-owned translation, persistence effects,
  and client publication a dedicated coordinator.
- Keep request handlers free from event fan-out mechanics.
- Test event ordering and side effects directly.

Commit checkpoint: `chore: extract backend event coordination`

### 2.7 Modularize persistence codecs

- Extract internal codecs and migrations by persisted domain.
- Retain the existing load/save façade while consumers migrate.
- Keep schema compatibility and corrupt-state recovery explicit.

Commit checkpoint: `chore: modularize state persistence`

### Phase 2 exit criteria

- `handleMessage` is approximately 100 lines and contains no domain policy.
- All backend methods use typed request and result contracts.
- Any backend orchestrator above roughly 700 lines triggers an explicit design
  review rather than being accepted by default.
- Detailed behavior is tested at the owning request, event, or persistence
  module; server tests cover routing and composition.
- `npm run test:ai` passes.

## Phase 3 — Electron adapters

### 3.1 Extract the Electron backend replica

- Move backend snapshot/event replication out of the app controller.
- Make raw snapshot adoption, normalized snapshot adoption, and metadata
  adoption explicit policies.
- Keep renderer notification ordering deterministic.

Commit checkpoint: `chore: extract electron backend replica`

### 3.2 Compose focused IPC registrars

- Group IPC registration by cohesive desktop capability.
- Use a typed preload bridge backed by focused registrars.
- Keep Electron-only responsibilities—windows, dialogs, lifecycle, native
  capability adapters—in the composition root.

Commit checkpoint: `chore: split electron ipc adapters`

### Phase 3 exit criteria

- `AppController` owns native lifecycle and composes adapters; it does not own
  backend domain policy.
- Backend replica policies are named and directly tested.
- IPC registrars have small, typed interfaces and no catch-all dependency bag.
- `npm run test:ai` passes.

## Phase 4 — Renderer state and AppShell

### 4.1 Make renderer state constructible

- Introduce `createAppState` with explicit injected dependencies.
- Retain a thin singleton wrapper for the production application.
- Remove global test mutation where direct construction suffices.

Commit checkpoint: `chore: make renderer state constructible`

### 4.2 Modularize renderer application state

- Extract a deep renderer replica for backend-owned state.
- Group commands and projections into fewer than ten domain namespaces.
- Keep selection, synchronization, conversation, git, automation, and UI-only
  state with their real owners.
- Add direct composable tests instead of exercising all behavior through
  AppShell.

Commit checkpoint: `chore: modularize renderer application state`

### 4.3 Establish AppShell controller coverage

- Characterize conversation mapping, dialog workflows, keyboard commands, and
  debug previews through focused controllers.
- Keep a small number of real-composition shell tests.
- Avoid remounting already-owned child behavior through AppShell.

Commit checkpoint: `test: cover app shell controllers`

### 4.4 Slim AppShell orchestration

- Extract conversation mapping, dialog workflows, commands, and debug-preview
  ownership behind focused controllers and components.
- Remove the giant controller/prop bag rather than renaming it.
- Make AppShell responsible for page selection and composition.

Commit checkpoint: `chore: slim app shell orchestration`

### Phase 4 exit criteria

- `app-state.ts` is approximately 500–600 lines.
- The renderer state public surface has fewer than ten domain namespaces.
- `AppShell.vue` is below roughly 900 lines, has roughly 10–15 domain props,
  and fewer than 20 emits.
- The focused AppShell spec completes in 2.5 seconds or less on the reference
  machine.
- Domain behavior is covered directly and composition coverage remains.
- `npm run test:ai` passes.

## Phase 5 — Deep feature modules

These lanes may run in parallel after phase 4 because each owns a distinct
feature surface. Assign exclusive file ownership and integrate each checkpoint
independently.

### 5.1 Automations lane

- Separate automation location state from editing state.
- Introduce a focused view model for validation, scheduling, and execution
  intent.
- Keep the view responsible for rendering and user interaction.

Commit checkpoint: `chore: simplify automation orchestration`

Exit: the automation view is approximately 450–500 lines and domain policy has
direct tests.

### 5.2 Git workflow lane

- Split merge, squash, pull request, cleanup, handoff, and background-progress
  behavior into operation-owned workflows.
- Make dialogs present typed workflow state rather than coordinating Git.
- Preserve progress, cancellation, cleanup safety, and report-back behavior.

Commit checkpoint: `chore: split git workflow controls`

Exit: the Git workflow parent is approximately 350 lines, with operation detail
owned and tested below it.

### 5.3 Repository backlog lane

- Separate row rendering, filtering/projection, selection, and assignment.
- Keep issue/PR pickup and work-routing policy outside presentation components.
- Preserve bulk selection and empty/loading/list height behavior.

Commit checkpoint: `chore: split repository backlog responsibilities`

Exit: backlog views are approximately 450–500 lines and each responsibility
has a direct owner.

### 5.4 Annotation lane

- Extract a DOM-free annotation session model.
- Move shape creation, selection, editing, history, and export transitions into
  that model.
- Keep canvas and pointer adapters at the component boundary.

Commit checkpoint: `chore: extract annotation session state`

Exit: the annotation view is approximately 450–500 lines and state transitions
are testable without mounting a canvas.

### Phase 5 exit criteria

- Every lane meets its local size and ownership target.
- Feature parents compose deep modules rather than forwarding giant prop/event
  surfaces.
- Parallel branches integrate without duplicated policies or test coverage.
- `npm run test:ai` passes after all four lanes are integrated.

## Phase 6 — Provider internals

### 6.1 Deepen Codex provider modules

- Extract pure projections from protocol events to app-owned events.
- Give session caching one owner with explicit invalidation.
- Isolate transport/event translation from lifecycle orchestration.

Commit checkpoint: `chore: deepen codex provider modules`

### 6.2 Deepen Claude provider modules

- Model plan and context preparation before implementing turn-state behavior.
- Introduce an explicit turn state machine.
- Preserve provider-specific semantics behind `AgentBackendDriver`.

Commit checkpoint: `chore: deepen claude provider modules`

Do not introduce a shared provider abstraction merely because two files have
similar shapes. Share only proven domain concepts with matching semantics.

### Phase 6 exit criteria

- Provider transports, caches, projections, and lifecycle state have distinct
  owners.
- Codex- and Claude-specific data does not escape their drivers.
- Any shared abstraction is supported by real identical semantics, not visual
  similarity.
- `npm run test:ai` passes.

## Phase 7 — Consolidation and qualification

### 7.1 Remove transitional debt

- Delete temporary façades, compatibility exports, dead code, obsolete tests,
  and duplicate integration coverage.
- Confirm no architectural migration TODO remains undocumented.
- Update architecture, backend, protocol, frontend, provider, and testing docs
  to match the final ownership model.

### 7.2 Run full qualification

- Run the full tests three times and record the median.
- Compare the median with the 25.01s baseline.
- Target Vue tests below 14 seconds.
- Keep the full test suite at or below the 25.01s baseline.
- Verify coverage remains at or above 85% for statements, branches, functions,
  and lines.
- Run typecheck, lint, knip, coverage, backend build, and an unsigned Electron
  build.
- Record final line counts, interface counts, test counts, timings, and key
  learnings in this plan.

Commit checkpoint: `chore: complete codebase hardening`

### Phase 7 exit criteria

- No temporary façade, obsolete compatibility path, or duplicate detailed test
  remains.
- Documentation matches the shipped architecture.
- All qualification gates pass.
- Final metrics and learnings are recorded below.

## Final definition of complete

The program is complete only when all of the following are true:

- each behavior has one authoritative owner;
- requests and events are typed end to end;
- Electron and Vue contain adapter and presentation logic, not backend policy;
- high-level orchestrators are composition façades with small interfaces;
- tests follow ownership and do not repeatedly exercise detailed behavior
  through the application shell;
- no obsolete compatibility code or stale architecture documentation remains;
- every checkpoint and phase has evidence in the progress ledger;
- full tests, typecheck, lint, knip, coverage, backend build, and unsigned
  Electron build pass;
- coverage is at least 85% across statements, branches, functions, and lines;
- final performance is measured against the recorded baseline.

## Final metrics and learnings

Complete this section during phase 7.

### Metrics

- Full test count and median duration: pending
- Vue test count and median duration: pending
- Coverage: pending
- Major orchestrator before/after sizes: pending
- Public interface before/after counts: pending
- Transitional façades removed: pending

### Learnings

- Pending.
