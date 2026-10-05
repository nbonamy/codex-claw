# Backend semantics and testing

Status: full semantic remediation and the three-boundary test redesign are
implemented. All 2,326 workspace tests plus 6 script tests pass, as do lint,
typechecks and affected workspace builds. Existing repository-wide coverage
deficits remain; this is not a fully green release gate. Debt is itemized below,
not waived or hidden.

The independent Codex review found five gaps after the initial handoff. Their
fixes and targeted regressions are recorded in the audit's **Independent review
corrections** section; the initial green suite did not cover those scenarios.
The second review's client-selection authority finding is addressed in the
audit's **Structural review correction** section.

Agreed execution order: **identify incorrect semantics → fix semantics →
inventory and improve integration tests**. The broad test audit is not a
prerequisite for semantic fixes. Each fix still includes focused regression
tests for the behavior it changes.

Naming audit delivered for review: [Backend semantics audit](backend-semantics-audit.md).
It inventories every registered RPC method, top-level event and direct driver
method with its purpose, rename decision and proposed name.

All audit rename/reshape/move/remove decisions are implemented; see the audit's
completion table for the concrete result. This includes durable review decisions,
unified input requests, independent event ownership, client preferences and
navigation, explicit query/mutation boundaries, lifecycle naming and capabilities.

Coverage debt was verified against an isolated committed baseline: core,
backend, Vue and Electron already fail configured coverage thresholds. Thresholds
have not been lowered. That debt belongs in the subsequent testing inventory;
it is not evidence of a new semantic regression.

## Target

Korus adapts Codex app SDK and Claude Agent SDK into a unified,
capability-driven backend. Its application consumes that backend without
needing provider identity to interpret product behavior.

Test Korus's translations and behavior, not either SDK's implementation.
Preserve provider-owned conversation rendering and state; this work must not
introduce a replacement Korus transcript reducer.

## Testing work ledger (2026-09-16)

The inventory below groups the exhaustive method/event inventory in
`backend-semantics-audit.md` by its actual owner. “Keep” does not claim exhaustive
coverage. The recorded assertions are the evidence for the named scenario only.
SDK columns are not applicable to provider-independent Git, filesystem, host,
persistence and integration services: their own external boundary is the owner.

