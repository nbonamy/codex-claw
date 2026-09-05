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
- [ ] Phase 1: harden core state and contracts. **Phase 1.5 checkpoint 4 active — extract work contracts.**
- [x] Phase 1.1: consolidate agent state ownership.
- [x] Phase 1.2: extract snapshot construction.
- [x] Phase 1.3: extract deep snapshot reducers.
- [x] Phase 1.3a: extract the subagent reducer.
- [x] Phase 1.3b: extract the runtime/global reducer.
- [x] Phase 1.3c: extract the conversation reducer.
- [x] Phase 1.4 slice 1: type connection and annotation events.
- [x] Phase 1.4 slice 2: type backend status, catalogs, and pairing events.
- [x] Phase 1.4 slice 3: type side-panel, celebration, creation, and Git progress events.
- [x] Phase 1.4 slice 4: type backlog, routing, and client-resolution events.
- [x] Phase 1.4 slice 5: type provider-discriminated agent and thread events.
- [x] Phase 1.4 slice 6: type subagent change events.
- [x] Phase 1.4 slice 7: type turn, plan, and compaction events.
- [x] Phase 1.4 slice 8: type transcript and prompt events.
- [x] Phase 1.4 slice 9: type tool lifecycle and workspace events.
- [x] Phase 1.4 slice 10: type approvals, input requests, and errors.
- [x] Phase 1.4 slice 11: type snapshot metadata events.
- [x] Phase 1.4 slice 12: deepen snapshot decoding and classify adoption.
- [x] Phase 1.4 slice 12a: add the deep snapshot decoder and Core characterizations.
- [x] Phase 1.4 slice 12b: migrate mixed snapshot callers and add boundary regressions.
- [x] Phase 1.4 slice 13: add typed decoding at every backend-event wire ingress.
- [x] Phase 1.4 slice 13a: add the Core wire-event decoder and characterizations.
- [x] Phase 1.4 slice 13b: decode local Electron and Web backend events.
- [x] Phase 1.4 slice 13c: decode remote backend events.
- [x] Phase 1.4 slice 14: close event ownership and remove redundant guards.
- [x] Phase 1.4 slice 14a: close the backend event union.
- [x] Phase 1.4 slice 14b: route backend events exhaustively.
- [x] Phase 1.4 slice 14c: trust decoded backend events downstream.
- [x] Phase 1.4 slice 14d: simplify renderer event handling.
- [ ] Phase 1.5: split contract domains. **Checkpoint 4 active — extract work contracts.**
- [x] Phase 1.5 checkpoint 1: extract shared repository contracts.
- [x] Phase 1.5 checkpoint 2: extract backend contracts.
- [x] Phase 1.5 checkpoint 3: extract conversation contracts.
- [ ] Phase 1.5 checkpoint 4: extract work contracts.
- [ ] Phase 1 decision gate: review Phase 1 outcomes with Nicolas and obtain explicit approval before any Phase 2 implementation.
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
| 2026-09-04 | Phase 1.4 slice 2: type backend status, catalogs, and pairing events | Complete | core event agent / root integrator | Five event variants now discriminate backend runtime status, account rate limits, model catalog, skill catalog, and device pairing status; `emitThread` became distributive so typed payloads remain paired with their event variant | Focused: Core 30 tests; Backend 92; Electron 25; Vue 20. Full `npm run test:ai`: 270 files / 2,053 tests. All-workspace typecheck passed. Lint, CSS lint, and Knip passed with only the existing non-failing `lipo` hint. Diff and status checks were clean | `4fce85fee7b6c7d89f94f30dddd4e56a35ef0591` | Independent review found no defects. Runtime semantics and the deferred wire decoder remain unchanged: no agent/thread/source requirements were added; flat rate-limit normalization and catalog/pairing guards remain; envelope/payload backend equality is not enforced; existing boundary casts remain deferred |
| 2026-09-04 | Phase 1.4 slice 3: type UI and operation progress events | Complete | core event agent / root integrator | Five agent-scoped variants now discriminate side-panel markdown, side-panel Git diff, celebration, agent creation progress, and Git operation progress; only envelope `agentId` is required | Focused: Core 18 tests; Backend 52; Electron 14; Vue 44. Full `npm run test:ai`: 270 files / 2,053 tests, real 26.89s with one slow Vue run. All-workspace typecheck: 19.72s. Lint, CSS lint, and Knip: 21.60s with only the existing non-failing `lipo` hint. Diff and status checks were clean | `0c6db21a458fc06f3754d7758733d45dbe85e8a7` | Independent review found no defects. Nullable Git-diff `subtitle` is narrowly correct because `openDiff` already forwards `agent.folder: string \| null`; `AppText` and other event shapes remain strict. Malformed casts remain deliberate boundary tests. Caller-versus-created agent identity, source-less compatibility, snapshot no-op/unread behavior, producers, consumers, guards, and decoders are unchanged |
| 2026-09-04 | Phase 1.4 slice 4: type backlog, routing, and client resolution events | Complete | core event agent / root integrator | Four variants now discriminate backlog-assignment compatibility, routing request, routing resolution, and client-request resolution; the first three remain global, while `clientRequest.resolved` requires `agentId` and `backend` | Focused: Core 19 tests; Vue 21. Full `npm run test:ai`: 270 files / 2,054 tests, real 49.32s with an anomalously slow 31.84s Vue run. All-workspace typecheck: 31.37s. Lint, CSS lint, and Knip: 34.22s with only the existing non-failing `lipo` hint. Diff and status checks were clean | `e3b3caa4946944e306da2a07356fb16f1b976b1c` | Independent review found no defects. `working` → `inProgress`, optional policy defaults, trimmed notes and automation IDs, payload-owned routing agent identity, absence of `loopId`, malformed-event no-ops, runtime guards, and deferred decoder casts are preserved |
| 2026-09-04 | Phase 1.4 slice 5: type provider-discriminated agent and thread events | Complete | core event agent / root integrator | Eight variants now discriminate backend-neutral agent update/status plus provider-specific thread start, settings, mode, goal update/clear, and token usage; `CodexThreadSettings` is the cohesive payload owner | Focused: Core 19, Backend 74, Vue 30, Electron 14, and Web 7 tests. Full `npm run test:ai`: 270 files / 2,054 tests, real 33.97s with Vue at 22.78s. All-workspace typecheck: 38.72s. Lint, CSS lint, and Knip: 42.41s with only the existing non-failing `lipo` hint. Diff and status checks were clean | `132609b8411cdff9b48a4642cac57fcb89647cfc` | Review tightened Codex start/settings/mode backend context, goal thread context, and token backend/thread context; explicitly characterized the legacy backend-less start at the runtime boundary; and removed the obsolete `AgentStatus` cast. Flat/nested normalization, null status-text deletion, malformed handled no-ops, runtime guards, and deferred wire casts remain intact |
| 2026-09-04 | Phase 1.4 slice 6: type subagent change events | Complete | core event agent / root integrator | Four variants now discriminate operation, activity, identity, and status changes with their existing payload owners; all require `agentId`, `backend`, and `threadId`, while `turnId` and `source` remain optional | Focused: Core 14, Backend 47, and Vue 18 tests. Full `npm run test:ai`: 270 files / 2,056 tests, real 25.82s (Core 245, Backend 611, Vue 896, Electron 283, Web 21). All-workspace typecheck: 24.30s. Lint, CSS lint, and Knip: 26.25s with only the existing non-failing `lipo` hint. Diff and status checks were clean | `ac4dda653c167798627880a0cf2ad4ce519b1050` | Independent review found no defects. Payload/envelope identity independence, validators, malformed owned no-ops, the missing-agent gate, root ignore, receiver cloning, identity/status deletion and timestamps, and unread exclusion are preserved. Runtime producers, reducers, decoders, and deferred generic/wire casts remain unchanged; the sole new cast characterizes malformed boundary input |
| 2026-09-04 | Phase 1.4 slice 7: type turn, plan, and compaction events | Complete | core event agent / root integrator | Seven variants now discriminate turn start/completion, execution-plan update, proposed-plan delta/completion, and compaction start/completion with the audited context split and provider-compatible payload unions | Focused: Core 42, Backend 81, Electron 14, Vue 39, and Web 7 tests. Full `npm run test:ai`: 270 files / 2,059 tests, real 26.28s (Core 248, Backend 611, Vue 896, Electron 283, Web 21). All-workspace typecheck: 23.25s. Lint, CSS lint, and Knip: 25.93s with only the existing non-failing `lipo` hint. Diff and status checks were clean | `ce8257d304162a7048e2485a71132d5e8d5f723d` | Independent review found no defects. Optional completion diagnostics, normalized plan authority, proposed-plan whitespace and trimming, interrupted completion, compaction markers, malformed-start payload compatibility, missing-context no-ops, runtime guards, and deferred casts remain intact; all 13 fixture adaptations and five boundary casts were scoped |
| 2026-09-04 | Phase 1.4 slice 8: type transcript and prompt events | Complete | core event agent / root integrator | Eight variants now discriminate history hydration, message delta/update/submission/steer, and prompt queue/retry/dequeue with their audited context split and cohesive private payload aliases | Focused: Core 74, Backend 105, Electron 14, and Vue 61 tests. Full `npm run test:ai`: 270 files / 2,059 tests, real 25.08s (Core 248, Backend 611, Vue 896, Electron 283, Web 21). All-workspace typecheck: 23.52s. Lint, CSS lint, and Knip: 25.53s with only the existing non-failing `lipo` hint. Diff and status checks were clean | `52349cf6670f7c529234977866975c4c7b052717` | Independent review found no defects. Claude-optional thread/message/item IDs, strict message-update context, agent-only generic events, live history pagination flags, readonly attachments, queue semantics, message-agent filtering, source-less compatibility, runtime guards, and deferred casts remain intact; two indexed-access reducer edits are behavior-equivalent and all six boundary casts are deliberate |
| 2026-09-04 | Phase 1.4 slice 9: type tool lifecycle and workspace events | Complete | core event agent / root integrator | Six variants now discriminate tool item start/update/completion, turn diff, file activity, and agent Git status using existing payload owners plus narrow private lifecycle/update aliases | Focused: Core 60, Backend 74, Electron 14, and Vue 9 tests. Full `npm run test:ai`: 270 files / 2,062 tests, real 25.17s (Core 251, Backend 611, Vue 896, Electron 283, Web 21). All-workspace typecheck: 21.78s. Lint, CSS lint, and Knip: 24.06s with only the existing non-failing `lipo` hint. Diff and status checks were clean | `2d7718292cbcd77f262347b0de17a153bf14e3f2` | Independent review found no defects. Optional item `messageId` and thread context, arbitrary tool kinds, field/null/body/output/metadata patch semantics, coupled asymmetric diff validation, unknown-agent Git status, the legacy `branch: null` boundary case, renderer-only file-path trimming, missing-context no-ops, runtime guards, and deferred casts remain intact. Claude's conditional branch split and the reducer cast removal are behavior-equivalent; `output: null` → body `"null"` remains explicitly characterized |
| 2026-09-04 | Phase 1.4 slice 10: type approvals, input requests, and errors | Complete | core event agent / root integrator | Five event types now discriminate provider-specific tool approval and user input, native Codex approval request/resolution, and agent error with exact payload owners and contexts | Focused: Core 23, Backend 74, and Vue 56 tests. Full `npm run test:ai`: 270 files / 2,065 tests, real 24.77s (Core 254, Backend 611, Vue 896, Electron 283, Web 21). All-workspace typecheck: 22.42s. Lint, CSS lint, and Knip: 24.36s with only the existing non-failing `lipo` hint. Diff and status checks were clean | `48e1875d257e071189c9239f66ce984611d8865e` | Independent review found no defects. Exact native resolution reasons, conditional producer splits, dormant global resolution, retry/terminal/error-fallback semantics, missing-turn and malformed status quirks, registry owning-agent fallback, nested/flat approval parsing, renderer narrowing, guards, and deferred casts remain intact. All ten casts are deliberate malformed, legacy, or source-less boundary characterizations; no hidden behavior expansion was introduced |
| 2026-09-04 | Phase 1.4 slice 11: type snapshot metadata events | Complete | core event agent / root integrator | `snapshot.updated` now carries `AppSnapshotMetadata` with no required envelope context; the inherited full-snapshot side channel and `ClawBackendEvent`-only client state remain distinct | Focused: Core 28, Backend 23, Electron 14, Vue 43, and Web 10 tests. Full `npm run test:ai`: 270 files / 2,066 tests, real 24.98s (Core 255, Backend 611, Vue 896, Electron 283, Web 21). All-workspace typecheck: 22.17s. Lint, CSS lint, and Knip: 23.89s with only the existing non-failing `lipo` hint. Diff and status checks were clean | `ad873e85cf138ceda1577f38e451f4afe0692260` | Independent review found no defects. The fallback now becomes actual `never` once every event is typed, preventing an impossible catch-all member from widening `Extract` payloads back to `unknown`. Side-channel/full/metadata precedence, transcript replacement or retention, optimistic selection, unread pruning, legacy full producers, remote projection and local client-state recomputation, shallow guards, and malformed boundary cases remain unchanged; the sole new cast characterizes malformed metadata |
| 2026-09-04 | Phase 1.4 slice 12a: deep snapshot decoder | Complete | core snapshot agent / root integrator | Public façade: 32 lines; private metadata/collection/primitive leaves: 531 / 180 / 51 lines; exactly five façade exports and no dependency cycles | 51 malformed nested cases; focused 16 tests and Core 263 tests passed; full `npm run test:ai`: 271 files / 2,074 tests in 24.92s; all-workspace typecheck and lint/Knip passed; guard coverage 100% lines/functions and 97.97% branches | `22c6f7e9eb3a5ccd3e1fdf8fdd2dfda55584dbe9` | One identity-preserving, linear decoder now classifies full versus metadata snapshots, rejects present malformed `messages` without downgrade, permits additive fields, and remains separate from persistence restoration |
| 2026-09-04 | Phase 1.4 slice 12b: classified snapshot adoption | Complete | snapshot boundary agent / root integrator | All mixed boundaries now decode once and branch on classification: backend remote results, remote-team events, Core runtime reduction, Electron synchronization/transient/cache replicas, and Vue adoption; full-only guards remain where only a complete snapshot is valid | Focused: Core 30, Backend 54, Electron 14, and Vue 18 tests. Full `npm run test:ai`: 272 files / 2,077 tests in 28.02s. All-workspace typecheck and lint/Knip passed | `79572a0db1d821ed30ca3a7a5fc4f998aca889b0` | Review found and fixed an invalid full snapshot downgrading to metadata. Persistence remains separate and permissive; full/metadata precedence, transcript replacement/retention, cache behavior, selection, unread state, remote projection, and receiving-server client-state recomputation remain intact |
| 2026-09-04 | Phase 1.4 slice 13a: typed wire-event decoder | Complete | core event decoder agent / root integrator | Public API: two symbols; 225-line façade plus private leaves from 85 to 479 lines; exhaustive 55-key compile-time/runtime registry; moved event type block remained byte-identical | Decoder preserves valid event identity and reports safe structural path/reason diagnostics without payload values. Focused coverage: 94.79% statements / 90.24% branches / 95.67% functions / 95.52% lines. Core: 42 files / 275 tests. Full `npm run test:ai`: 274 files / 2,089 tests. All-workspace typecheck, lint, stylelint, Knip, and diff checks passed; Madge found no cycles across 95 files | `96151235f08d9e26c1e64f0324eabf3992f817de` | Structure-only decoding landed without normalization, semantic cross-field checks, or transport changes. Compatibility re-exports preserve the prior RPC import surface while transport adoption proceeds |
| 2026-09-04 | Phase 1.4 slice 13b: local transport decoder adoption | Complete | local transport agent / root integrator | Electron `backend-rpc-session` and Web `backend-process` typed casts → one decode from `unknown` at each local notification ingress | 34 focused tests passed. Full `npm run test:ai`: 274 files / 2,092 tests in 26.48s (Core 275, Backend 613, Vue 897, Electron 285, Web 22). All-workspace typecheck, Stylelint, Knip, and diff checks passed | `b1058b2da5874955342703f87389f22635cccdb6` | Independent review found no defects. Malformed events are safely logged and dropped without publication; each transport remains usable for subsequent valid events. Existing malformed JSON and JSON-RPC framing behavior is unchanged |
| 2026-09-04 | Phase 1.4 slice 13c: remote transport decoder adoption | Complete | remote transport agent / root integrator | All four production ingress seams now decode backend events exactly once; no shallow ingress guard or raw `ClawBackendEvent` cast remains except the decoder's validated return and one deliberate malformed fixture | Full `npm run test:ai`: 274 files / 2,095 tests in 24.97s. All-workspace typecheck, lint, Stylelint, Knip, Madge, and diff checks passed | `0779e2a558713d29b6d10890daec5ded6a66d2ce` | Malformed remote events are safely logged and dropped while connections and pending requests survive; malformed framing behavior is unchanged. Review fixed Web parsing to preserve both outer-envelope and inner-event identity. Protocol and backend-architecture docs now describe all transport boundaries |
| 2026-09-04 | Phase 1.4 slice 14a: close the backend event union | Complete | event ownership agent / root integrator | `contracts.ts` 2,263 → 2,140 lines; AST inventory proves 59 discriminated members / 55 unique keys with four provider duplicates and an exact disjoint 14 runtime + 24 conversation + four subagent + 13 renderer-only partition; typed union and envelope are byte-identical after removing only the fallback (`4b340028…`) | Full `npm run test:ai`: 275 files / 2,097 tests in 25.677s. All-workspace typecheck, lint, Stylelint, Knip, Madge, and diff checks passed. Core coverage: 91.84% statements / 86.15% branches / 93.28% functions / 93.46% lines; ownership module: 100% | `06583fb3eabb3eed9f96b9bcf4c07d82d18e3e03` | No generic fallback, duplicate event-name union, obsolete typed/untyped alias, hidden cast, or weakened type remains; renderer-only events are explicit state-preserving no-ops and the dormant global approval-resolution no-op remains characterized. Repository-wide coverage remains pre-existing red and is not reported green: Backend 83.76% statements / 73.64% branches; Vue 88.12% statements / 79.87% branches; Electron 68.33% statements / 67.11% branches / 62.69% functions / 70.89% lines |
| 2026-09-04 | Phase 1.4 slice 14b: route backend events exhaustively | Complete | event routing agent / root integrator | The exact 55-key ownership partition routes 14 runtime, 24 conversation, four subagent, and 13 renderer-only events once; reducer inputs are exact owned subsets, return `void`, and close with compile-time `never`; façade invalidation and dispatch ordering remain unchanged | Focused 11 files / 89 tests; Core 44 / 279. Full `npm run test:ai`: 276 files / 2,099 tests in 26.09s. Core coverage: 91.48% statements / 85.83% branches / 93.28% functions / 93.25% lines. All-workspace typecheck, lint, Stylelint, Knip, Madge, and diff checks passed | `6e14cfe3c72b8948dca3f341162c39e9d346fbef` | Independent review found no defects. The removed `thread.modeUpdated` runtime branch was unreachable behind renderer ownership; agent-less `backendApproval.resolved` remains an explicit no-op, while agent-scoped resolution still removes only that agent's approval |
| 2026-09-04 | Phase 1.4 slice 14c: trust decoded backend events downstream | Complete | downstream event agent / root integrator | Production downstream handling: 5,462 → 5,033 lines, net -429; 23 redundant structural helpers removed; 63 / 63 runtime cases retained | Full `npm run test:ai`: 276 files / 2,099 tests in 24.81s. Core coverage: 91.75% statements / 85.18% branches / 93.21% functions / 93.57% lines. Backend's known coverage debt remains explicit at 83.78% / 73.57% / 87.95% / 85.70% across 614 tests. All-workspace typecheck, lint, Knip, Madge, and diff checks passed | `3bc7ca4af524ad69ea891e900b0d5a7591deadee` | All audited policy, security, identity, normalization, malformed-input, and compatibility gates remain. Only post-decoder structural duplication and stale casts were removed; renderer simplification is the sole active checkpoint |
| 2026-09-04 | Phase 1.4 slice 14d: simplify renderer event handling | Complete | renderer event agent / root integrator | Renderer event production 4,330 → 4,291 lines, net -39; ten redundant validators removed; exact 13 / 13 renderer event switch retained; the typed client bypass remains the only non-decoded application boundary | Full `npm run test:ai`: 276 files / 2,099 tests in 26.44s. Vue's known global coverage debt remains explicit at 88.19% statements / 79.83% branches / 89.42% functions / 90.51% lines. All-workspace typecheck, lint, Stylelint, Knip, Madge, and diff checks passed | `34d439bb8942922917f51e8bac92e1b299cf66a0` | Renderer dispatch is exhaustive and decoded event payloads are trusted without redundant structural guards. Ordering, state policy, source-less compatibility, typed client bypass behavior, and ignored renderer events remain unchanged; Phase 1.5 contract extraction followed |
| 2026-09-04 | Phase 1.5: contract-domain manifest | Active / prepared | root orchestrator | `contracts.ts`: 2,140 lines; 214 exports plus 28 private declarations = 242 symbols; `CodexClawApi`: 132 members; 55 event keys; 317 consumers across Core 62 / Backend 73 / Electron 27 / Vue 152 / Web 3 | Read-only declaration, runtime-identity, API-signature, event-ownership, consumer, dependency, and move-order audit complete | — | Checkpoints 1 through 3 are complete; checkpoint 4, `chore: extract work contracts`, is active. Preserve 214 exports, 28 private declarations, seven runtime constant identities, 132 API signatures, and the 55-key event registry. Exit with a barrel below 30 lines, zero internal barrel imports, no cycles, and every target module within its recorded size bound |
| 2026-09-04 | Phase 1.5 checkpoint 1: extract shared repository contracts | Complete | contract-domain agent / root integrator | Exact ownership: shared five declarations / 12 lines, Git 19 / 112, workspace 12 / 86, connections 10 / 75; compatibility barrel 2,140 → 1,961 lines | All 46 moved declarations retained byte-identical source and normalized AST hashes; all 196 remaining declarations and 28 private aliases stayed exact; the barrel retained the same 214 exports and all 317 audited consumers remained untouched. Focused 3 tests and Core 45 files / 282 tests passed. Full `npm run test:ai`: 277 files / 2,102 tests. All-workspace typecheck, lint, Stylelint, Knip, static import inventory, Madge, and diff checks passed | `469d19aaf44d6fc2ff4cd383e61d3460bc8d3e0d` | Independent review found no defects. All four owners are type-only acyclic leaves with exact assigned export surfaces; no runtime value moved and compatibility imports/re-exports remain honest. Checkpoint 2 is now the sole active checkpoint |
| 2026-09-04 | Phase 1.5 checkpoint 2: extract backend contracts | Complete | contract-domain agent / root integrator | Backend owner: 21 exact exports / 201 lines with `shared` as its only dependency; compatibility barrel 1,961 → 1,802 lines | All 21 moved declarations, all 175 retained declarations, and all 28 private declarations remained byte- and AST-identical. Moved source SHA-256 `9a52be69a3388d91f36c8143798e1f65888dd7cc99fe5139562c7fe56e348d6d`; moved AST SHA-256 `407e848886e8eed89304b8ebf717afaea74519eadc7601092ffe923c1d30ca9e`; retained source SHA-256 `b5d722df3a1383eadf4d2ea00d950f1b59623ddd5060b97d68f6f5ec381e54a5`. The barrel retained all 214 public exports. Focused contract/backend/event/snapshot: 22 files / 131 tests; Core: 45 / 282. Full `npm run test:ai`: 277 files / 2,102 tests. All-workspace typecheck, lint, Stylelint, Knip, consumer inventory, Madge, and diff checks passed | `a3992ed47cdf819e2fecb44776846f19c90397c4` | Independent review found no defects, domain leakage, runtime-value movement, or consumer edits. Checkpoint 3 is now the sole active checkpoint |
| 2026-09-04 | Phase 1.5 checkpoint 3: extract conversation contracts | Complete | contract-domain agent / root integrator | Conversation owner: 43 exact exports / 334 lines with `shared` as its only dependency; compatibility barrel 1,802 → 1,545 lines | Exact categories: seven goal/plan, two conversation reference/summary, 18 subagent including five runtime arrays, the complete six-type prompt cluster, and ten renderer-message/file/queue/history symbols. All 43 moved and 132 retained declarations remained byte- and AST-identical in source order; the barrel retained all 214 public exports and all five moved runtime arrays preserved owner-to-barrel reference identity. Focused domain: four tests; Core: 45 files / 283 tests. Full `npm run test:ai`: 277 files / 2,103 tests. All-workspace typecheck, lint, Stylelint, Knip, Madge, and diff checks passed | `f37512ab56c4fd82b43393b63ed4ef42094b34bf` | Independent review found no defects, consumer changes, private leakage, or cycles. Checkpoint 4 is now the sole active checkpoint |
| 2026-09-04 | Phase 2.1: source workspace request manifest | Pending | root orchestrator | Prepared future move: `driver-rpc.ts` 466 lines / 47 cases, including 11 source/file/worktree cases; `server.ts` 2,759 lines / 102 cases; typed protocol baseline corrected to 12/156 methods | Read-only request, protocol, authority, filesystem-security, and test inventory complete | — | Introduce a deep source-workspace request owner with parsing, authoritative agent-folder resolution, local/remote routing, initialization, persistence, and error policy; retain filesystem confinement, symlink protection, size caps, remote stripping, and shared worktree ownership. Target driver dispatch 47 → 36 cases, server ≤93 cases, and typed protocol 23/154 after removing two obsolete internal file methods. Execute only after Phase 1 |
| 2026-09-04 | Phase 2.6: backend event coordination manifest | Pending / prepared | root orchestrator | `server.ts` currently owns about 299 event-coordination lines across 20 methods and six helpers; target owner is `backend/src/events/backend-event-coordinator.ts` | Read-only event ingestion, publication, persistence, remote forwarding, transcript, and lifecycle audit complete; implementation waits for the Phase 2 routing and source-workspace seams | — | Execute as four commits: `test: characterize backend event coordination`; `chore: extract backend event publication`; `chore: extract backend event coordination`; `test: move backend event ownership specifications`. Preserve event ordering, persistence-before-publication, remote projection/forwarding, and transcript invariants. Every substantial move uses `lossless-code-moves` with byte/AST fidelity. Exit: remove at least 290 net lines from `server.ts`, coordinator below 450 lines, and server event specs at or below 180 lines |
| 2026-09-04 | Phase 2.7: persistence codec manifest | Pending / prepared | root orchestrator | `backend/src/state-persistence.ts`: 1,357 lines / 71 functions / 81 `if` statements; main spec: 1,269 lines / 32 tests plus seven state-spec tests | Read-only codec, migration, recovery, topology, and test-ownership audit complete; split owners by app-state, agent, subagent, work, topology, and codec-values while retaining the load/save façade | — | Execute the seven recorded commits in order with declaration and test-body hashes for every lossless move. Preserve shape-based migrations, semantic recovery, and current invalid-JSON propagation. Exit: façade ≤140 lines, app-state ≤200, agent/work ≤450, topology ≤220, subagent ≤150, and every spec ≤600 lines |
| 2026-09-04 | Phase 3.1: Electron backend replica manifest | Pending / prepared | root orchestrator | `AppController` 1,863 lines; replica responsibility about 205 lines / 29 conditionals; 47 full-snapshot and four metadata callers | Read-only snapshot/event replication and test-ownership audit complete; target owner is `electron-backend-replica.ts` | — | Execute three exact commits: `test: characterize electron backend replication`, `chore: extract electron backend replica`, `test: move electron backend replica specifications`. Preserve raw/transient identity, metadata-only cache, three-attempt sequence barrier, event/client-state/publication ordering, and renderer-only media projection; remote automation remains outside |
| 2026-09-04 | Phase 3.2: Electron IPC registrar manifest | Pending / prepared | root orchestrator | `AppController` 1,863 lines / 155 methods; `registerIpcHandlers` 393 lines with 120 inline registrations plus nine existing Git registrations, for 129 total; preload 150 lines with 129 invokes and three subscriptions; six specs total 2,860 lines / 72 tests | Read-only registration, preload bridge, helper, and test-ownership audit complete; exact 129 invoke channels plus three subscriptions must remain covered | — | Execute seven exact commits: `test: characterize electron ipc surface`; `chore: extract connection work and source ipc`; `chore: extract agent and automation ipc`; `chore: extract native electron ipc registrars`; `chore: split electron ipc adapters`; `chore: compose typed preload bridge`; `test: move electron ipc ownership specifications`. Exclude private `updateAgentFolder`. Target registration composition at most 35 lines with zero inline handlers, `AppController` after 3.1+3.2 at most 650 lines, each registrar at most 22 channels / four ports / 300 lines, preload index at most 30 lines and modules at most 90, specs at most 400, with lossless handler/helper/test fidelity |
| 2026-09-04 | Phase 4.1: constructible renderer state manifest | Pending / prepared | root orchestrator | `app-state.ts` 1,842 lines / 27 module-state bindings / 164 façade members; child stores total 1,215 lines; seven specs total 4,932 lines / 116 runtime cases, with 112 singleton imports and 111 global mutations | Read-only dependency, singleton, lifecycle, façade, and test-ownership audit complete; target owner is `createAppState(deps)` with seven ports for API, host, platform, celebration, onboarding, scheduler, and random behavior | — | Execute three exact commits: `chore: inject renderer state dependencies`; `chore: make renderer state constructible`; `test: isolate renderer state specifications`. Preserve fixed dependency identity and all 164 existing façade keys plus `dispose`; `dispose` cleans subscriptions and timers only. Prove AST/body fidelity and all 115 declarations / 116 runtime cases. Exit with a thin singleton wrapper at most 35 lines and zero singleton imports or global mutations in tests; defer domain splitting to Phase 4.2 |
| 2026-09-04 | Phase 4.2: renderer state ownership manifest | Pending / prepared | root orchestrator | `app-state.ts` 1,842 lines / 164 façade members; function baselines: app 204, composer 76, history 14, unread 30, source 8, work 27; seven specs total 4,932 lines / 115 declarations / 116 runtime cases | Read-only state, command, projection, dependency, and test-ownership audit complete; target is eight acyclic domain namespaces plus `dispose`, with the replica as the sole writable snapshot and synchronization owner | — | Execute six exact commits: `chore: extract renderer replica state`; `chore: extract renderer conversation state`; `chore: extract renderer agent and workspace state`; `chore: extract renderer support state`; `test: move renderer state ownership specifications`; `chore: modularize renderer application state`. Preserve all 164 members with lossless AST/body/test hashes; temporary flat aliases exist only in commits 1–5 and disappear in commit 6. Target composition at 350–600 lines; replica four members / at most 400 lines, agents 24 / 450, conversation 58 / 650, workspace 20 / 350, Git nine / 110, work 18 / 400, automations seven / 180, system 24 / 300. No state module may exceed 700 lines, no spec 700 lines, and the composition spec stays at most 250. Domain modules do not import each other, use narrow ports, keep `isRemoteAutomationLocation` neutral, reuse the post-14d dispatcher, and do not touch AppShell |
| 2026-09-04 | Phase 4.3: AppShell controller coverage manifest | Pending / prepared | root orchestrator | `AppShell.vue`: 1,798 lines / 112 props / 39 emits / 95 top-level declarations; five AppShell specs: 4,414 lines / 108 tests / 109 mounts / 469 assertions in 5.91s | Read-only controller and test-seam audit complete. Preserve all 108 test names and callbacks plus all 469 assertion ASTs while moving at least 75 cases to direct controller ownership; reduce shell mounts to at most 30 | — | Execute four test-only commits: `test: cover shell command controller`; `test: cover shell workflow controllers`; `test: characterize shell controller seams`; `test: cover app shell controllers`. Keep exactly eight real-composition cases: active-agent shell composition; SDK conversation controller wiring; resume-session dialog wiring; active team/agent keyboard shortcuts; deterministic Markdown/approval Debug commands; Cockpit navigation and return; Automations navigation without a team; and Settings General/remembered-pane/appearance/quit composition. Target controller tests ≤250ms, specs ≤700 lines, temporary test files ≤500, final composition spec ≤250 lines / ≤2.5s, and zero production diff |
| 2026-09-04 | Phase 4.4: AppShell orchestration manifest | Pending / prepared | root orchestrator | `AppShell.vue`: 1,798 lines / 112 props / 39 emits / 95 declarations / 45 imports; `App.vue`: 627 lines with 153 AppShell bindings | Read-only production ownership and extraction audit complete. Final AppShell surface is nine domain props (`replica`, `agents`, `conversation`, `workspace`, `git`, `work`, `automations`, `system`, `updateStatus`) and three semantic emits (`closeAgent`, `pullRequestCleanup`, `installUpdate`) | — | Execute the eight recorded commits in order. Owners: conversation ≤320 lines, debug previews ≤220, agent/team dialogs ≤250 plus a repository-session owner, resource migration ≤90, commands ≤500. Exit with AppShell 650–850 lines, hard maximum 900, nine props, three emits, ≤35 declarations, ≤25 imports; App.vue ≤500 lines and 12 bindings; retain the eight composition smokes. Hash all 95 declarations, template subtrees, and the style block, and maintain a complete prop/emit ledger. Temporary dual props are allowed only in commits five through seven |
| 2026-09-04 | Phase 5.1: Automations lane manifest | Pending / prepared | root orchestrator | `AutomationsView.vue`: 804 lines / 19 props / about 64 declarations; `AutomationEditor.vue`: 340 lines / 11 declarations; six specs: 889 lines / 24 tests / 87 assertions / 24 mounts in 3.32s | Read-only location, editor, workflow, renderer-state, backend-policy, contract, and test-ownership audit complete | — | After Phase 4, compose five renderer namespace props and extract location state ≤260 lines, editor model ≤220, and workflow controller ≤280; target the view at 430–500 lines and editor at 230–260. Preserve interval scheduling rather than inventing cron; target 10–12 mounts, component time ≤1.5s, direct model/controller tests ≤250ms, and specs ≤500 lines. Execute the six exact commits in Phase 5.1 with lossless declaration, template, style, test-name, callback, and assertion fidelity |
| 2026-09-04 | Phase 5.2: Git workflow lane manifest | Pending / prepared | root orchestrator | `GitWorkflowControl.vue`: 1,326 lines; target parent approximately 350 lines with operation detail owned and tested below it | Read-only ownership and invariant audit complete. Merge, squash, pull request, cleanup, handoff, and background progress become operation-owned workflows; dialogs present typed state only while Backend remains the mutation authority | — | Preserve progress, cancellation and background continuation, worktree and branch cleanup safety, agent closure, handoff timing with authoritative PR or direct-merge context, and push-failure recovery. Phase 4's Git namespace must expose the operation-progress subscription consumed here. Rebaseline after Phase 4 before assigning detailed module size or intermediate commit targets; do not invent an unaudited sequence |
| 2026-09-04 | Phase 5.3: repository backlog lane manifest | Pending / prepared | root orchestrator | Active parents: `RepositoryBacklogPanel.vue` 1,310 lines, `CockpitWorkInbox.vue` 1,087, and `CockpitView.vue` 709; active specifications: 41 tests / 199 assertions / 45 mounts in 3.30s; active plus legacy and routing coverage: 63 tests. Orphan `WorkBacklogPanel.vue` remains a separate 668-line retirement decision | Read-only component, projection, workflow, row, selection, routing, and test audit complete. Repository and Cockpit semantics differ, so share contracts and routing seams rather than rows or projections | — | Execute the nine exact commits recorded in Phase 5.3. Target each backlog parent at 450–500 lines, `CockpitView.vue` at most 500, component mounts at most 14, and aggregate component time at most 1.5s. Preserve fixed-height behavior and loading, empty/error, scope, and list parity without moving routing, Core, Backend, persistence, or remote policy. Carry five explicit debts: unused `createIssueAction` gate, unused remove-assignment chain, unmanaged 1,200ms timer, partial `Promise.all` effects, and unqualified item IDs |

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

