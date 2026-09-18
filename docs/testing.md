# Testing

Use focused tests while iterating, then run the relevant final gates before
handing off or committing.

Codex Claw has an Electron desktop host and an initial localhost-only Express
web host. Do not copy id8's generic API harness here. When this repo says
"contract" or "workflow" test, it means Electron IPC, the Claw WebSocket
adapter, client state, renderer behavior, or a fake backend transport.
Use a fake unified backend for app-controller/state routing tests, a fake Codex
SDK surface for the real Codex driver, and a fake Claude SDK query for the real
Claude driver. Do not run the real Codex SDK against a fake app-server in Claw's
normal tests: that boundary belongs to the SDK repository.

## Quality Bar

Every code change must add or update tests for the behavior it changes. There
is no small-change exemption for code.

Coverage must stay very high. Once coverage tooling exists, the minimum
threshold is 85% for statements, branches, functions, and lines.

Rules:

- Do not lower coverage thresholds to land a change.
- Do not leave broad untested areas around IPC, protocol adapters,
  persistence, reducers, agent status, tool rendering, approvals, diffs,
  filesystem behavior, git behavior, or teams.
- Prefer small focused tests during implementation.
- Run the relevant full gate before handoff.
- If a test cannot be run, say exactly why and what should be run next.
- If a change is docs-only or truly cannot be tested, say that explicitly.

## Principles

Use the same core testing principles as id8, adapted to a desktop app:

- Test behavior, not implementation details.
- Assert what the user sees, what IPC emits, what state changes, and what
  contracts return.
- Prefer workflow tests over isolated happy-path pings.
- Verify state transitions. A mutation should be followed by a read, list,
  status check, emitted event, persisted snapshot, or cleanup assertion that
  proves it happened.
- Use strict payload assertions whenever practical. Prefer `toStrictEqual()`
  for app-owned contracts and fixtures.
- Do not cherry-pick fields with scattered `toHaveProperty()` checks when the
  full shape is part of the contract.
- Keep tests isolated and idempotent.
- Clean up what tests create.
- Close streams, child processes, file handles, and long-lived subscriptions in
  `finally`.
- Mock external boundaries, not the logic under test.

## Test Value

Coverage is a guardrail, not a reason to preserve assertions that add no useful
confidence. Each test should protect at least one of these things:

- a user-visible outcome or interaction;
- an app-owned or external contract;
- a meaningful state transition or persistence guarantee;
- an error, security, or architecture boundary with realistic regression risk.

Avoid tests that freeze incidental implementation details:

- Do not assert every sentence or phrase in tool descriptions, model prompts,
  help text, or developer instructions. Test dynamic interpolation, conditional
  sections, schemas, and the behavior those instructions enable. If exact copy
  is itself the product contract, keep one focused assertion at its owning
  layer.
- Do not scan source text to pin function names, statement counts, exact file
  inventories, or a particular implementation spelling. Prefer public behavior
  and dependency-boundary tooling. Reserve source scans for narrow negative
  security or process-boundary guarantees that cannot be enforced structurally.
- Do not repeat the same contract at every layer. Give the detailed assertion
  to the owning unit, then keep only one representative integration smoke test
  at the next boundary.
- A table-driven test is valuable when its rows represent distinct mappings or
  behaviors. Do not multiply cases merely to increase the test count.

When a test would survive replacing the implementation with a constant string,
or would fail after a harmless rewording or refactor, reconsider what risk it is
actually protecting.

## Main Process Tests

Main-process tests should cover desktop backend behavior without depending on a
real backend process by default.

Cover:

- Claw RPC parsing, request/response matching, notifications, malformed
  responses, and client callbacks (not Codex SDK wire parsing).
- App-server lifecycle decisions: spawn/connect, readiness, restart, shutdown,
  and process cleanup.
- Backend-driver routing for prompt send, interrupt, request responses, history
  hydration, model/skill catalogs, and unsupported capabilities.
- Driver/adapter policy: create/resume/archive, submit/steer/interrupt,
  status projection and routing by agent/conversation.
- Codex routing-envelope behavior and SDK replica revision handling, without a
  second Claw transcript reducer.
- Host-boundary regressions proving Claw forwards SDK snapshots, events, and
  promise-returning conversation actions without duplicating SDK behavior.
- Approval and user-input request coordination.
- Persistence, migrations, settings, teams, agents, selected
  team/agent, and window state.
- Filesystem and git operations at the app boundary.