| Domain | Owning tests and observable evidence | Disposition |
| --- | --- | --- |
| Provider prompts, settings and lifecycle | Codex `sdk-boundary-lifecycle`, `-controls`, `-sessions`: accepted/rejected sends, settings, attachments, archival order and rollback. Claude `sdk-boundary` joins the real transport, driver and server; `agent-sdk-transport` covers repeated turns, configuration changes, interruption and workspace isolation. | Rewritten Codex boundary; joined Claude boundary. Keep Claude translation unit tests because Korus owns that translation. |
| Plans and execution progress | Both SDK suites reach durable server review state and send acceptance back through the SDK. Codex duplicate/stale proposals cannot re-emit readiness. `agent-plan-review-service` covers cancellation, revision, retry, replacement during acceptance and persisted review round-trip. Mounted `App.backend-boundary` proves execution panel updates/clearing, review visibility, footer dismissal, cancel, failed acceptance and external resolution. App-state boundary covers background arrival, navigation and revision. | Added composition tests; retained focused lifecycle tests. Generic SDK plan reduction is not retested. |
| Approvals/questions | `agent-request-registry`: scope, collision, retry, stale replacement and lifecycle validation. Codex SDK tests use colliding approval/question ID `0`. Claude SDK tests route decisions and cancelled/pre-aborted permissions into backend state. App-state boundary tests identical IDs across navigation and failed response; mounted app observes approval cancellation. | Added joined lifecycle tests. Found/fixed missing Claude cancellation propagation. SDK-owned question widget permutations remain SDK tests. |
| Prompt queue/admission | `server-conversation-requests`: competing completion/idle events must send exactly once; acceptance/rejection/retry. App-state queue tests retain submission/agent ownership; mounted app proves queued row appearance/removal. Removing the in-flight lock makes the retained test fail. | Keep race coverage; add real composed visibility test. |
| Capabilities/catalogs | `driver-capability-boundary` enumerates 18 unsupported operations, empty catalogs, archive support and unadvertised permission modes. Codex SDK controls check fresh catalogs, nested cloning and failures. Existing app-state catalogs check invalidation/selection/errors; mounted app receives changing advertised capabilities without changing provider. | New boundary coverage, no artificial parity. Claude goals, fast tier and archive are unsupported. |
| Goals/usage/limits | Codex SDK projections check active/completed/cleared goals, action/event ownership, supplied context usage and account limits. Common optional-operation tests reject unsupported goals. Claude SDK transport measures live/persisted context without sending a prompt. Core policy/reducer tests own arithmetic and validation. | Rewritten provider mapping; retain pure algorithms. SDK token calculation is out of scope. |
| Provider conversation frames/history | Codex SDK suites check independent opaque revisions, paging/cache/error, TTL, cold settings, turn operations and late events. App-state replica recovery tests subscribe-before-load, gaps and stale selection. Claude history/stream translation tests belong to Korus. | Remove Codex SDK reducer/optimistic-row assertions; keep transport integrity and recovery. |
| Subagents/delegation | Codex `sdk-boundary-subagents`: owner routing, activity, live-vs-cold history, release and delayed identity after replacement. Existing delegated-report lifecycle/core tree tests own cross-agent coordination. | Migrated SDK inputs; retained Korus algorithms. Claude provider subagent stream projection is not an advertised equivalent. |
| Agents/teams/client navigation | `server-client-isolation-regressions`: concurrent clients cannot overwrite each other's selected agent or replay remote pending requests. App-state lifecycle tests retain stale-navigation cases. | Keep; included in focused integration command and normal glob-based CI. |
| Persistence/recovery | `state-persistence`: coalesced writes, no credentials/transcripts, invalid metadata and remote-pointer repair. Server session tests roll back failed persistence; review service persists/restores pending workflow. | Keep real serialization and failure assertions, not SDK storage tests. |
| Git/worktrees | Temporary Git repositories exercise actual commands and worktree safety. `server-git-workflow-requests` checks query/no presentation side effect, draft generation without conversation prompt, existing PR/push ordering and diff failure. `use-workspace-previews` rejects stale success/failure updates. | Keep; corrected obsolete test titles. SDK columns N/A. |
| Files/repository acquisition | Filesystem path/sandbox tests; `server-source-workspace-requests` proves clone/create/list/worktree operations use the selected remote host. Preview tests prevent obsolete failure from replacing a newer selection. | Keep external filesystem/host seam. SDK columns N/A. |
| Integrations/credentials/MCP | Provider HTTP/token-store tests and hosted MCP gateway verify fresh credentials, forced refresh after 401 and stripping incoming client credentials. App-state provider failure tests do not mark failed authorizations connected. | Keep security boundary tests. SDK columns N/A except adapter configuration injection. |
| Authentication/remote control | Codex SDK controls cover browser/device login, cancellation identity, logout/error and policy/pairing timestamps/client revocation. Remote auth RPC tests reject unknown host rather than authenticating locally; settings tests retain URL/code/copy behavior. | Migrate SDK facade calls; keep remote routing/host UI tests. Claude SDK does not expose these Codex operations. |
| SSH/remote routing | Remote client wire validation, malformed snapshots, owning-host prompts/actions and two-server pending-request recovery. Source-workspace tests reject local adoption of remote metadata. | Keep real protocol and location-isolation tests; do not duplicate these in provider fakes. |
| Automations/scheduling | Runner tests select/deduplicate work, handle no work and worktree failure; scheduler tests prevent concurrent runs and release execution state after failures. Remote routing and app-state CRUD remain covered separately. | Keep scheduler/runner external dependencies as fakes; provider SDK columns N/A. |
| Work assignments/PR monitoring | Assignment state transitions, PR head verification and app-state dispatch/removal tests remain. Core `work-item-prompts` owns optional fields, deterministic IDs/instructions and truncation. | Delete two duplicate Vue pure-format tests; retain actual assignment-to-backend calls. |
| Host effects/native adapters | Security/preload/wire/lifecycle, browser/computer-use validation and speech policy tests remain at native-process boundary. Host coverage is deficient; see explicit debt below. | Keep; do not claim host coverage is complete because backend tests pass. SDK columns N/A. |
| Debug/diagnostic support | `server-protocol-lifecycle` injects the normal domain pipeline. Mounted execution/review tests and existing debug panel tests prove separate presentation. | Keep behavior assertions, update misleading legacy title. |