Completed in `4fce85fee7b6c7d89f94f30dddd4e56a35ef0591`.

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

#### Slice 3 — side-panel, celebration, creation, and Git progress events

Completed in `0c6db21a458fc06f3754d7758733d45dbe85e8a7`.

- Type `sidePanel.markdownRequested` with payload
  `SidePanelMarkdownRequest`.
- Type `sidePanel.gitDiffRequested` with payload
  `SidePanelGitDiffRequest`.
- Type `celebration.requested` with payload `{ kind: CelebrationKind }`.
- Type `agentCreation.progress` with payload `AgentCreationProgress`.
- Type `git.operationProgress` with payload `AgentGitOperationProgress`.
- Require only the envelope `agentId` for all five events; do not require
  backend, thread, turn, or source.
- Preserve the creation-progress identity distinction: envelope `agentId` is
  the caller, while `payload.agentId` is the newly created agent when known.
- Preserve exact side-panel subtype mapping, snapshot no-op and unread
  behavior, and source-less fixtures and runtime guards.
- Malformed fixtures may require an explicit cast only at the boundary whose
  rejection or compatibility behavior they exercise; do not weaken ordinary
  fixtures to satisfy the new types.

#### Slice 4 — backlog, routing, and client-resolution events

Completed in `e3b3caa4946944e306da2a07356fb16f1b976b1c`.

