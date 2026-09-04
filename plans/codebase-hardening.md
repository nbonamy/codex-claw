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
- [ ] Phase 1: harden core state and contracts. **Phase 1.4 slice 13b active — decode local backend-event transports.**
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
- [ ] Phase 1.4 slice 13: add typed decoding at every backend-event wire ingress.
- [x] Phase 1.4 slice 13a: add the Core wire-event decoder and characterizations.
- [ ] Phase 1.4 slice 13b: decode local Electron and Web backend events. **Active.**
- [ ] Phase 1.4 slice 13c: decode remote backend events.
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
| 2026-09-04 | Phase 1.4 slice 13b: local transport decoder adoption | Active | root orchestrator | Electron `backend-rpc-session` and Web `backend-process` still trust typed backend-event notification casts | Decode unknown event notifications exactly once at each local ingress. Add direct transport tests proving malformed decoded notifications are ignored and logged without state mutation, while malformed JSON/RPC framing retains its current fatal behavior | — | Do not change remote transports until slice 13c. Preserve all valid-event behavior and transport framing; remove only the local event casts made obsolete by the decoder |
| 2026-09-04 | Phase 2.1: source workspace request manifest | Pending | root orchestrator | Prepared future move: `driver-rpc.ts` 466 lines / 47 cases, including 11 source/file/worktree cases; `server.ts` 2,759 lines / 102 cases; typed protocol baseline corrected to 12/156 methods | Read-only request, protocol, authority, filesystem-security, and test inventory complete | — | Introduce a deep source-workspace request owner with parsing, authoritative agent-folder resolution, local/remote routing, initialization, persistence, and error policy; retain filesystem confinement, symlink protection, size caps, remote stripping, and shared worktree ownership. Target driver dispatch 47 → 36 cases, server ≤93 cases, and typed protocol 23/154 after removing two obsolete internal file methods. Execute only after Phase 1 |
| 2026-09-04 | Phase 2.6: backend event coordination manifest | Pending / prepared | root orchestrator | `server.ts` currently owns about 299 event-coordination lines across 20 methods and six helpers; target owner is `backend/src/events/backend-event-coordinator.ts` | Read-only event ingestion, publication, persistence, remote forwarding, transcript, and lifecycle audit complete; implementation waits for the Phase 2 routing and source-workspace seams | — | Execute as four commits: `test: characterize backend event coordination`; `chore: extract backend event publication`; `chore: extract backend event coordination`; `test: move backend event ownership specifications`. Preserve event ordering, persistence-before-publication, remote projection/forwarding, and transcript invariants. Every substantial move uses `lossless-code-moves` with byte/AST fidelity. Exit: remove at least 290 net lines from `server.ts`, coordinator below 450 lines, and server event specs at or below 180 lines |
| 2026-09-04 | Phase 2.7: persistence codec manifest | Pending / prepared | root orchestrator | `backend/src/state-persistence.ts`: 1,357 lines / 71 functions / 81 `if` statements; main spec: 1,269 lines / 32 tests plus seven state-spec tests | Read-only codec, migration, recovery, topology, and test-ownership audit complete; split owners by app-state, agent, subagent, work, topology, and codec-values while retaining the load/save façade | — | Execute the seven recorded commits in order with declaration and test-body hashes for every lossless move. Preserve shape-based migrations, semantic recovery, and current invalid-JSON propagation. Exit: façade ≤140 lines, app-state ≤200, agent/work ≤450, topology ≤220, subagent ≤150, and every spec ≤600 lines |

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

1. `chore: add typed wire event decoder` — add the decoder and exhaustive
   direct Core characterizations; do not change transports.
2. `chore: decode local backend events` — migrate Electron
   `backend-rpc-session` and Web `backend-process`. Ignore and log malformed
   decoded event notifications, while malformed JSON or RPC framing remains
   fatal.
3. `chore: decode remote backend events` — migrate backend
   `remote-clawd-client` and the Web protocol, then update the relevant docs.
   Decode failures must not terminate the transport or reject pending
   requests.

Every relocation follows `lossless-code-moves` with byte/AST fidelity. Slice
13 exits when all four wire ingress seams decode `unknown` exactly once, no
transport cast remains, all 55 event keys are coupled exhaustively, malformed
event notifications cannot mutate state or kill a live transport, and Core,
transport, full-suite, typecheck, lint/Knip, cycle, and diff checks are green.

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