### Implementation checkpoints

- [x] Add scripted typed SDK-surface fixture; no SDK reducer or fake app-server.
- [x] Extract existing Claude SDK query fixture mechanically, verify byte equality,
  then give each query its own output queue and indexed event delivery.
- [x] Add typed unified backend fixture reusing the existing app test client.
- [x] Join both provider SDK boundaries to the real backend plan-review state.
- [x] Join backend review events to mounted app, decision command, failure/retry,
  duplicate delivery and resolution from another client.
- [x] Complete migrations and replacement/deletion ledger.
- [x] Complete identified boundary scenarios and fault checks.
- [x] Update durable test guidance and normal gate entry points.
- [x] Run full tests, lint/typecheck, coverage and affected workspace builds; record outstanding debt
  without weakening thresholds or hiding sources.

### Replacement/deletion ledger

The old Codex adapter suite (47 cases, 2,287 lines) used a fake app-server
underneath a real SDK. Its useful Korus assertions moved to the public SDK seam;
the old driver suite (15 cases) mocked Korus's own adapter. Both files are removed.
This is not a claim that all 62 cases were useless.

| Removed scenario group | Replacement / reason |
| --- | --- |
| Generation and isolated runtime ownership | SDK controls assert folder/defaults and no conversation creation; projections assert injected host closure exactly once. |
| Login, device login/cancel and remote-control mapping | SDK controls: exact facade operations, targeted cancellation, errors, pairing/client/policy metadata. |
| Public create/resume/archive/close lifecycle and archived rollback | SDK lifecycle and sessions: ordering, load/archive failures, original session retention, orphan reconciliation and attached restoration. |
| User thread source, workspace-free chat and generated titles | SDK lifecycle/settings creation assertions; sessions test absent cwd, cold restore and title notifications. |
| Session compression/replacement | SDK sessions: handoff isolation/defaults, acceptance-before-archive and failed replacement rollback. Command routing remains in `codex-command`. |
| Simultaneous semantic events, full snapshots, history pages, retry metadata and remote messages | SDK events forward opaque frames with independent revisions; lifecycle/sessions preserve cache, TTL, paging and errors. Removed detailed SDK-native item reduction, exact optimistic user row generation and app-server pagination permutations: SDK-owned. |
| Tool/plan mutations and completed plan distinction | SDK events assert opaque forwarding and real server readiness; mounted application proves separate execution/review surfaces. No Korus Codex transcript reducer. |
| Subagent tree events, live history and cold completion | SDK subagents: routing, last-message cold reads, provider summaries, identity refresh and release/stale isolation. |
| Approval routing, cwd skills and null skill fields | SDK events collide approval/question IDs across two owners; projections retain defensive wire decoding and nullable-field normalization. |
| Prompt settings, attachments, model catalog/Astra, approval presets/capabilities, fast tier | SDK controls/lifecycle/sessions/projections preserve exact handle selection and settings; no hardcoded catalog filtering. |
| Immediate turn ID, orphan history, active goals and async questions | SDK lifecycle/projections retain returned turn ID, orphan interrupt policy and status distinctions. SDK reconciliation internals are deliberately not recreated. |
| Editing/retry/delete/fork/stable fork turn ID | SDK controls target real adapter operations at scripted handle; opaque snapshots/events remain provider-owned. |
| Slash review materialization and compact routing | SDK controls and existing command parser tests retain Korus routing. Deleted exact SDK-generated review prompt text/optimistic row assertions. |
| Driver pass-through title failure/history/catalog/lifecycle/goals | Real driver now participates in all six SDK suites; title error/retry, capabilities, history paging, goal set/clear and generation are tested against the SDK rather than a mocked Korus adapter. |
| Two Vue work-item prompt formatting cases | Removed duplicated pure-function tests; `core/src/__tests__/work-item-prompts.spec.ts` owns optional fields, truncation and assignment instructions. Vue still verifies assignment dispatch, removal and failed operations. |