- Type `workBacklog.assignmentUpdated` with the compatibility payload
  `Omit<WorkBacklogAssignment, 'policy' | 'status'> & {
  policy?: WorkBacklogAssignmentPolicy; status: WorkBacklogAssignmentStatus |
  'working' }`.
- Type `workRouting.requested` with payload `WorkRoutingRequest`.
- Type `workRouting.resolved` with payload
  `Pick<WorkRoutingRequest, 'id'>`.
- These first three events are global and require no envelope context.
- Type `clientRequest.resolved` with payload `Pick<ClientRequest, 'id'>`; it
  requires envelope `agentId` and `backend`.
- Preserve `working` → `inProgress` normalization, optional policy defaults,
  and trimming of notes and automation IDs.
- Keep a routing request's payload `agentId` independent from any envelope
  identity, and do not introduce `loopId`.
- Preserve malformed-event no-ops and existing runtime guards. Decoder casts
  remain deferred to their transport-decoding slice.

#### Slice 5 — provider-discriminated agent and thread events

Completed in `132609b8411cdff9b48a4642cac57fcb89647cfc`.

- Type `agent.updated` and `agent.statusChanged`; both require only envelope
  `agentId`.
- Type `thread.started` as a provider-discriminated event:
  - Codex requires `agentId`, `backend: 'codex'`, and `threadId`.
  - Claude requires `agentId`, `backend: 'claude'`, and `backendSessionId`, but
    does not require `threadId`.
