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
| Typed backend protocol | 13 of 156 methods |
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
- [x] Phase 0.1: resolve the update-badge change separately.
- [x] Phase 0.2: align stale architecture documentation.
- [ ] Phase 0.3: split oversized test suites along ownership boundaries. **Active.**
- [ ] Phase 1: harden core state and contracts.
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
| 2026-09-04 | Phase 0.2: architecture documentation | Complete | documentation agent / plan steward | Bench docs already current; stale `shared` workspace and source paths → current `core` terminology and paths | Docs-only review; `git diff --check` and `git diff --cached --check` passed; runtime tests not applicable | `chore: align architecture documentation` (this commit) | Audit corrected: Bench was not stale; phase 0.3 is next |

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

Commit checkpoint: `chore: extract snapshot reducers`

### 1.4 Make event reduction honest and typed

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
