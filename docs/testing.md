# Testing

Use focused tests while iterating, then run the relevant final gates before
handing off or committing.

Codex Claw is a desktop app. It does not have an HTTP API server, so do not
copy id8's API harness or endpoint coverage workflow here. When this repo says
"contract" or "workflow" test, it means Electron IPC, client state, renderer
behavior, or a fake backend transport.
As the backend seam grows, prefer fake backend drivers for app-controller
routing tests and fake Codex transports for Codex-driver/session tests.

## Quality Bar

Every code change must add or update tests for the behavior it changes. There
is no small-change exemption for code.

Coverage must stay very high. Once coverage tooling exists, the minimum
threshold is 85% for statements, branches, functions, and lines.

Rules:

- Do not lower coverage thresholds to land a change.
- Do not leave broad untested areas around IPC, protocol adapters,
  persistence, reducers, agent status, tool rendering, approvals, diffs,
  filesystem behavior, git behavior, Bench, or teams.
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

## Main Process Tests

Main-process tests should cover desktop backend behavior without depending on a
real backend process by default.

Cover:

- Codex RPC parsing, request/response matching, notifications, malformed
  responses, and server-initiated requests.
- App-server lifecycle decisions: spawn/connect, readiness, restart, shutdown,
  and process cleanup.
- Backend-driver routing for prompt send, interrupt, request responses, history
  hydration, model/skill catalogs, and unsupported capabilities.
- `CodexAgentSessionManager` behavior: start/resume thread, start turn, steer,
  interrupt, status updates, and event routing by agent/thread.
- Codex event adaptation into app-owned events and `RendererMessage` state.
- Approval and user-input request coordination.
- Persistence, migrations, settings, teams, agents, Bench templates, selected
  team/agent, and window state.
- Filesystem and git operations at the app boundary.

Use fake backend drivers, fake transports, and captured Codex app-server
fixtures for normal tests. A real Codex app-server smoke test is useful, but it
must be gated behind an environment variable and never required for the normal
unit-test gate.

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

Use integration-style renderer tests only when testing composition between
components, stores, router state, and IPC events.

High-priority renderer coverage:

- Agent list, team rail, Bench menu/surface, and status indicators.
- Provider capability mapping and the thin `CodexConversationPane` integration.
- Active-agent/conversation switching without draft or scroll leakage.
- Plan updates, reasoning summaries, command output, file changes, and diffs.
- Theme switching and SDK token bridging.
- Reload recovery from snapshots and buffered events.

Composer, message rendering, clipboard, attachment, paste/drop, transcription,
approval, and ask-user behavior belong to the SDK test suite and should not be
reimplemented or exhaustively retested in Codex Claw.

## Contract Fixtures

Codex app-server protocol fixtures are important. Keep them small, explicit,
and representative.

Rules:

- Store captured fixtures near the tests that use them unless a shared fixture
  folder becomes clearly useful.
- Include malformed and partial-stream cases, not only happy paths.
- Preserve enough original payload shape to catch protocol drift.
- Normalize through the adapter before renderer assertions.
- Do not make renderer tests import generated Codex protocol types.

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
npm run test:coverage
npm run lint
npm run build
```

For focused iteration, run the smallest relevant Vitest target first, then the
full relevant gate before handoff.

For visual changes, run tests plus a local app/screenshot check when the app can
boot.

For protocol or persistence changes, run focused tests for the touched module
and the full coverage gate.

## Conversation Performance Benchmark

Run `npm run benchmark:conversation` from the Claw repository to exercise the
two performance ownership boundaries without launching Electron:

- Claw hydrates five long agent transcripts and reduces 2,000 interleaved
  app-owned streaming events into the renderer replica.
- The SDK uses an isolated temporary Codex home, cold-loads five 200-turn
  conversations through a fake app-server transport, subscribes to every
  conversation, and routes 500 interleaved app-server deltas.

The command reports latency and throughput for both layers. Compare runs on the
same machine and power state; it is a diagnostic benchmark, not a wall-clock CI
threshold. Functional tests continue to assert event isolation and stable
active-transcript identity so correctness does not depend on benchmark timing.