- Type `thread.settingsUpdated` as Codex-only, requiring `agentId`,
  `backend: 'codex'`, and `threadId`.
- Type `thread.modeUpdated` with distinct Codex and Claude payload variants and
  their provider-specific envelope context.
- Type `thread.goalUpdated` with required `agentId` and `threadId`, accepting
  the existing flat `ThreadGoal` or nested `{ goal: ThreadGoal }` payload.
- Type `thread.goalCleared` with required `agentId` and an empty payload; do not
  require provider or thread context.
- Type `thread.tokenUsageUpdated` with required `agentId`, `backend`, and
  `threadId`, accepting the existing flat `AgentContextUsage` or nested
  `{ contextUsage: AgentContextUsage }` payload.
- Preserve partial agent-patch semantics, including the legacy
  `statusText: null` deletion path, and preserve accepted `AgentStatus` shapes.
- Preserve Codex settings normalization for approval preset, model, reasoning
  effort, and service tier; preserve provider-specific mode normalization and
  Claude session metadata without requiring a Claude thread ID.
- Characterize the legacy backend-less `thread.started` path explicitly rather
  than silently losing its current runtime behavior when the static contract
  becomes provider-discriminated.
- Keep flat and nested goal/token-usage compatibility, payload and envelope
  provider values independent where legacy behavior allows it, malformed-event
  no-ops, and existing runtime guards unchanged.
- Do not bundle deeper decoding or behavior changes. Boundary and wire casts
  remain deferred to the corresponding transport-decoding slice.

#### Slice 6 — subagent change events

Completed in `ac4dda653c167798627880a0cf2ad4ce519b1050`.

- Type `subagent.operationChanged` with payload `SubagentOperationChange`.
- Type `subagent.activityChanged` with payload `SubagentActivityChange`.
- Type `subagent.identityChanged` with payload `SubagentIdentityChange`.
- Type `subagent.statusChanged` with payload `SubagentStatusChange`.
- Require envelope `agentId`, `backend`, and `threadId` for all four events;
  keep `turnId`, `source`, and the remaining generic envelope metadata optional.
- Keep payload agent and conversation identities independent from envelope
  identity. Do not introduce equality checks that reject currently valid
  provider projections.
- Preserve malformed owned events as handled no-ops, the existing structural
  validators, and the legacy missing-agent gate.
- Preserve operation/activity normalization, identity replacement and deletion,
  status transition, and timestamp semantics exactly.
- Keep generic and wire-boundary casts deferred to their later decoder work;
  casts added in this slice may only characterize malformed boundary input.

#### Slice 7 — turn, plan, and compaction events

Completed in `ce8257d304162a7048e2485a71132d5e8d5f723d`.

- Type `turn.planUpdated`, `turn.proposedPlanDelta`, and
  `turn.proposedPlanCompleted` with required envelope `agentId`, `backend`,
  `threadId`, and `turnId`.
- Type `turn.started`, `turn.completed`, `context.compactionStarted`, and
  `context.compactionCompleted` with required envelope `agentId`, `backend`,
  and `turnId`; keep `threadId` optional for both providers and all four event
  families.
- Introduce cohesive payload aliases for the existing execution-plan update,
  proposed-plan delta, proposed-plan completion, and compaction shapes. Keep
  the turn-start and turn-completion payloads as provider-compatible unions,
  including the existing provider-neutral flat completion status and nested
  provider turn status accepted by the reducer.
- Preserve Codex and Claude envelope differences without requiring a thread
  where the provider does not currently supply one.
- Preserve execution-plan reconstruction and step-status normalization,
  proposed-plan incremental whitespace and completed-markdown trimming, and
  the rule that interrupted completion finalizes execution plans without
  rewriting already completed proposed plans.