Other suites are retained for their distinct purpose, not presumed redundant
because they share fixtures or exercise the same method. In particular the
Claude transcript translator, protocol decoder, persistence, filesystem/Git,
credential security and race tests belong to Korus.

### Fault sensitivity and defects found

Four temporary mutations were applied one at a time, tested, then restored:

| Deliberate fault | Test that failed |
| --- | --- |
| Drop server plan-ready translation | Codex SDK completed-plan → durable review test |
| Remove advertised permission-mode validation | Unified driver capability test |
| Remove queued-prompt in-flight guard | Existing server queue-drain race test; observed two sends rather than one |
| Drop agent identity when responding to SDK input | Colliding approval/question identity tests |

No fault flags or mutation machinery remain in production. Joined tests also
exposed two genuine defects and were observed red before fixing them:

- Replayed Codex proposals emitted duplicate `plan.readyForReview` events even
  though snapshot reduction was idempotent. The server now suppresses duplicate
  and obsolete-conversation proposals before publication.
- SDK-cancelled Claude permissions stayed pending in Korus until turn completion.
  The internal transport now notifies the conversation host; it resolves the
  app-owned request, clears waiting status when no other input is pending, and
  handles already-aborted signals. Completion cannot resolve the same request
  a second time.

### Remaining coverage debt (not a waived gate)

The previous committed baseline already failed coverage in core, backend, Vue
and Electron. Removing the blanket Claude exclusion makes the backend report
honest for both providers. No threshold was reduced and no source was excluded
to make this work pass. The three-boundary redesign is not a claim of exhaustive
branch coverage across all desktop/native services.

Concrete follow-up work, separate from SDK-owned behavior:

1. **Core:** reach the configured 90% statement gate; prioritize snapshot
   validation/recovery and malformed contract inputs, not duplicate happy paths.
2. **Backend:** close branch deficits in driver RPC, Git workflows, integration
   refresh/error handling, daemon lifecycle and SSH operations using their real
   owning seams. Include both providers in every future report.
3. **Application:** close app-state failure/recovery and capability branches;
   exercise user-visible outcomes through backend inputs, not private helpers.
4. **Electron:** prioritize `app-controller`, `backend-client`, `main-window`
   and logging failure/lifecycle branches. Fake the OS/process boundary and test
   actual controller behavior; provider SDK fakes cannot prove this surface.

These items remain open until the coverage command passes unchanged thresholds.
Do not advertise a fully green release gate or commit this work while a required
gate is unresolved without an explicit scope decision.

## Phase A — complete the audit before implementation

### A1. Inventory every backend subdomain and contract

- [x] Derive the complete subdomain inventory from protocol definitions, driver interfaces, backend services, event producers, persistence and application consumers—not from the examples already found.
- [x] Enumerate backend events, methods, capabilities and associated snapshot state.
- [x] Classify each as domain fact, command, query, client preference or explicit host effect.
- [x] Record keep/rename/reshape/move/remove decisions and all consumers.
- [x] Identify provider-specific product branches in app state/UI, distinguishing legitimate provider-owned conversation rendering.
- [x] Review every subdomain for UI leakage, provider leakage, ambiguous terminology, lifecycle/identity semantics, errors, concurrency and headless use.
- [x] Record reviewed/no-change conclusions with evidence, as well as defects.