Use these ownership boundaries for integration coverage: a Codex app SDK fake
drives the real Claw Codex backend; a Claude Agent SDK fake drives the real Claw
Claude backend; a unified backend fake drives application state and mounted UI.
Claw tests its adapter translations and product behavior, not either SDK's
implementation. Process/socket transport tests still validate Claw's own wire
framing, decoding and lifecycle. Real provider smoke tests remain opt-in and are
never required for the normal test gate. The complete gap/value inventory is
tracked separately in the backend semantics and testing plan.

## Preload And IPC Tests

Preload is a security boundary. Tests should prove that it stays narrow.

Cover:

- Allowed IPC channels and argument validation.
- Typed bridge return values.
- Event subscription and unsubscribe cleanup.
- Renderer reload snapshot behavior.
- Errors from main surfaced in renderer-safe shapes.

Never expose broad Electron or Node primitives through preload.

## Renderer Tests

Renderer component tests use Vue Test Utils, Vitest, and jsdom.

Rules:

- Co-locate component tests in `__tests__/` folders.
- Give each component its own same-named spec file. Do not accumulate unrelated
  Vue components in a catch-all component suite.
- Test user-visible rendering and emitted actions.
- Use the real Element Plus plugin for controls.
- Narrow stubs are OK for brittle container primitives such as dialogs,
  popovers, or teleports when the product component contract is the unit.
- Do not mock Element Plus wholesale.
- Avoid product-component stubs unless the child component is covered
  elsewhere and the parent contract is the unit.
- Test routers/stores with realistic route/state setup when a component
  renders navigation or depends on app-level state.

## Component Isolation

Test components in isolation whenever the behavior belongs to that component.
Mount the real component with controlled props, fake user interactions, and
typed emitted events.

Rules:

- Prefer direct props and emitted events over booting the full app shell.
- Use small store fakes only when the component contract actually depends on a
  store.
- Vue Test Utils wrappers are auto-unmounted by the shared test setup. Clearing
  `document.body` is cleanup for teleports, not a substitute for unmounting.
- Stub IPC at the app boundary, not inside the component tree.
- Do not pull in Codex app-server fixtures for visual components unless the
  component is specifically a protocol-adapter view.
- Assert rendered text, aria labels, button states, selected rows, emitted
  payloads, and visible status changes.
- Test loading, empty, error, disabled, pending approval, and streaming states
  as separate cases.
- Keep snapshots rare. Prefer explicit assertions that explain the behavior.
- If a component is too hard to test in isolation, split it before adding
  brittle tests around the whole shell.
- Keep shared SDK behavior in the SDK component's isolated spec and keep only
  Codex Claw wrapper, adapter, and product-policy assertions in this repo.
- App-shell tests use contract-faithful product-child stubs by default and opt
  into real child trees only for representative composition workflows.

Use integration-style renderer tests only when testing composition between
components, stores, router state, and IPC events.

High-priority renderer coverage:

- Agent list, team rail, and status indicators.
- Provider capability mapping and the thin `CodexConversationPane` integration.
- Active-agent/conversation switching without draft or scroll leakage.
- Plan updates, reasoning summaries, command output, file changes, and diffs.
- Theme switching and SDK token bridging.
- Reload recovery from snapshots and buffered events.

Composer, message rendering, clipboard, attachment, paste/drop, transcription,
approval, and ask-user behavior belong to the SDK test suite and should not be
reimplemented or exhaustively retested in Codex Claw.

## Contract Fixtures

The reusable boundary fixtures are deliberately scripted, not simulators:

- `backend/src/codex/__tests__/sdk-surface-fixture.ts`: typed SDK methods,
  per-conversation snapshots and explicit SDK events. Tests supply the provider's
  resulting state; the fixture must not grow a transcript reducer.
- `backend/src/claude/__tests__/sdk-query-fixture.ts`: real transport consumes
  independently controlled SDK query iterators; inputs, permissions and failures
  are observable at the SDK boundary.
- `vue/src/test/client-api-mock.ts`: exhaustive, typed `CodexClawApi` fake with
  production snapshot/connection/sequence initialization and independent,
  disposable backend-event, app-command and update-status subscriptions. Explicit
  read defaults perform no I/O; consequential operations throw unless scripted.
  `backend-fixture.ts` adds sequenced event delivery for app state and mounted
  `App` tests. Neither fixture implements backend policy or a reducer.