- Preserve compaction marker insertion, completion, and de-duplication
  semantics, including empty Claude payloads and optional Codex `itemId`.
- Preserve the existing malformed `turn.started` payload being ignored. Do not
  change runtime guards or move deferred generic and wire-boundary casts into
  this slice.

#### Slice 8 — transcript and prompt events

Completed in `52349cf6670f7c529234977866975c4c7b052717`.

- Type `thread.historyLoaded` with required envelope `agentId` only. Its
  payload contains `messages: RendererMessage[]` plus optional `replace`,
  `preserveKnownTurns`, `preserveKnownMessages`, and `hasOlderMessages` flags.
- Type `message.delta` with required `agentId`, `backend`, and `turnId`, while
  keeping `threadId` optional for Claude. Its payload requires `delta` and
  keeps `messageId`, `itemId`, and commentary/final-answer `phase` optional.
- Type `message.updated` with payload `{ message: RendererMessage }` and
  required envelope `agentId`, `backend`, `threadId`, and `turnId`.
- Type `message.userSubmitted` with payload `{ message: RendererMessage }` and
  required `agentId` only.
- Type `message.steer` with required `agentId` only, optional turn context, and
  payload `{ prompt: string; attachments?: readonly PromptAttachment[] }`.
- Type `agent.promptQueued` with required `agentId` and a payload carrying
  prompt `id`, `text`, optional `SendPromptOptions`, and optional `submitted`.
  Type `agent.promptRetryScheduled` with prompt `id`, retry `attempts`,
  `lastError`, and optional `retryAt`; type `agent.promptDequeued` with prompt
  payload `{ ids: string[] }`. These three queue events require no
  provider, thread, or turn context.
- Keep renderer-message `agentId` validation at runtime rather than enforcing
  envelope/payload equality in the static contract.
- Retain the live `hasOlderMessages` pagination flag. Exclude only ignored
  legacy history fields such as `direction` and `evictedTurnIds` from the owned
  payload contract; retain an explicit boundary cast only where a legacy
  producer or fixture must prove that ignored compatibility behavior.
- Preserve readonly attachment inputs and all queue-option behavior, including
  model, plan mode, reasoning, service tier, skills, input method, backend
  options, submitted state, attempts, retry metadata, and dequeue filtering.
- Preserve source-less compatibility and current runtime guards. Keep generic
  and wire-decoder casts deferred to their later boundary work.

#### Slice 9 — tool lifecycle and workspace events

Completed in `2d7718292cbcd77f262347b0de17a153bf14e3f2`.

- Type `item.started` and `item.completed` with a private lifecycle payload
  alias containing `toolPart: RendererToolPart` and optional `messageId`.
  Type `item.updated` with a private update payload alias composed from
  `RendererToolPartUpdate` plus optional `messageId`.
- Require envelope `agentId`, `backend`, and `turnId` for all three item
  lifecycle events; keep `threadId` optional because Claude does not always
  provide it.
- Type `diff.updated` with a private payload alias carrying non-negative
  `addedLines` and `removedLines` plus optional `diff`. Require envelope
  `agentId`, `backend`, `threadId`, and `turnId`.
- Type `file.activity` from the existing `AgentFileActivity` owner, omitting
  envelope-owned `agentId`, `turnId`, and event-owned `occurredAt` from its
  payload. Require envelope `agentId`, `backend`, `threadId`, and `turnId`.
- Type `git.statusUpdated` with payload `AgentGitStatus` and require only
  envelope `agentId`; do not add provider, thread, turn, or source context.
- Preserve optional item `messageId`, arbitrary tool kinds, fallback tool
  insertion, field-patch and null-deletion behavior, body delta/append rules,
  output-derived body fallback, and metadata merging.
- Preserve the coupled diff update: one event updates both `turnGitDiffs` and
  the running file-change tool descriptor. Retain their existing asymmetric
  malformed-payload validation rather than silently tightening either path.
- Preserve Git status storage for unknown agents and the deliberate boundary
  cast that characterizes a legacy `branch: null` payload. Preserve renderer-only
  trimming of file-activity paths; do not move that behavior into the contract
  or backend producer.
- Missing required context must retain its current no-op behavior. Split
  reducer branches where needed so TypeScript narrows each event variant; do
  not replace narrowing with reducer casts. Keep wire decoding and generic
  transport casts deferred to their later boundary work.

#### Slice 10 — approvals, input requests, and errors

Completed in `48e1875d257e071189c9239f66ce984611d8865e`.

- Type `approval.requested` with payload
  `Extract<ClientRequest, { kind: 'confirm_tool' }>` and type
  `toolInput.requested` with payload
  `Extract<ClientRequest, { kind: 'ask_user' }>`. Model each as two provider
  variants rather than weakening the shared context:
  - Codex requires envelope `agentId`, `backend: 'codex'`, and `threadId`, with
    optional `turnId` because SDK client requests may be conversation-scoped.
  - Claude requires envelope `agentId`, `backend: 'claude'`, and `turnId`, with
    optional `threadId` because its active turn may not yet have a session ID.
- Split the conditional Codex and Claude request producers into explicit
  approval and input branches so the event discriminant stays paired with its
  exact payload. Do not add producer casts to bypass the new contracts.
- Type `backendApproval.requested` as a Codex-native event with required
  `agentId`, `backend: 'codex'`, and `threadId`, optional `turnId`, and the
  existing nested `{ approval: BackendApprovalRequest }` payload. Type
  `backendApproval.resolved` with the same context and a nested payload
  containing the approval plus nullable `BackendApprovalDecision`, nullable
  `BackendApprovalScope`, and the existing host/server/lifecycle resolution
  reason.
- Preserve the approval parser's accepted nested and legacy flat
  `BackendApprovalRequest` shapes at runtime. The reducer's source-less,
  agent-less resolution-across-all-agents branch is dormant under current
  producers; characterize it through an explicit boundary cast without
  deleting it or turning this typing slice into a hidden behavior fix.
- Preserve the client-request registry's source-less approval fallback, which
  derives the backend from the owning agent, through a deliberate boundary
  cast. Do not require source, and do not introduce payload/envelope identity
  equality checks.
- Type `error` with required envelope `agentId` only and a private payload
  alias containing required `message: string`, optional `willRetry`, and
  optional provider diagnostic data. Do not require backend, thread, turn, or
  source context; malformed empty payload fallback remains a boundary case.
- Preserve retryable errors as transient working status with no transcript
  message; preserve terminal errors as one system message plus error status,
  including the fallback `Backend error` for a malformed or empty payload.
- Preserve approval and input events missing `turnId` as their current handled
  no-ops, malformed request/status quirks, and both nested and flat approval
  parsing. Keep runtime guards and generic/wire decoder casts deferred to their
  later boundary work.

#### Slice 11 — snapshot metadata events

Completed in `ad873e85cf138ceda1577f38e451f4afe0692260`.

- Type `snapshot.updated` with payload `AppSnapshotMetadata`. It requires no
  envelope agent, backend, session, thread, turn, or source context.
- Retain the inherited optional `snapshot?: AppSnapshot` envelope field as the
  full-snapshot side channel. Keep `clientState` out of
  `MainToRendererEvent`; it remains optional transport metadata added only by
  `ClawBackendEvent`.
- Preserve snapshot adoption precedence exactly: an envelope `snapshot` full
  snapshot wins first, a legacy full snapshot payload is next, metadata payload
  adoption is third, and only otherwise does ordinary event reduction run.
- Preserve message semantics across each path. Full snapshot adoption replaces
  the transcript; metadata adoption retains the current transcript;
  `applySnapshotMetadata` continues stripping any accidentally supplied
  `messages`; Electron's cached replica continues storing metadata-only state
  after full-snapshot side-channel adoption.
- Preserve optimistic renderer selection when the currently active agent still
  exists in the incoming full or metadata snapshot. Do not let background
  metadata overwrite that local selection, and keep unread pruning unchanged.
- Preserve remote snapshot handling and client-state recomputation. Remote
  full snapshots and metadata updates must continue projecting through local
  team/agent identity, while `clientState` remains recomputed from the receiving
  server snapshot rather than trusted as application payload.
- Keep current shallow `isAppSnapshot` and `isAppSnapshotMetadata` guards for
  this typing slice; their deep validation is slice 12. Preserve legacy full
  snapshot internal producers and characterize their compatibility explicitly
  at the boundary instead of broadening the new payload contract.
- Preserve malformed snapshot events as their current handled no-ops and retain
  explicit boundary cases for invalid payloads, side-channel precedence, full
  payload compatibility, message stripping, and missing context. Do not bundle
  decoder, selection, projection, or persistence behavior changes.

#### Slice 12 — deep snapshot decoding and classified adoption

Execute this in two commits so deep validation lands independently from caller
adoption changes.

##### Slice 12a — decoder and Core characterizations

- Replace the shallow root checks in `core/src/snapshot-guards.ts` with this
  exact interface:

  ```ts
  export type DecodedAppSnapshot =
    | { kind: 'full'; value: AppSnapshot }
    | { kind: 'metadata'; value: AppSnapshotMetadata };

  export function decodeAppSnapshot(value: unknown): DecodedAppSnapshot | null;
  export function isAppSnapshot(value: unknown): value is AppSnapshot;
  export function isAppSnapshotMetadata(value: unknown): value is AppSnapshotMetadata;
  export function isClientState(value: unknown): value is ClientState;
  ```

- `decodeAppSnapshot` deeply validates all common metadata before classifying
  the value. If the record owns `messages`, validate it as a complete
  `RendererMessage[]` and return `kind: 'full'`; if that field is malformed,
  reject the value instead of retrying it as metadata. Return `kind:
  'metadata'` only when `messages` is absent. This fixes the current
  no-downgrade bug while `isAppSnapshotMetadata` continues accepting valid full
  snapshots for compatibility.
- Validate every structural domain: teams; agents including status, `AppText`,
  pull request, workspace, backend session/defaults, application, context,
  plan, goal, and registration; automations including repositories, schedule,
  logs, created agents, and conversation references; backend runtime status,
  capabilities, approval presets, and permission descriptors; approvals;
  subagent trees, nodes, operations, activity, identity, and status; work
  backlog connections, provider configuration/settings, and assignments;
  remote connections; general settings, plugins, appshots, repository icons,
  source-folder state, and theme; transcript and runtime collections including
  messages and parts, queued prompts/options/attachments, work routing, Git
  status, turn diffs, and rate limits; and all active IDs plus root maps and
  arrays.
- Validate `ClientState` through the same Core-owned guard: require its source
  folder and display-sleep scalar fields and validate the optional remote-access
  display-sleep flag.