Done when every discovered subdomain and contract entry has an evidence-backed
disposition. Reconcile the inventory against registered methods, event unions,
driver capabilities and their consumers so omissions are visible.

### A2. Produce the semantic remediation backlog

- [x] Turn A1 findings into scoped fixes with source references, affected consumers, acceptance criteria and dependencies.
- [x] Distinguish confirmed defects from legitimate provider metadata and explicit host capabilities.
- [x] Revise the provisional semantic items below from the full review.

Done when the incorrect semantics and their proposed replacements are explicit.
Proceed to fix these before undertaking the broad integration-test inventory.

### Subsequent testing phase: inventory coverage and test value

Begin this phase after the semantic fixes, using the corrected backend contract.

- [x] Map behavior groups to Codex SDK fake → real backend, Claude Agent SDK fake → real backend, and unified backend fake → real application state/UI.
- [x] Record applicable capabilities and justified not-applicable cells; provider-independent backend services retain their own appropriate tests.
- [x] Cite actual tests and assertions; distinguish proven behavior, partial coverage, wrong-boundary coverage and missing coverage.
- [x] Classify existing tests as keep / rewrite / merge / delete, with a reason and replacement where needed.
- [x] List concrete missing scenarios per subdomain, including failures and asynchronous lifecycle behavior; broader numerical coverage debt remains explicit above.

Done when the inventory identifies test changes across the entire backend—not
just plan review and Git.

### Subsequent testing phase: produce the test improvement backlog

- [x] Turn coverage findings into scoped work items with source references, acceptance criteria, dependencies and test replacements/deletions.
- [x] Revise, expand or remove the provisional items below based on the complete audit.
- [x] Execute under Nicolas's explicit "Do it all" authorization rather than stopping for another backlog approval.

Gate: identify the semantic defects first, then fix them with focused regression
coverage. Do not block semantic fixes on a full test inventory. Broad test
replacement and gap-filling follow the corrected contract.

## Phase B — semantic remediation

The complete remediation list is the semantic audit, including every rename and
all ten contract reshapes. The milestones below track the original plan and are
now implemented; the audit completion table covers the additional findings.

## 2. Make the backend contract independent of desktop types

- [x] Stop deriving `AppBackendEvent` from `MainToRendererEvent`.
- [x] Define backend domain contracts independently; desktop transport consumes them.
- [x] Separate explicit host effects such as display-Markdown, browser and celebration from domain events.
- [x] Separate client navigation/preferences from agent runtime operations where currently combined.

Done when a headless client can consume domain contracts without implementing
pane, window or navigation behavior. Intentional host capabilities remain
explicitly optional.

## 3. Known finding: plan presentation requests

Implemented remediation:

- [x] Replace backend-generated plan `sidePanel.markdownRequested` with a review-ready domain event.
- [x] Preserve agent/session/turn/proposal identity and original proposal content.
- [x] Represent pending/resolved review state and restore it through snapshots.
- [x] Add a targeted review-decision command; define acceptance, revision/cancellation semantics and stale/duplicate/failure handling.
- [x] Translate decisions through each provider adapter.
- [x] Have the desktop decide to show a pane and dismiss review controls.
- [x] Keep execution-progress plans separate from reviewable proposals.

Done when desktop and a headless test consumer can resolve the same proposal
through the same backend command, with no panel semantics in the domain workflow.

## 4. Known finding: Git diff presentation operations

Implemented remediation:

- [x] Replace `agent/git/diff/open` with a data query returning diff content/metadata or an error.
- [x] Remove derived `sidePanel.gitDiffRequested` from backend diff updates.
- [x] Move titles, localization and opening/error presentation to the application.
- [x] Preserve supported diff targets and agent scoping.

