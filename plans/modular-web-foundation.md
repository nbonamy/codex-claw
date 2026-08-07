# Modular Web Foundation

## Goal

Split Codex Claw into platform-neutral core, reusable Vue UI, Electron host,
and web host layers while preserving the existing desktop behavior. Keep
`clawd` as the authoritative backend and establish the transport and tenancy
seams required for a future multi-user cloud deployment.

## Architecture

- `@codex-claw/core`: framework-neutral contracts, reducers, selectors,
  protocol types, and client/host ports. It must not import Vue, Electron,
  Node filesystem APIs, or browser globals.
- `@codex-claw/vue`: the reusable Claw Vue application, components, styles,
  themes, i18n, and Vue state adapter. It receives platform services through
  typed injection rather than reading Electron globals.
- `@codex-claw/electron`: Electron main, preload, native capability adapters,
  and the desktop composition root.
- `@codex-claw/web`: browser composition root and Claw web transport. It may
  use `@codex-app-sdk/web` for Codex surfaces but must also preserve Claw's
  product-level backend contract.
- `@codex-claw/backend`: the existing Node `clawd` runtime. It remains the
  authority for teams, agents, persistence, credentials, files, git, and agent
  execution.

## Implementation Strategy

### Phase 1: Core package

- Rename the existing shared workspace to `core` and update workspace imports.
- Keep the current public contracts stable while introducing explicit backend
  and host capability ports.
- Add boundary tests that prevent platform dependencies from entering core.

Commit checkpoint: `chore: extract claw core package`

### Phase 2: Vue package

- Move the renderer application, components, styles, i18n, and component tests
  into a dedicated Vue workspace.
- Replace direct `window.codexClaw` access with a typed application bootstrap
  dependency supplied by the host.
- Keep capability-dependent controls explicit so unsupported web features can
  be hidden or replaced without platform checks throughout the component tree.

Commit checkpoint: `chore: extract claw vue package`

### Phase 3: Electron composition

- Keep Electron main and preload in the Electron workspace.
- Implement the Vue bootstrap port using the existing typed preload API.
- Update Forge/Vite/test configuration and prove desktop behavior remains
  unchanged.

Commit checkpoint: `chore: recompose electron claw app`

### Phase 4: Web foundation

- Add a web workspace with a browser composition root.
- Add a Claw-specific WebSocket transport for product requests/events; do not
  expose raw local sockets or filesystem authority to the browser.
- Integrate the SDK web transport at the agent conversation boundary where the
  SDK surface contract applies.
- Start with a fixed server-owned single-user tenant and document that no-auth
  mode is limited to localhost/private deployment.

Commit checkpoint: `feat: add claw web foundation`

## Test Strategy

- Run core contract/reducer tests after the package move.
- Run focused Vue state and App/AppShell tests after dependency injection.
- Run Electron preload, backend-boundary, and runtime configuration tests after
  recomposition.
- Add web transport tests for request correlation, event delivery,
  reconnect/disconnect behavior, malformed frames, and tenant context.
- Run workspace typechecks, CSS lint, and the relevant full test gate before
  handoff. Use unsigned packaging only if module resolution cannot be proven by
  typecheck and tests.

## Commit Checkpoints

- [x] `chore: extract claw core package`
- [x] `chore: extract claw vue package`
- [x] `chore: recompose electron claw app`
- [x] `feat: add claw web foundation`

## Learnings

- Keep product transport and provider surfaces separate. The SDK web package
  supplies portable browser/Node WebSocket ports, while Claw still needs its
  own allowlisted product protocol for teams, agents, files, loops, and
  settings.
- Capability flags are insufficient for security-sensitive features when they
  only hide UI. The web host also configures `clawd` so Computer Use and the
  embedded desktop browser are not registered as agent tools.
- The SDK already owns transcription discovery and composer visibility. A
  second Claw flag would duplicate state and eventually drift.