- Keep strict live/wire decoding separate from persistence restoration.
  `snapshotFromPersistedState` continues accepting partial and legacy saved
  state, applying defaults, normalization, repair, and migrations; the strict
  decoder must not import or duplicate that policy.
- Reuse only acyclic Core-owned leaf validators. The decoder must not import
  snapshot construction, reducers, or backend persistence. Keep private
  structural validators local unless an existing Core leaf already owns the
  domain invariant.
- Return the original object identity after validation. Allow unknown additive
  fields on records, but do not clone, normalize, default, repair relationships,
  or add cross-record relational validation. Traverse each array and record map
  once so decoding remains linear in the total number of entries and nested
  message parts.
- Add Core characterizations for every structural domain, full and metadata
  identity, unknown additive fields, full-as-metadata compatibility, malformed
  nested fields, `ClientState`, and especially a record with otherwise valid
  metadata plus present malformed `messages` returning `null` from the decoder
  and `false` from both compatibility guards.

Commit checkpoint: `chore: deepen snapshot decoding`

##### Slice 12b — classified mixed-caller adoption

- Migrate snapshot boundaries to call `decodeAppSnapshot` once and branch on
  its discriminant instead of composing full and metadata predicates. Cover
  backend remote results and outbound compaction, remote-team cache and
  projection, Electron synchronization/transient/cached replicas, renderer
  snapshot adoption, and protocol snapshot-get validation. Preserve web/stdio
  transport framing while validating at the application ownership seam.
- Preserve the established order and semantics: envelope full snapshot first,
  then a legacy full payload, then metadata payload, then ordinary event
  reduction; full values replace transcripts where that caller owns a full
  replica, metadata values retain them, and Electron keeps its cache
  metadata-only. Preserve optimistic renderer selection, unread pruning,
  remote identity projection, and receiving-server `clientState`
  recomputation.
- Add boundary regressions for mixed full/metadata callers, malformed nested
  side channels and payloads, no-downgrade handling, source-less events,
  transcript identity/replacement, local selection, remote projection, and
  untrusted remote client state. Remove only casts made obsolete by the deep
  decoder; keep deliberate malformed-boundary casts explicit.

Commit checkpoint: `chore: classify snapshot adoption`

Slice 12 exits only when one Core decoder owns strict snapshot classification;
all full/metadata application boundaries use its discriminant; a present
malformed `messages` field can never downgrade to metadata; valid values retain
identity and unknown additive fields; persistence restoration remains separate;
validation stays acyclic and linear; all structural-domain and mixed-caller
regressions pass; and full tests, typecheck, lint, Knip, and diff checks are
green.

#### Slice 13 — typed wire-event decoding

Create the wire owner at `core/src/backend-protocol/events.ts`. Mechanically
move `ClawBackendEventFrom` and `ClawBackendEvent` from `rpc.ts`, retaining
compatibility re-exports while callers migrate. Private leaves may separate
shared event validation, runtime payloads, agent payloads, and conversation
payloads without widening the public surface.

Add an exhaustive 55-key registry and a throwing
`decodeClawBackendEvent(unknown): ClawBackendEvent`. Decoder failures must
identify a structural path and reason without including payload values. The
decoder validates structure only: do not add cross-field semantic equality,
normalization, or application behavior changes.

Execute in three checkpoints:

1. `chore: add typed wire event decoder` — completed in
   `96151235f08d9e26c1e64f0324eabf3992f817de`; the decoder and exhaustive
   direct Core characterizations do not change transports.
2. `chore: decode local backend events` — completed in
   `b1058b2da5874955342703f87389f22635cccdb6`; Electron
   `backend-rpc-session` and Web `backend-process` decode exactly once, ignore
   and safely log malformed decoded event notifications, and retain their
   existing malformed JSON and JSON-RPC framing behavior.
3. `chore: decode remote backend events` — completed in
   `0779e2a558713d29b6d10890daec5ded6a66d2ce`; backend
   `remote-clawd-client` and the Web protocol now decode once at ingress.
   Decode failures do not terminate the transport or reject pending requests,
   and tests prove recovery through subsequent valid events and continued
   pending-request resolution while malformed JSON/RPC framing behavior stays
   unchanged. The Web parser preserves both outer-envelope and inner-event
   identity after an independent review correction.

Every relocation follows `lossless-code-moves` with byte/AST fidelity. Slice
13 exits when all four wire ingress seams decode `unknown` exactly once, no
transport cast remains, all 55 event keys are coupled exhaustively, malformed
event notifications cannot mutate state or kill a live transport, and Core,
transport, full-suite, typecheck, lint/Knip, cycle, and diff checks are green.

#### Slice 14 — close event ownership and remove redundant guards

Finish the ownership work now that typed wire decoding is the sole transport
trust boundary. This is a behavior-preserving cleanup: semantic fixes remain
separate, and every relocation must follow `lossless-code-moves` before imports,
interfaces, or ownership boundaries change.

Execute four small commits:

1. `chore: close backend event union` — completed in
   `06583fb3eabb3eed9f96b9bcf4c07d82d18e3e03`. The closed union has 59
   discriminated members and 55 unique event keys, including four
   provider-discriminated duplicate names. Its exact disjoint ownership is 14
   runtime/global events, 24 conversation events, four subagent events, and 13
   explicit renderer-only no-ops. The legacy fallback and obsolete typed and
   untyped aliases are gone; the remaining typed union and envelope are
   byte-identical to their previous definitions.
2. `chore: route backend events exhaustively` — completed in
   `6e14cfe3c72b8948dca3f341162c39e9d346fbef`. The façade preserves stale
   subagent invalidation and routing order while dispatching the exact 55-key
   ownership partition once. Each reducer takes only its owned event subset,
   returns `void`, and closes with compile-time `never`. The global
   `backendApproval.resolved` no-op and agent-scoped resolution behavior remain
   unchanged after removing the misleading all-agent loop.
3. `chore: trust decoded backend events` — completed in
   `3bc7ca4af524ad69ea891e900b0d5a7591deadee`. Production downstream handling
   shrank from 5,462 to 5,033 lines, removing 23 redundant structural helpers
   while retaining all 63 runtime cases and every audited policy, security,
   identity, normalization, malformed-input, and compatibility gate.
4. `chore: simplify renderer event handling` — complete. Make renderer dispatch
   exhaustive, remove redundant renderer guards and casts, and list ignored
   renderer events explicitly.

Each checkpoint requires direct-owner and façade tests, then the full suite,
typecheck, lint/Knip, dependency-cycle inspection, and diff checks. Slice 14
exits when there is no legacy generic fallback; every owned event is handled or
exhaustively ignored; no stale broad cast or false structural guard remains;
and `decodeClawBackendEvent` remains the sole wire trust boundary.

### 1.5 Split contract domains

The refreshed baseline after event cleanup is `core/src/contracts.ts` at 2,140
lines. Its public surface contains 214 exports plus 28 private declarations,
for 242 declarations total. `CodexClawApi` contains 132 members and the closed
event registry contains 55 keys. There are 317 consumers: Core 62, Backend 73,
Electron 27, Vue 152, and Web three.

Split those 242 declarations into these exact ownership domains while
preserving every public name and all private helpers during migration:

| Domain | Declaration count | Size target |
| --- | ---: | ---: |
| shared | 5 | ≤30 lines |
| git | 19 | ≤150 lines |
| workspace | 12 | ≤125 lines |
| connections | 10 | ≤110 lines |
| interaction | 12 | ≤140 lines |
| desktop | 20 | ≤200 lines |
| backend | 21 | ≤250 lines |
| conversation | 43 | ≤425 lines |
| agent | 15 | ≤190 lines |
| work | 34 | ≤300 lines |
| settings | 15 | ≤135 lines |
| snapshot | 4 | ≤90 lines |
| events | 29 | ≤550 lines |
| host API | 3 | ≤230 lines |
| **Total** | **242** | compatibility barrel <30 lines |

Keep the complete prompt cluster in the conversation domain rather than
splitting prompt options, attachments, queues, and interaction payloads across
convenience files. `WorkProviderConnectResult` and `AppCommand` belong to the
host-API domain. The backend-protocol event decoder and event ownership modules
remain separate from contract declaration ownership; do not move their
runtime registries or decoder policy back into the contracts tree.

Move declarations leaf-first and retain `contracts.ts` as a compatibility
barrel until consumers migrate. New contract modules may import only their
recorded lower-level dependencies; they must never import the compatibility
barrel. The migration order is intentionally acyclic: shared repository
values first; backend and conversation foundations next; work, interaction,
settings, desktop, agent, and snapshot domains after their leaves; renderer
events after their payload owners; host API last after all member signatures
exist. Consumer migrations then proceed Core → Backend → Electron/Web → Vue,
followed by closing the barrel. Run Madge and an internal-import inventory at
every dependency-boundary checkpoint.

Execute these exact commits:

1. `chore: extract shared repository contracts`
2. `chore: extract backend contracts`
3. `chore: extract conversation contracts`
4. `chore: extract work contracts`
5. `chore: extract interaction and settings contracts`
6. `chore: extract desktop contracts`
7. `chore: extract agent and snapshot contracts`
8. `chore: extract renderer event contracts`
9. `chore: extract host api contracts`
10. `chore: migrate core contract imports`
11. `chore: migrate backend contract imports`
12. `chore: migrate electron and web contract imports`
13. `chore: migrate vue contract imports`
14. `chore: close core contracts barrel`

Before every move, record source SHA-256 and normalized declaration AST/body
hashes. The corresponding target declaration must match before import edits.
Preserve the exact 214-export surface, all 28 private declarations, all 132
`CodexClawApi` signatures, and the 55-key event registry throughout the staged
migration. Preserve reference identity for the seven runtime constants:
`subagentStatuses`, `subagentOperationKinds`,
`subagentOperationLifecycles`, `subagentOperationStatuses`,
`subagentActivityKinds`, `spokenAnnouncementVoices`, and
`PRIMARY_BROWSER_ID`.

Exit when the compatibility barrel is below 30 lines; all target modules meet
their size bounds; no Core, Backend, Electron, Vue, or Web implementation
imports the barrel internally; the 214 exports, 28 private declarations, seven
runtime constant identities, 132 API signatures, and 55 event keys remain
exact; prompt, host-API, decoder, and ownership boundaries remain intact; and
focused contract/runtime tests, full tests, all-workspace typecheck,
lint/Stylelint/Knip, Madge, and diff checks are green.

Active commit checkpoint: `chore: extract work contracts`

### Phase 1 exit criteria

- `snapshot.ts` is approximately 300 lines and primarily composes deep modules.
- The contracts barrel is approximately 100 lines.
- Every owned event is exhaustive or explicitly ignored.
- Agent mutation policy has one owner.
- Direct module tests own detailed behavior; façade tests cover composition.
- `npm run test:ai` passes.