Done when reading a diff has no client-presentation side effect; UI can display
success, empty and error results.

## 5. Build the three test fixtures at the correct boundaries

- [x] Typed Codex SDK fake driving the real Korus Codex adapter/backend.
- [x] Typed Claude Agent SDK fake driving the real transport/driver/backend.
- [x] Unified backend fake driving real application state and representative mounted UI.
- [x] Controllable event delivery, deferred operations, errors and capability sets.
- [x] Reuse current fixtures where possible; avoid a generic simulation framework.
- [x] Share provider-independent backend expectations where useful, with provider-specific input scripts.

Done when both adapter suites can prove the same advertised backend behavior;
application scenarios run without selecting a provider name.

## 6. Candidate coverage: plan review and execution progress

At both SDK adapter boundaries:

- [x] Proposed plan becomes exactly one review-ready workflow.
- [x] Execution progress does not create a review.
- [x] Review decision reaches the correct SDK operation.
- [x] Cover duplicate events, stale sessions, failure and restored pending review.

At the application boundary:

- [x] Backend event/snapshot produces a visible review with correct content.
- [x] Implement/revise/cancel performs the agreed command and state transition.
- [x] Verify footer dismissal and failure behavior.
- [x] Cover inactive-agent arrival, switching, snapshot restoration and no reopening resolved reviews; retain general reconnect/sequence recovery tests.
- [x] Execution progress appears, updates and clears separately.

Done when deliberately breaking event translation, app-state handling or review
presentation makes an appropriate integration test fail.

## 7. Cover approvals and questions through each boundary

- [x] SDK request → unified pending request → backend decision → correct SDK response.
- [x] Test identity, blocking/nonblocking behavior, cancellation, failure and duplicate resolution.
- [x] Application consumes backend capabilities and pending state; generic Codex widget behavior stays SDK-owned.
- [x] Verify response routing and visible resolution with representative mounted tests.

Done when neither backend nor UI can silently lose a request or answer the wrong
agent/session.

## 8. Cover prompt lifecycle, queues and races

- [x] Submission acceptance/rejection, streaming/completion/error/interruption.
- [x] Completion and idle events in competing orders.
- [x] Exactly-once queue draining, retry after failure and stale-session isolation.
- [x] Application queued-row visibility/removal and agent switching.

Done when SDK-boundary sequences cannot trigger duplicate sends, stuck working
state or disappearing queued prompts. Retain useful existing race tests.

## 9. Cover capabilities, settings and session lifecycle

- [x] Supported/unsupported operations are capability-driven.
- [x] Model, effort, speed, permission and plan settings reach the adapter correctly.
- [x] Create/restart/resume/archive/close preserve the correct references.
- [x] Recovery, history hydration, late results and concurrent-agent isolation.
- [x] Application reacts correctly to capability changes and failed operations.
- [x] No artificial feature parity where a provider does not advertise support.

Done when the shared contract holds for every advertised capability, and
unsupported behavior is explicit.

## 10. Candidate coverage: other backend behavior

This is a seed list, not a residual bucket or an exhaustive list. The semantic
review must discover any additional subdomains; the subsequent testing phase
must assess their coverage against the corrected contract.

- [x] Map Git mutations/status, file activity, goals/usage, subagent coordination, authentication, remote routing, automations and assignments to their owning boundary and tests.
- [x] Reuse existing coverage where it proves the behavior.
- [x] Add identified boundary gaps, especially async failure and routing; record remaining coverage debt separately.
- [x] Do not force provider-independent backend services into SDK adapter tests.
- [x] Explicitly mark unsupported/not-applicable cells.

Done when every inventoried behavior has a test reference, a justified lower-level
test, or a concrete remaining work item. No blanket coverage claims based on
file names or test counts.

