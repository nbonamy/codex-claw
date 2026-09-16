# Backend semantics and testing

Status: full semantic remediation implemented; 2,306 workspace tests plus 6
script tests and all lint/typecheck gates pass. Existing coverage deficits remain.
The broader testing inventory has not started.

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

Claw adapts Codex app SDK and Claude Agent SDK into a unified,
capability-driven backend. Its application consumes that backend without
needing provider identity to interpret product behavior.

Test Claw's translations and behavior, not either SDK's implementation.
Preserve provider-owned conversation rendering and state; this work must not
introduce a replacement Claw transcript reducer.

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

- [ ] Map each behavior to Codex SDK fake → real backend, Claude Agent SDK fake → real backend, and unified backend fake → real application state/UI.
- [ ] Record applicable capabilities and justified not-applicable cells; provider-independent backend services retain their own appropriate tests.
- [ ] Cite actual tests and assertions; distinguish proven behavior, partial coverage, wrong-boundary coverage and missing coverage.
- [ ] Classify existing tests as keep / rewrite / merge / delete, with a reason and replacement where needed.
- [ ] List concrete missing scenarios per subdomain, including failures and asynchronous lifecycle behavior.

Done when the inventory identifies test changes across the entire backend—not
just plan review and Git.

### Subsequent testing phase: produce the test improvement backlog

- [ ] Turn coverage findings into scoped work items with source references, acceptance criteria, dependencies and test replacements/deletions.
- [ ] Revise, expand or remove the provisional items below based on the complete audit.
- [ ] Present the resulting test backlog for review before the broad test migration begins.

Gate: identify the semantic defects first, then fix them with focused regression
coverage. Do not block semantic fixes on a full test inventory. Broad test
replacement and gap-filling follow the corrected contract.

## Phase B — semantic remediation

The complete remediation list is the semantic audit, including every rename and
all ten contract reshapes. The milestones below track the original plan and are
now implemented; the audit completion table covers the additional findings.

## 2. Make the backend contract independent of desktop types

- [x] Stop deriving `ClawBackendEvent` from `MainToRendererEvent`.
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

- [ ] Typed Codex SDK fake driving the real Claw Codex adapter/backend.
- [ ] Typed Claude Agent SDK fake driving the real transport/driver/backend.
- [ ] Unified backend fake driving real application state and representative mounted UI.
- [ ] Controllable event delivery, deferred operations, errors and capability sets.
- [ ] Reuse current fixtures where possible; avoid a generic simulation framework.
- [ ] Share provider-independent backend expectations where useful, with provider-specific input scripts.

Done when both adapter suites can prove the same advertised backend behavior;
application scenarios run without selecting a provider name.

## 6. Candidate coverage: plan review and execution progress

At both SDK adapter boundaries:

- [ ] Proposed plan becomes exactly one review-ready workflow.
- [ ] Execution progress does not create a review.
- [ ] Review decision reaches the correct SDK operation.
- [ ] Cover duplicate events, stale sessions, failure and restored pending review.

At the application boundary:

- [ ] Backend event/snapshot produces a visible review with correct content.
- [ ] Implement/revise/cancel performs the agreed command and state transition.
- [ ] Verify footer dismissal and failure behavior.
- [ ] Cover inactive-agent arrival, switching, reconnect and no reopening resolved reviews.
- [ ] Execution progress appears, updates and clears separately.

Done when deliberately breaking event translation, app-state handling or review
presentation makes an appropriate integration test fail.

## 7. Cover approvals and questions through each boundary

- [ ] SDK request → unified pending request → backend decision → correct SDK response.
- [ ] Test identity, blocking/nonblocking behavior, cancellation, failure and duplicate resolution.
- [ ] Application shows requests based on capabilities and backend state.
- [ ] Verify response routing and visible resolution with representative mounted tests.

Done when neither backend nor UI can silently lose a request or answer the wrong
agent/session.

## 8. Cover prompt lifecycle, queues and races

- [ ] Submission acceptance/rejection, streaming/completion/error/interruption.
- [ ] Completion and idle events in competing orders.
- [ ] Exactly-once queue draining, retry after failure and stale-session isolation.
- [ ] Application queued-row visibility/removal and agent switching.

Done when SDK-boundary sequences cannot trigger duplicate sends, stuck working
state or disappearing queued prompts. Retain useful existing race tests.

## 9. Cover capabilities, settings and session lifecycle

- [ ] Supported/unsupported operations are capability-driven.
- [ ] Model, effort, speed, permission and plan settings reach the adapter correctly.
- [ ] Create/restart/resume/archive/close preserve the correct references.
- [ ] Recovery, history hydration, late results and concurrent-agent isolation.
- [ ] Application reacts correctly to capability changes and failed operations.
- [ ] No artificial feature parity where a provider does not advertise support.

Done when the shared contract holds for every advertised capability, and
unsupported behavior is explicit.

## 10. Candidate coverage: other backend behavior

This is a seed list, not a residual bucket or an exhaustive list. The semantic
review must discover any additional subdomains; the subsequent testing phase
must assess their coverage against the corrected contract.

- [ ] Map Git mutations/status, file activity, goals/usage, subagent coordination, authentication, remote routing, automations and assignments to their owning boundary and tests.
- [ ] Reuse existing coverage where it proves the behavior.
- [ ] Add concrete missing scenarios, especially async failure and routing.
- [ ] Do not force provider-independent backend services into SDK adapter tests.
- [ ] Explicitly mark unsupported/not-applicable cells.

Done when every inventoried behavior has a test reference, a justified lower-level
test, or a concrete remaining work item. No blanket coverage claims based on
file names or test counts.

## 11. Replace and prune low-value tests alongside each migration

- [ ] Classify existing tests as keep / rewrite at correct seam / merge / delete.
- [ ] Record each removed test's replacement scenario, or why it tests behavior Claw does not own.

Primary candidates:

- Fake app-server tests exercising SDK internals rather than Claw.
- Tests asserting obsolete panel-event contracts.
- Pass-through tests whose meaningful behavior is already proven by integration coverage.
- Repeated permutations with identical failure detection.
- Tests only asserting that fixtures/mocks behave as configured.

Preserve:

- Pure Claw algorithms, validation, security and persistence tests.
- Focused failure/race tests with unique protection.
- Provider-routing and ownership assertions testing Claw responsibility.
- Protocol serialization tests with a distinct purpose.

Done when there are fewer maintenance obligations without losing Claw behavior
protection. No arbitrary deletion quota and no lowered coverage thresholds.

There is evidence of misplaced coverage, but no defensible count of useless tests
yet. A test using the wrong mock boundary may still contain valuable Claw
assertions. Preserve those assertions, not their unnecessary plumbing.

## 12. Make the strategy durable

- [ ] Update existing architecture/protocol/testing docs with ownership rules.
- [ ] Put the three boundary suites in normal CI gates.
- [ ] Check representative intentional faults fail tests: dropped plan event, missing capability guard, duplicate queue send, incorrect request identity.
- [ ] Run affected suites and full project gates at the end.

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

The goal is a suite that fails when Claw's responsibilities break, and does not
require maintenance when an SDK changes internally.