## Mandatory Phase 1 decision gate — stop before Phase 2

Phase 1 completion does not authorize Phase 2 implementation. Stop execution
after the Phase 1 exit gates and conduct a ruthless, evidence-based review of
the entire phase with Nicolas before changing any Phase 2 production or test
code.

The review must:

- verify every Phase 1 exit criterion against recorded evidence rather than
  checkpoint status alone;
- compare before/after LOC, module counts, public and private export counts,
  interface sizes, dependency direction, and cycle results;
- compare test counts and durations, direct-owner versus façade coverage, and
  the known repository-wide coverage debt without describing a partially red
  coverage gate as green;
- inventory defects found and fixed during review, any regressions, and the
  behavior or compatibility risks still being carried;
- assess whether code navigation, ownership, locality, and module depth
  improved enough to justify the additional files, imports, re-exports, and
  plumbing; call out file proliferation, duplication, shallow pass-throughs,
  or compatibility façades candidly;
- inspect the complete Phase 1 diff and commit history for coherent,
  independently reviewable changes and identify residual technical debt or
  transitional architecture;
- present a candid recommendation to **continue**, **reduce**, or **stop** the
  hardening program, with the evidence and tradeoffs behind that recommendation.

Wait for Nicolas's explicit decision. Do not begin Phase 2 implementation
until he approves continuing past this gate.

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

Prepared owner: `backend/src/events/backend-event-coordinator.ts`. The current
event-coordination footprint in `server.ts` is approximately 299 lines across
20 methods and six helpers. Preserve event ordering, persistence-before-
publication, remote projection and forwarding, and transcript update
invariants. Build on the Phase 2 routing and source-workspace seams rather than
duplicating their location or authority policy.

Execute in four checkpoints, using `lossless-code-moves` with byte/AST fidelity
for every substantial relocation:

1. `test: characterize backend event coordination`
2. `chore: extract backend event publication`
3. `chore: extract backend event coordination`
4. `test: move backend event ownership specifications`

Exit when `server.ts` has lost at least 290 net lines, the coordinator remains
below 450 lines, server-owned event specs are at or below 180 lines, and direct
coordinator coverage proves the preserved ordering and side effects.

### 2.7 Modularize persistence codecs

- Extract internal codecs and migrations by persisted domain.
- Retain the existing load/save façade while consumers migrate.
- Keep schema compatibility and corrupt-state recovery explicit.

The prepared baseline is `backend/src/state-persistence.ts` at 1,357 lines,
71 functions, and 81 `if` statements, with a 1,269-line / 32-test persistence
spec plus seven related state-spec tests. Split ownership into app-state,
agent, subagent, work, topology, and codec-values modules while retaining the
existing load/save façade.

Preserve shape-based migrations, semantic recovery, and the current
propagation of invalid JSON. Hash moved declarations and test bodies before
and after every substantial relocation so mechanical fidelity is explicit.

Execute in seven checkpoints:

1. `test: characterize state persistence recovery`
2. `chore: extract agent persistence codec`
3. `chore: extract subagent persistence codec`
4. `chore: extract work persistence codec`
5. `chore: extract persistence topology`
6. `chore: compose modular state codec`
7. `test: move persistence codec specifications`

Exit when the load/save façade is at most 140 lines, the app-state codec at
most 200, agent and work codecs at most 450 each, topology at most 220,
subagent at most 150, and every persistence spec at most 600 lines.

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

The prepared baseline is `AppController` at 1,863 lines. Its backend replica
responsibility is approximately 205 lines with 29 conditionals, serving 47
full-snapshot callers and four metadata callers. Extract it into
`electron-backend-replica.ts` while keeping remote automation outside the
module.

Preserve raw and transient snapshot identity, the metadata-only cache, the
three-attempt event-sequence barrier, event → client-state → renderer
publication ordering, and renderer-only media projection. Every substantial
source and test move must follow `lossless-code-moves` with declaration, AST,
body, and test fidelity proved before boundary edits.

Execute in three exact checkpoints:

1. `test: characterize electron backend replication`
2. `chore: extract electron backend replica`
3. `test: move electron backend replica specifications`

Exit when `AppController` is at most 1,725 lines with at least 135 net lines
removed, the replica is at most 300 lines with no more than seven public
members, direct replica specifications are at most 450 lines, and the remaining
composition specification is at most 250 lines.

Commit checkpoint: `chore: extract electron backend replica`

### 3.2 Compose focused IPC registrars

- Group IPC registration by cohesive desktop capability.
- Use a typed preload bridge backed by focused registrars.
- Keep Electron-only responsibilities—windows, dialogs, lifecycle, native
  capability adapters—in the composition root.

The prepared baseline is `AppController` at 1,863 lines / 155 methods,
including a 393-line `registerIpcHandlers` with 120 inline registrations. Nine
Git registrations already live outside that method, making 129 invoke channels
in total. The 150-line preload bridge exposes those 129 invokes plus three
subscriptions. Six current specifications total 2,860 lines / 72 tests.

Execute seven exact checkpoints:

1. `test: characterize electron ipc surface`
2. `chore: extract connection work and source ipc`
3. `chore: extract agent and automation ipc`
4. `chore: extract native electron ipc registrars`
5. `chore: split electron ipc adapters`
6. `chore: compose typed preload bridge`
7. `test: move electron ipc ownership specifications`

Preserve exact coverage of all 129 invoke channels and three subscriptions.
Every handler, helper, and test relocation follows `lossless-code-moves` with
source and test-body fidelity proved before dependency rewiring. Keep private
`updateAgentFolder` out of this checkpoint; it is not an IPC registration.

Exit when registration composition is at most 35 lines with zero inline
handlers; `AppController` is at most 650 lines after Phases 3.1 and 3.2; each
registrar owns no more than 22 channels, four ports, and 300 lines; the preload
index is at most 30 lines and each preload module at most 90; every resulting
spec is at most 400 lines; and exact 129-invoke plus three-subscription coverage
remains green.

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

The prepared baseline is `app-state.ts` at 1,842 lines with 27 module-state
bindings and 164 returned façade members. Its child stores total 1,215 lines.
The seven current specifications total 4,932 lines / 116 runtime cases from 115
declarations, with 112 singleton imports and 111 global mutations.

Own construction through `createAppState(deps)` with exactly seven focused
ports: API, host, platform, celebration, onboarding, scheduler, and random.
Capture a fixed dependency identity for the lifetime of the state instance.
Preserve every one of the existing 164 façade keys and add `dispose`; disposal
owns subscription and timer cleanup only and must not add application-policy or
backend lifecycle behavior.

Execute three exact checkpoints:

1. `chore: inject renderer state dependencies`
2. `chore: make renderer state constructible`
3. `test: isolate renderer state specifications`

Use AST and function-body fidelity for production moves and preserve all 115
test declarations / 116 runtime cases before adapting their construction seam.
Exit with a production singleton wrapper at most 35 lines and zero singleton
imports or global mutations in renderer-state tests. Keep domain-state
decomposition out of this checkpoint; it remains Phase 4.2.

Commit checkpoint: `chore: make renderer state constructible`

### 4.2 Modularize renderer application state

The prepared baseline remains `app-state.ts` at 1,842 lines and 164 façade
members. Function inventories are app 204, composer 76, history 14, unread 30,
source eight, and work 27. The seven related specifications total 4,932 lines,
115 declarations, and 116 runtime cases.

Replace the flat façade with eight acyclic domain namespaces plus `dispose`:

- replica: four members and at most 400 lines;
- agents: 24 members and at most 450 lines;
- conversation: 58 members and at most 650 lines;
- workspace: 20 members and at most 350 lines;
- Git: nine members and at most 110 lines;
- work: 18 members and at most 400 lines;
- automations: seven members and at most 180 lines;
- system: 24 members and at most 300 lines.

The replica is the sole writable snapshot and synchronization owner. Domain
modules do not import each other; compose them through narrow ports. Keep
`isRemoteAutomationLocation` neutral and reuse the exhaustive renderer event
dispatcher produced after Slice 14d. Do not touch AppShell in this checkpoint.

Execute six exact checkpoints:

1. `chore: extract renderer replica state`
2. `chore: extract renderer conversation state`
3. `chore: extract renderer agent and workspace state`
4. `chore: extract renderer support state`
5. `test: move renderer state ownership specifications`
6. `chore: modularize renderer application state`

Use lossless AST, function-body, and test-body hashes throughout. Preserve all
164 façade members. Temporary flat compatibility aliases may exist only during
commits one through five and must be removed in commit six. Exit with
`app-state.ts` as a 350–600-line composition module, no state module above 700
lines, no state spec above 700 lines, a composition spec at most 250 lines, and
no dependency cycles, barrel modules, catch-all dependency bags, or duplicate
snapshot owner.

Commit checkpoint: `chore: modularize renderer application state`

### 4.3 Establish AppShell controller coverage

- Characterize conversation mapping, dialog workflows, keyboard commands, and
  debug previews through focused controllers.
- Keep a small number of real-composition shell tests.
- Avoid remounting already-owned child behavior through AppShell.

The prepared baseline is `AppShell.vue` at 1,798 lines with 112 props, 39
emits, and 95 top-level declarations. Its five AppShell specifications total
4,414 lines, 108 tests, 109 mounts, and 469 assertions, completing in 5.91s.
This checkpoint is test-only: production code must remain byte-identical.

Execute four exact commits:

1. `test: cover shell command controller`
2. `test: cover shell workflow controllers`
3. `test: characterize shell controller seams`
4. `test: cover app shell controllers`

Preserve all 108 test names and callback bodies and all 469 assertion ASTs.
Move at least 75 cases to direct controller ownership and reduce AppShell
mounts to at most 30. Retain exactly these eight real-composition cases:

1. active-agent shell composition;
2. SDK conversation-controller state and action wiring;
3. resume-session dialog wiring for the selected sidebar agent;
4. active team and agent keyboard shortcuts;
5. deterministic Markdown and approval Debug commands;
6. Cockpit navigation and return to an agent;
7. Automations navigation without retaining an active team;
8. Settings General navigation, remembered pane, appearance update, and quit.

Exit when controller tests complete in at most 250ms, every permanent spec is
at most 700 lines, temporary migration specs are at most 500 lines, the final
real-composition spec is at most 250 lines and 2.5s, and no production diff
exists.

Commit checkpoint: `test: cover app shell controllers`

### 4.4 Slim AppShell orchestration

- Extract conversation mapping, dialog workflows, commands, and debug-preview
  ownership behind focused controllers and components.
- Remove the giant controller/prop bag rather than renaming it.
- Make AppShell responsible for page selection and composition.