## 11. Replace and prune low-value tests alongside each migration

- [x] Classify existing tests as keep / rewrite at correct seam / merge / delete.
- [x] Record removed scenario groups and replacement suites, or why Korus does not own the assertion.

Primary candidates:

- Fake app-server tests exercising SDK internals rather than Korus.
- Tests asserting obsolete panel-event contracts.
- Pass-through tests whose meaningful behavior is already proven by integration coverage.
- Repeated permutations with identical failure detection.
- Tests only asserting that fixtures/mocks behave as configured.

Preserve:

- Pure Korus algorithms, validation, security and persistence tests.
- Focused failure/race tests with unique protection.
- Provider-routing and ownership assertions testing Korus responsibility.
- Protocol serialization tests with a distinct purpose.

Done when there are fewer maintenance obligations without losing Korus behavior
protection. No arbitrary deletion quota and no lowered coverage thresholds.

There is evidence of misplaced coverage, but no defensible count of useless tests
yet. A test using the wrong mock boundary may still contain valuable Korus
assertions. Preserve those assertions, not their unnecessary plumbing.

## 12. Make the strategy durable

- [x] Update existing testing/Codex ownership docs; the prior semantic migration already updated architecture/protocol docs.
- [x] Put the three boundary suites in normal CI gates.
- [x] Check representative intentional faults fail tests: dropped plan event, missing capability guard, duplicate queue send, incorrect request identity.
- [x] Run affected suites and full project gates at the end; coverage results and unresolved deficits are recorded below.

Done when the strategy is executable and enforced, not just prose.

## Delivery gates and provisional commit checkpoints

1. Identify incorrect semantics across backend subdomains (A1/A2).
2. Fix those semantics, including focused regression tests and updates to affected tests.
3. Inventory the three-boundary coverage and test value against the corrected contract.
4. Implement the test improvements, replacing and deleting obsolete or redundant tests.

The candidate commit slices below are not an execution order. Revise them after
the semantic review and execute semantic fixes before the broad testing work;
they do not assert that the necessary implementation work is already known.

Each checkpoint should leave working behavior and passing relevant tests. Split
further if necessary; do not land a broken intermediate protocol migration.

1. `test: establish backend contract fixtures` — minimal SDK/backend fakes with existing behavior coverage, informed by the completed inventory.
2. `fix: model plan review as a backend workflow` — plan semantics, decisions, snapshot state and desktop migration, with tests at all three boundaries.
3. `test: cover execution progress lifecycle` — progress-versus-review distinction and application visibility/clearing.
4. `chore: decouple backend contracts from desktop events` — remaining contract ownership and explicit host-effect separation.
5. `fix: return git diffs through backend queries` — diff query migration and application behavior tests.
6. `test: cover unified approval and question workflows` — SDK-to-backend and backend-to-application request lifecycles.
7. `test: cover prompt queue and terminal event races` — acceptance, retry, interruption and exactly-once draining.
8. `test: cover backend capabilities and session lifecycle` — settings, capability gating and recovery.
9. `test: close remaining backend integration gaps` — concrete gaps from the complete coverage matrix.
10. `chore: document backend testing ownership` — final documentation and CI alignment.

Replace or delete superseded tests in the same checkpoint that supplies the right
protection; do not postpone cleanup until after adding a parallel suite.
Update this checklist after each phase. Append key learnings about ways of
working and design patterns after execution is complete.

## Verification strategy

- Start each behavior change with a failing test at the appropriate public boundary.
- Mock the two SDKs for adapter integration tests, not their internal transports.
- Mock the unified backend for application tests; use capabilities rather than provider identities.
- Assert observable outcomes, correct identity and exact operation counts.
- Use mounted application assertions where visibility or interaction is the requirement.
- Run focused tests during iteration, affected typechecks/lint for contract changes,
  and full project test/coverage gates before completion.
