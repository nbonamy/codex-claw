# CLIProxyAPI connection setup

Status: proposed implementation; no proxy integration has been validated live.
Date: 2026-10-04.

## Decision and goal

Replace the abandoned native multi-account subscription feature with an easy
way to connect Korus to an existing CLIProxyAPI service. Start fresh from
main; do not merge or depend on `feat/multiple-subscriptions`.

Korus continues to own agents, provider selection, local tools, approvals,
conversation presentation and provider-runtime lifecycle. CLIProxyAPI owns
upstream accounts, OAuth credentials, refresh and account routing. Codex
app-server and Claude Agent SDK remain the native engines; the proxy sits
between those engines and their model APIs.

This plan records the scope discussed with Nicolas. Detailed UI placement and
any compatibility limitation discovered during the first phase should be
reviewed before extending the scope.

## Scope

- Configure a proxy URL and securely stored proxy API key on the owning host.
- Use that connection independently for Codex and Claude; direct mode remains
  the default and can be restored.
- Offer Test connection, clear connection feedback, and Open proxy dashboard.
- Keep existing Shared/Separate home settings, conversation history and
  provider-selection rules. Proxy selection must not allocate per-account
  homes, copy credentials between homes, or rewrite the user's CLI settings.
- Make proxy status explicit. Do not present a local CLI account's quota as
  the quota of the proxy's account pool.
- Verify real agent workflows through the proxy before claiming compatibility.

Out of scope:

- Native account registration, per-agent subscription selectors and account
  migration from the abandoned branch.
- Korus-owned OAuth flows, token refresh, auth-file swapping or symlink overlays.
- A new HTTP proxy, protocol translator, quota scheduler or automatic failover.
- Installing, bundling, updating or supervising CLIProxyAPI itself.
- Proxy management API integration, an embedded account dashboard, or importing
  upstream credentials into Korus.
- Promising account affinity for a whole Korus turn or the previously discussed
  reset-aware heuristic. CLIProxyAPI controls routing under its own policy.

## Proposed settings experience

Provide one host-owned CLIProxyAPI connection editor with:

- Server URL, with `http://127.0.0.1:8317` as an example.
- Masked API key input. A saved key is represented as configured, not returned
  in snapshots. Leaving it unchanged preserves it; clearing it is explicit.
- Independent Use for Codex and Use for Claude controls.
- Test connection with actionable outcomes such as unreachable, unauthorized,
  or incompatible response. State exactly what the check established; a model
  listing alone does not prove an inference turn can succeed.
- Open proxy dashboard, using the configured service's verified dashboard
  route without putting a secret in the URL. Do not ask for a management key.

Both provider settings panels use the same connection-mode presentation and
link to the shared editor. Preserve their enablement and Shared/Separate setup.
Do not introduce separate proxy accounts into the agent composer.

A missing proxy must yield a recoverable connection error. Never silently send
work directly to another account or endpoint. Native engines still need to be
installed. Applying connection changes must not interrupt a running turn;
define and test an explicit between-turn transition or defer activation until
the runtime can reconnect safely.

## Architecture and implementation boundaries

1. Add minimal app-owned connection settings and sanitized observations through
   core contracts, the daemon protocol, BackendClient and existing settings
   state. Keep provider-specific configuration behind backend adapters.
2. daemon validates the endpoint, owns the proxy secret and builds each child
   process's configuration. Use the repository's appropriate host-owned secret
   persistence boundary; confirm it works for desktop, web and remote hosts.
   Never rely on Electron-only storage for credentials needed by remote daemon.
3. The renderer sends an explicitly entered key only to its owning backend; it
   does not receive saved secret values, provider credentials or raw auth errors.
   Exclude keys and sensitive response bodies from logs, snapshots and URLs.
4. Configure Codex's custom Responses provider through supported SDK launch
   configuration. Keep MCP settings, permissions and SDK conversation ownership
   intact. Any missing generic SDK capability must be implemented in
   codex-app-sdk and consumed here, not bypassed with a parallel protocol client.
5. Configure Claude's endpoint and proxy authentication through its supported
   child-process environment/settings boundary. Ensure auth probes, model
   discovery, SDK queries and auxiliary inference paths use the same connection.
   Preserve real HOME and the configured Claude data directory.
6. Scope overrides to the selected provider and host. Do not mutate global
   process.env or share local proxy credentials with remote hosts. Loopback URLs
   are relative to the owning daemon host; make that clear in remote settings.
7. Preserve existing thread references and storage. Verify direct-to-proxy and
   proxy-to-direct resume with the actual engines; do not rewrite history or
   silently substitute an unavailable model to make a transition succeed.
8. Continue using existing provider availability and selection rules for manual
   creation, delegation, projects, review, fork/duplicate and automations.
   A proxy is a connection mode, not a third coding engine.

## Compatibility evidence and limits

The following source/documentation inspection supports investigating this
integration. It is not an end-to-end compatibility certification:

- [CLIProxyAPI Codex client configuration](https://help.router-for.me/agent-client/codex)
  documents a custom Responses provider, proxy authentication and model catalog
  configuration. API mode and OAuth mode differ; choose and validate one that
  does not introduce an unnecessary native subscription sign-in requirement.
- [CLIProxyAPI Claude Code configuration](https://help.router-for.me/agent-client/claude-code)
  documents ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN. Copy only the required
  connection settings, not its example permission bypasses or unrelated tuning.
- [CLIProxyAPI source](https://github.com/router-for-me/CLIProxyAPI/tree/8ef43e4df3b216a42493105d31c2873b69191473)
  was inspected for credential storage, refresh and upstream executors. It owns
  provider-specific behavior that Korus should not duplicate.
- Korus's existing Codex adapter passes SDK transport configuration, and its
  Claude transport loads user/project/local settings. This suggests suitable
  integration points, but does not establish that auth detection, catalogs,
  usage reporting or every native feature works through a gateway unchanged.

Recheck these contracts against the installed engine and proxy versions during
implementation. Do not infer support for native account services, connectors,
web search, remote control, attachments or other ancillary endpoints solely
from a successful text completion. Record the supported surface explicitly.

## Implementation and commit checkpoints

### 1. Prove the connection paths

- [ ] Use isolated state and an existing or explicitly provisioned test proxy;
  do not repoint Nicolas's active CLI or Korus processes.
- [ ] Exercise one native Codex app-server workflow and one Claude Agent SDK
  workflow through CLIProxyAPI: streaming, a local tool, approval handling,
  interruption and resume of the same conversation.
- [ ] Verify model discovery and auth/availability observations. Check auxiliary
  generation paths used by Korus, not just the main conversation launch.
- [ ] Verify direct/proxy transitions preserve history and existing home modes.
- [ ] Record exact versions and distinguish fake-server evidence from real
  authenticated upstream execution. If real credentials are unavailable, report
  that limit and do not call live compatibility proven.

Checkpoint: review the compatibility results before building the settings UI.
Keep disposable probes out of product code. Retain only useful owning-boundary
regression coverage. Possible commit: `test: cover proxy runtime compatibility`.

### 2. Add backend connection configuration

- [ ] Add host-scoped settings, secret persistence and sanitized status contracts.
- [ ] Add connection testing through daemon with bounded timeouts, cancellation,
  endpoint validation and safe errors. Do not forward keys across redirects.
- [ ] Implement the Codex adapter configuration and Claude SDK environment path.
- [ ] Preserve direct-mode defaults and implement safe configuration activation.
- [ ] Make usage/status behavior truthful in proxy mode; expose no invented
  aggregate subscription quota.

Suggested commits:

- `feat: add host-owned proxy connection settings`
- `feat: route codex through configured proxy connections`
- `feat: route claude through configured proxy connections`

### 3. Add the settings UI

- [ ] Read docs/frontend.md and korus-frontend-dev before UI changes.
- [ ] Implement the shared connection editor and consistent provider controls.
- [ ] Wire Test connection, masked saved-key state and dashboard opening.
- [ ] Cover loading, invalid configuration, offline proxy and authentication
  failure without discarding the user's input or changing active routing.
- [ ] Verify the rendered workflow against a branch-faithful isolated backend
  using korus-live-preview.

Suggested commit: `feat: add cliproxyapi connection setup`.

### 4. Validate and hand off

- [ ] Review the final diff and the compatibility matrix against actual behavior.
- [ ] Update existing durable architecture/provider docs where ownership or
  connection conventions changed. Add concise user setup guidance in the
  existing guide structure after reading website/README.md.
- [ ] Run affected tests, typechecks and lint, plus the cross-cutting test gate
  and appropriate coverage checks required by korus-dod.
- [ ] Run git diff --check and inspect git status. Do not update CHANGELOG.md,
  package/sign a release, merge or push as part of this implementation.
- [ ] Report limitations, configuration mode, runtime versions, test results and
  real versus simulated proxy evidence before requesting review.

Suggested final commit: `chore: document cliproxyapi connection support`.
Commit checkpoints are proposed boundaries, not authorization to commit/push.

## Test strategy

Use docs/testing.md, korus-testing-coverage and the mandatory test-audit
value gate. Tests must protect user behavior or owned boundaries, not source
text. Keep detailed provider wire tests in the owning SDK repository.

- Backend behavior: connection persistence across restart, unchanged direct
  configuration, per-provider opt-in, host isolation, saved-key replacement and
  removal, sanitized errors, no automatic direct fallback, and safe activation
  around active work.
- Protocol/client contracts: settings and observations round-trip without
  returning saved keys; remote operations target the correct backend.
- Mounted UI interactions: configure/test/save, independent provider toggles,
  saved-key behavior, offline/error recovery and dashboard navigation. Confirm
  there are no per-account selectors or misleading usage displays in proxy mode.
- Runtime evidence: test the native engines against a controllable local
  endpoint where practical, then verify real CLIProxyAPI workflows. A fake
  transport cannot prove upstream OAuth refresh or multi-account routing.
- Check representative manual and automated creation routes through the shared
  provider resolver; avoid duplicating equivalent tests across every dialog.
- All five workspaces gate on exactly 85% statement coverage. Do not lower
  thresholds or narrow the measured surface. Other coverage metrics remain
  diagnostics. No release packaging or signing is needed.

## Independent regression from the abandoned worktree

Before assuming deletion of the old branch loses only the abandoned feature,
check whether main already contains the independent skills-notification fix.
Do not merge the multi-account branch to recover it; reproduce and port only
the relevant behavior if it remains missing.

The observed failure was repeated roughly 1.9 MB skills.changed notifications
filling daemon's stdio output buffer. The old worktree's fix removed local
per-agent fanout of account/cwd-scoped skill catalog broadcasts in
backend/src/server.ts. It also made every matching mounted composer synchronize
after a shared skill cache update in vue/src/agent-composer-state.ts.

Historical regression evidence: a real backend plus StdioRpcPeer and a blocked
output stream reproduced the fanout with 64 agents; the fix reduced observed
overflow warnings from 112 to zero. Mounted composer coverage checked that all
matching composers updated without crossing folder/account/host boundaries.
Those results belong to the old implementation; revalidate any independent port
against main. This plan preserves the diagnosis, not the old patch.

## Progress and completion notes

No implementation phases are complete. Update this plan at the end of each
phase with results and decisions. At completion, append key learnings about
provider boundaries, effective compatibility checks and implementation workflow.