After Phase 4.3, replace the flat shell surface with exactly nine cohesive
namespace props: `replica`, `agents`, `conversation`, `workspace`, `git`,
`work`, `automations`, `system`, and `updateStatus`. Retain only three semantic
emits for root-owned workflows: `closeAgent`, `pullRequestCleanup`, and
`installUpdate`. The other 36 current emits become direct calls into their
authoritative namespace owners; do not hide the existing giant interface
inside one renamed controller bag or use a catch-all provide/inject object.

Extract deep owners with narrow acyclic ports:

- conversation mapping, transcript, composer, prompt/steer, approval, and SDK
  controller composition in a controller of at most 320 lines;
- deterministic debug previews, timers, progress, approval consumption, and
  cleanup in a controller of at most 220 lines;
- agent, team, and history dialogs in a controller of at most 250 lines, with
  repository session acquisition in a separate owner;
- resource-sharing migration in a controller of at most 90 lines;
- keyboard and application commands behind seven cohesive ports, in a
  controller of at most 500 lines.

AppShell continues to own page selection, active-team and navigation
projection, sidebar layout, agent/Cockpit/Automations/Settings composition,
Cockpit one-time initialization, settings-tab memory, workspace watches, and
the dialog component tags. `App.vue` retains root confirmation and update
workflows, renderer focus and visibility lifecycle, system theme, and restart
overlay behavior.

Execute eight exact commits:

1. `chore: extract shell conversation controller`
2. `chore: extract shell debug previews`
3. `chore: extract shell dialog workflows`
4. `chore: narrow shell command ports`
5. `chore: pass renderer agent and conversation state to shell`
6. `chore: pass renderer workspace and work state to shell`
7. `chore: pass renderer system state to shell`
8. `chore: slim app shell orchestration`

Use `lossless-code-moves` for every substantial relocation. Hash all 95
declaration bodies, the template subtrees including directives/modifiers and
attribute order, and the existing style block. Maintain a ledger mapping all
112 props and 39 emits to a namespace member or one of the three retained
emits. Temporary dual props are allowed only in commits five through seven and
must be gone in commit eight.

Exit with `AppShell.vue` between 650 and 850 lines, hard maximum 900, exactly
nine props and three emits, at most 35 top-level declarations and 25 imports;
`App.vue` at most 500 lines with 12 AppShell bindings; the eight Phase 4.3
composition cases retained; no new production controller above 500 lines; and
no dependency cycles.

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

The prepared baseline is `AutomationsView.vue` at 804 lines, 19 props, and
about 64 top-level declarations, plus `AutomationEditor.vue` at 340 lines and
11 declarations. Six renderer component specs total 889 lines, 24 tests, 87
assertions, and 24 logical mounts, completing in 3.32 seconds.

Run this lane only after Phase 4 has established renderer namespaces and
slimmed AppShell. `AutomationsView` then composes exactly five narrow namespace
props: `replica`, `automations`, `workspace`, `work`, and `conversation`.
AppShell keeps page selection and composition; it does not regain automation
state or policy.

Extract three acyclic renderer owners:

- `use-automation-location-state.ts`, at most 260 lines, owns local/remote
  selection, eligible connection projection, isolated remote snapshot/source/
  work catalogs, ordered loading, stale-request suppression, location-aware
  repository loading, and location-aware conversation reads;
- `use-automation-editor-model.ts`, at most 220 lines, owns draft/default/edit
  state, canonical multi-repository matching, stored-but-unavailable targets,
  display schedule options, presentational submit eligibility, independent
  dictation-busy state, prompt trimming, and construction of create/update
  intent;
- `use-automations-controller.ts`, at most 280 lines, owns mutually exclusive
  create/edit/log panels, row and menu projection, create/update/run/delete/
  history workflows, confirmation requests, and remote refresh after
  successful mutations.

Keep `AutomationsView.vue` responsible for rendering and composition, targeting
430–500 lines, and `AutomationEditor.vue` responsible for form rendering,
targeting 230–260 lines. Existing execution-log, welcome, conversation-overlay,
and execution-status components remain their current presentation owners. New
renderer modules depend on narrow namespace or confirmation ports and must not
import AppShell, the production state singleton, Electron/backend adapters, or
one another in a cycle.

Core and Backend remain authoritative for domain policy. Preserve the existing
`AutomationSchedule` shape `{ intervalMinutes: number }`; there is no current
cron model or parser, so this behavior-preserving lane must not invent one.
Core continues to own team validation, repository normalization and dedupe,
interval flooring and minimums, and execution history. Backend continues to
own due/enabled selection, pickup across repositories, already-assigned
filtering, selection and assignment prompts, worktrees, agent creation,
assignment, persistence, and publication.

Preserve these behavior groups exactly:

- remote locations require ready status plus transport; disappearing remotes
  fall back to local; local transport calls omit the location argument while
  remote calls pass the exact remote location object;
- location switches close editor/log state, isolate and clear remote catalogs,
  load snapshot → source repositories → GitHub work repositories, and ignore
  stale successes and failures without mutating local catalogs;
- local mutations are adopted by renderer state while returned snapshots are
  ignored by the view; remote mutation snapshots refresh only the isolated
  remote view; remote conversation reads alone receive the location argument;
- multi-repository options require matching work and source repositories using
  canonical Git remote identity, preserve SSH/HTTPS equivalence, retain stored
  targets missing from current catalogs, remain label-sorted, and emit in the
  sorted option order;
- the UI gate remains GitHub connected, at least one repository, nonblank team,
  finite interval at least one, and neither dictation field busy. Do not add
  Core's stronger team or interval policy to the renderer;
- selection and assignment prompts trim and omit blanks independently; the two
  dictation fields retain independent busy signals; enabled defaults to true,
  interval to 60, and the current interval presets remain unchanged;
- create/edit/log panels and loading/error/welcome/list rendering retain their
  precedence; a missing edit ID does not become create mode; a successful save
  closes the editor even when no snapshot is returned;
- disabled automations cannot run from the UI; missing entities remain no-ops;
  exact delete/history confirmation and cancel behavior, active-log deletion,
  row source truncation, missing-team and unknown-date labels, and execution-log
  live/stale message behavior remain intact; mutation errors keep propagating.

Execute these exact commits:

1. `test: characterize automation orchestration`
2. `chore: extract automation editor model`
3. `chore: extract automation location state`
4. `chore: extract automation workflow controller`
5. `test: move automation ownership specifications`
6. `chore: simplify automation orchestration`

Before each substantial move, rebaseline against the post-Phase-4 tree and
record source bytes plus normalized AST/body hashes. Preserve template node,
directive, modifier, and attribute order except for explicitly recorded event
wiring; preserve style blocks byte-for-byte. Preserve all 24 test names and
callbacks plus all 87 assertion ASTs before moving behavior to direct owner
specs; change only harness, construction, and action wiring. Do not remove a
component case until its direct-owner equivalent is green.

Exit with the location owner at most 260 lines, editor model at most 220,
workflow controller at most 280, view at 430–500, and editor at 230–260;
`AutomationsView` has the five renderer namespace props; component mounts fall
from 24 to 10–12; component aggregate time is at most 1.5 seconds; direct
model/controller tests total at most 250ms; every automation spec is at most
500 lines; Core/backend scheduling policy has no semantic or ownership drift;
and focused, Vue, full-suite, typecheck, lint/Stylelint/Knip, cycle, and diff
checks are green.

Commit checkpoint: `chore: simplify automation orchestration`

### 5.2 Git workflow lane

The prepared baseline is `GitWorkflowControl.vue` at 1,326 lines. Split merge,
squash, pull request, cleanup, handoff, and background progress into
operation-owned workflows. Dialogs render typed workflow state and emit user
intent; they do not coordinate Git or own mutation policy. Backend remains the
authoritative mutation owner.

Preserve these invariants:

- progress ordering, cancellation, and dismiss-to-background continuation;
- worktree and local/remote branch cleanup safety, including confirmation and
  the distinct constraints of squash merges;
- agent closure ordering when a worktree is removed or closure must wait for a
  requested push;
- handoff generation and delivery timing, with the worker receiving the
  authoritative PR result or direct-merge context rather than speculating;
- push-failure behavior, including retaining enough state for an explicit
  retry and never reporting cleanup or delivery as complete prematurely.

Phase 4's renderer Git namespace must expose the typed operation-progress
subscription that these workflows consume. Rebaseline the post-Phase-4 tree
before choosing detailed owner size limits or intermediate commits; the audit
did not freeze such a sequence, so do not invent one.

Commit checkpoint: `chore: split git workflow controls`

Exit: the Git workflow parent is approximately 350 lines, with operation detail
owned and tested below it.

### 5.3 Repository backlog lane

The prepared active baseline is `RepositoryBacklogPanel.vue` at 1,310 lines,
`CockpitWorkInbox.vue` at 1,087 lines, and `CockpitView.vue` at 709 lines.
Their active specifications contain 41 tests, 199 assertions, and 45 mounts in
3.30 seconds; including legacy and routing coverage brings the inventory to 63
tests. `WorkBacklogPanel.vue` is an orphan 668-line implementation whose
retirement is a separate decision, not part of the mechanical active-surface
split.

Repository backlog and Cockpit backlog have materially different projections,
selection behavior, and presentation semantics. Share app-owned contracts and
routing seams only; do not force them through common row components or shared
projection owners merely because their source data looks similar.

Extract repository projection, workflow, and row ownership separately from
Cockpit projection, selection, and row ownership. Preserve fixed-height layout
and exact loading, empty/error, scope, and list-state parity. Issue/PR pickup,
work routing, Core validation, Backend mutation and persistence, and local or
remote location policy remain in their current authoritative owners.

Execute these exact commits:

1. `test: characterize repository backlog ownership`
2. `chore: extract repository backlog projection`
3. `chore: extract repository backlog workflow`
4. `chore: extract repository backlog rows`
5. `chore: extract cockpit backlog projection`
6. `chore: extract cockpit backlog selection`
7. `chore: extract cockpit backlog rows`
8. `test: move backlog ownership specifications`
9. `chore: split repository backlog responsibilities`

Carry these observed debts explicitly rather than silently fixing them during
lossless moves: the unused `createIssueAction` gate, the unused
remove-assignment chain, an unmanaged 1,200ms timer, partial effects when a
`Promise.all` branch fails, and item IDs that are not provider-qualified.

Commit checkpoint: `chore: split repository backlog responsibilities`

Exit: each backlog parent is approximately 450–500 lines, `CockpitView.vue` is
at most 500 lines, component mounts fall to at most 14, aggregate component
time is at most 1.5 seconds, every responsibility has a direct owner, and
fixed-height and state parity remain green without routing, Core, Backend,
persistence, or remote-policy drift.

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