- Validate affected desktop workflows proportionally; do not infer visible success
  solely from backend or component-prop tests.
- Keep existing coverage thresholds. Test count is not the success metric.

The goal is a suite that fails when Korus's responsibilities break, and does not
require maintenance when an SDK changes internally.

## Verification results — 2026-09-16

- `npm run test:ai`: core 285, backend 724, Vue 984, Electron 303, web 30;
  all pass, plus all 6 script tests. Final small fixture/type corrections were
  rerun with focused suites.
- `npm run test:integration`: both SDK boundaries, optional capabilities,
  server queue/client isolation and backend-to-application suites pass.
- `npm run lint`: all workspace typechecks, CSS checks and Knip pass.
- Core/backend/Vue workspace builds pass. No signed desktop packaging was
  attempted for this test redesign and its two backend lifecycle fixes.
- `git diff --check`: pass. No generated artifacts or changelog edits.
- `npm run test:coverage`: all tests pass; existing threshold failures remain:

| Workspace | Statements | Branches | Functions | Lines | Gate |
| --- | ---: | ---: | ---: | ---: | --- |
| Core | 88.96% | 85.30% | 88.40% | 90.85% | Statement threshold is 90% |
| Backend, now including Claude | 84.46% | 73.87% | 89.19% | 86.36% | Statements/branches below 85% |
| Vue | 88.45% | 79.85% | 89.85% | 90.92% | Statements below 90%, branches below 85% |
| Electron | 68.26% | 67.45% | 62.46% | 70.72% | All metrics below 85% |
| Web | 96.18% | 88.88% | 94.02% | 97.39% | Pass |

### Independent review follow-up — complete UI boundary

The review accepted the SDK boundaries but found three gaps in the application
tests. All three are corrected:

- The shared desktop client now supplies every `AppApi` method, checked
  against the required interface without casting a partial object. Normal tests
  use production `getSnapshotState`, connection state, sequence watermarks and
  disposable subscriptions. Per-test overrides merge into that complete fake;
  missing-method compatibility scenarios use an explicitly named legacy helper.
  Consequential operations require scripting. No backend reducer was added.
- The background-plan test asserts the exact owner-scoped review immediately
  after the event, before any navigation response can repair missing state.
- The mounted capability test opens the real composer menu, verifies disabled
  and enabled controls, selects plan mode and checks the submitted IPC options.
  It no longer treats forwarded component props as proof of UI enforcement.

Validation: all 2,329 workspace tests and 6 script tests pass (Vue: 987).
Full lint, workspace typechecks, CSS checks, Knip and `git diff --check` pass.
Temporary faults that discarded background reviews and hardcoded attachments
enabled each failed their intended assertion; both mutations were restored.
The fixture tests also cover startup sequencing, stale-event rejection,
connection state, daemon initialization, instance isolation and disposal.
Older tests now await authentication initialization and script consistent
catalog/navigation responses instead of silently skipping missing methods.

Refreshed Vue coverage: statements 88.39%, branches 79.76%, functions 89.88%,
lines 90.86%. The existing statement/branch coverage gate remains red; thresholds
and exclusions were not relaxed. This closes the three review findings, not the
separately recorded repository-wide coverage debt.

### Learnings

- A green reducer test does not prove the producer emits a semantic event once.
  Join the SDK boundary to the real server and assert event count as well as state.
- Testing SDK permission cancellation only at the transport hid a stale request
  in Korus. Test the observable backend state before the turn ends.
- Scripted fakes supply events/results; they must not reproduce provider reducers.
  Each concurrent SDK query needs its own stream, or the test harness itself
  destroys the isolation it is supposed to test.
- Keep focused algorithms/security/race tests when they protect distinct behavior.
  Replace the wrong boundary, not every small test. Fault probes validate that
  retained tests are actually sensitive to the regression.
- Coverage must include every supported provider. Reporting numerical debt
  separately is more useful than hiding a provider or transplanting SDK tests.