- Shared desktop test setup merges per-test API overrides into this complete
  fake. Use `stubLegacyElectronTestWindow` only to explicitly test missing-method
  compatibility, never as the normal application boundary. Await asynchronous
  initialization before exercising controls; script consistent navigation and
  history responses instead of relying on missing APIs to skip those paths.

Assert event retention before supplying a later navigation snapshot that could
repair lost state. Capability tests should exercise a visible control and its
interaction result, not merely inspect forwarded component props.

`sdk-boundary-*.spec.ts`, Claude's `sdk-boundary.spec.ts`, and the app's
`*backend-boundary.spec.ts` exercise these seams. They run in the normal workspace
test glob and CI; `npm run test:integration` is a fast focused entry point.
Keep lower-level tests for Claw-owned algorithms, provider translation, wire
security, persistence, filesystem and Git safety. A provider-independent service
does not need artificial Codex and Claude variants.

Rules:

- Store captured fixtures near the tests that use them unless a shared fixture
  folder becomes clearly useful.
- Include malformed and partial-stream cases, not only happy paths.
- Preserve enough original payload shape to catch protocol drift.
- Drive the real adapter from SDK-shaped fixtures; drive renderer composition
  from the resulting app-owned contract, not an SDK fake inside the UI test.
- Do not make renderer tests import generated Codex protocol types.

When replacing tests, record the Claw behavior retained and the new owning suite.
Delete SDK-owned optimistic-message, raw protocol reduction and slash-prompt-copy
assertions instead of transplanting them. Do not replace useful failure, identity
or ordering tests with call-through smoke tests.

For a regression family, demonstrate sensitivity with a temporary deliberate
fault (for example dropping a review event or removing a queue lock), observe the
expected failure, restore the implementation, and rerun green. These probes are
local validation, not committed fault switches or a second test runner.

## Desktop Smoke And Visual Checks

Once the Electron shell exists, add smoke coverage for the core workflow:

1. App boots.
2. User creates or selects an agent.
3. User selects a folder.
4. Prompt is sent.
5. Assistant response streams.
6. Interrupt or approval path works when available.
7. State restores after reload.

Use Playwright, Electron automation, or the repo's chosen desktop smoke tool
once configured. Use screenshot checks for meaningful layout changes,
especially the app shell, sidebars, composer, artifact panes, diff view, and
theme switching.

## Gates

Use the repo scripts for broad verification:

```bash
npm test
npm run test:ai
npm run test:coverage
npm run lint
npm run lint:dead-code
npm run build
```

`npm run test:ai` runs the same workspace suites as `npm test`, but suppresses
per-test output and prints `[TESTS:DONE]` after each workspace summary. Prefer
it for agent-driven full-suite verification where concise, unambiguous output
reduces context use. Keep `npm test` for normal human-readable output.

`npm run lint` includes the Knip dead-code check. Run `lint:dead-code`
directly when iterating on unused files, dependencies, exports, or types.

For focused iteration, run the smallest relevant Vitest target first, then the
full relevant gate before handoff.

For visual changes, run tests plus a local app/screenshot check when the app can
boot.

Host-only iteration uses the suffixed root lifecycle commands. For example:

```bash
npm run typecheck:electron
npm run test:electron
npm run typecheck:web
npm run test:web
npm run build:web
npm run preview:web
```

The unqualified typecheck, lint, and test commands cover every workspace.

For protocol or persistence changes, run focused tests for the touched module
and the full coverage gate.

## Conversation Ownership Verification

Provider suites own exact transcript semantics. Claw tests only the boundaries
it owns:

- targeted provider operations never cross agent or conversation identity;
- one provider reset followed by revisioned deltas produces one renderer row
  per provider message;
- stale or gapped revisions trigger provider rehydration;
- Electron forwards provider frames without reducing conversation state;
- app snapshot persistence and synchronization remain transcript-free;
- Claw projections such as plans, diffs, unread state, and sidebar activity are
  read-only and cannot resurrect or mutate provider turns.

Plan review decisions are explicit backend commands, not projection mutations.
Test pending-review persistence, identity, idempotence and failed acceptance;
test the application opening/dismissing review in response to domain state.
Likewise, normalized pending input and typed outcomes must not require clients
to decode provider frames. Navigation/preferences tests assert client isolation
and no implicit runtime loading; snapshot queries must not perform maintenance.

Use captured long-conversation fixtures for deterministic performance or memory
regressions. Do not reintroduce a Claw transcript reducer solely to benchmark
provider traffic.
