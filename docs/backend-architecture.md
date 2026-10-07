# Backend Architecture

`daemon` is the Korus product backend: a separate Node process that orchestrates
Codex app-server, Claude Code, the Korus MCP server, git, files, automations, work
integrations and persistent state behind one app-owned protocol. It is not a
replacement for Codex app-server. Ownership rules live in
[architecture.md](architecture.md); message contracts in [protocol.md](protocol.md).

The executable is `korusd` (`product.daemonName`). Source filenames, RPC methods,
log and socket paths, npm scripts and launchd labels stay brand-neutral.

## Design Rules

- Routers validate and route; focused services own stateful workflow (retries,
  timers, persistence callbacks, cleanup). Do not grow a request switch into the
  owner of the workflow it exposes.
- Transport-specific clients own only process or socket lifecycle. One shared
  session implementation owns JSON-RPC framing, pending requests, timeouts and
  server callbacks; never copy lifecycle logic into a second transport.
- Provider setup follows the same split: `ProviderLifecycle` adapters own
  executable detection, install, home preparation and resource sharing;
  `ProviderSetup` owns locking, serialization, persistence and driver replacement.
  Authentication enters through the optional `AgentBackendDriver.authenticate`
  capability; the server caches the app-owned result and never interprets
  credentials or probes provider CLIs itself.
- Domain modules never self-register global timers. A runtime scheduler runs
  registered tasks (automation scans, PR monitoring) without overlap.
- Queued prompt delivery removes an item only after backend acceptance; transport
  failure keeps the FIFO head and retries with bounded backoff, without duplicate
  user messages.
- Agent creation (protocol, MCP delegation, independent review) goes through one
  `AgentCreationService`; callers only adapt their input.

## Transports

The protocol is transport-neutral JSON-RPC 2.0, one message per line.

| Transport | Use |
| --- | --- |
| stdio (`korusd --stdio`) | bundled local backend; same framing SSH uses |
| Unix socket (`korusd serve`, `APP_HOME/daemon.sock`) | optional always-on single-host daemon |
| SSH stdio | remote locations: `ssh <host> "node ~/.korus/daemon.mjs connect \|\| exec node ~/.korus/daemon.mjs --stdio"` |
| WebSocket (web host) | browser, allowlisted operations only |

- Electron's default `APP_BACKEND_MODE=auto` connects to a running local daemon,
  else starts the bundled stdio process. On reconnect it retries the same
  transport with bounded backoff and **never** falls back to a fresh bundled
  daemon after an established connection drops: that would fork authoritative
  state.
- `connect` bridges SSH stdio to a remote `daemon serve` socket when one is
  running, else the shell fallback starts a one-shot stdio backend. Sync never
  installs, starts or restarts a persistent remote daemon.
- No unauthenticated LAN server. Keep Unix sockets in a user-private `APP_HOME`;
  bind any HTTP transport (including the MCP server) to loopback. Add per-user
  tokens before named pipes, cross-user access or any network transport. TCP or
  WebSocket remote control needs its own authenticated design first.
- `stdout` is reserved for JSON-RPC in stdio mode; diagnostics go to stderr and
  `$APP_HOME/logs/daemon.log` (structured JSONL, size-rotated). Redact prompts,
  tokens, OAuth codes, command secrets and file contents from logs.
- Requests carry deadlines (`core/src/backend-protocol/request-timeout.ts`) so no
  client waits forever; Electron adds a grace period so a remote timeout reaches
  the desktop first.

### Background daemon (macOS)

Settings can install a per-user LaunchAgent that runs `daemon serve`, so agents and
automations survive closing the window. Enabling it does not move the current
session off its transport; the next launch in `auto` mode connects to it. At
startup Electron compares the packaged `korusd --version` with the running
daemon's health version: a stale idle daemon is refreshed silently, while active
agents or automation runs prompt for a restart.

### Remote Hosts (SSH)

Connection records live in `daemon`. Sync uploads the self-contained `daemon.mjs`
and the pinned Codex release (`~/.korus/codex/<version>/bin`), ensures Claude Code
through Anthropic's per-user installer when enabled (a Claude failure never
disables Codex), mirrors `provider-tokens.json` and asks the remote to reload
connections. It never copies state files, shell profiles or conversation data.
Remote hosts discover Codex themselves when no bundle is supplied. Version
discovery still accepts the previous `daemon` CLI name for hosts not yet upgraded.

## Development

`npm run dev` is the Electron-first entrypoint. It builds `daemon` to a dev bundle
and supervises a fresh local stdio backend instead of reusing an installed daemon
of the same version. Backend changes rebuild and restart the process (no HMR) and
the client re-syncs with `snapshot/get`; only durable state survives, and active
turns, pending approvals and in-memory MCP sessions are interrupted. Protocol
changes may require restarting both processes. Renderer changes keep Vite HMR.
`APP_BACKEND_MODE=in-process` exists for bisecting.

Folder-changing provider actions are rejected while chats are active because they
restart `daemon` and its provider processes; Electron closes hosted Browser panes
first and the client reloads from the synchronized snapshot so no cached
conversation or sequence cursor outlives the backend instance.

## Runtime And Packaging

- On macOS, launching a packaged app outside Applications installs it through
  Electron's native relocation API before creating backend resources or taking
  the single-instance lock. Electron relaunches the installed copy or focuses an
  already running installation. A write-access preflight keeps protected installs
  out of Electron's destructive privileged replacement path; users authorize those
  installations through Finder instead, with the existing app untouched. Ordinary
  replacement requires confirmation; cancellation or failure exits without starting
  the daemon. Installer diagnostics use the main log. The DMG presents one app icon;
  its background SVG and 1x/2x PNG assets share the Finder window's logical size.
- Desktop ships a private, checksum-verified Node runtime beside the daemon bundle
  (`Resources/runtime/node`, `Resources/daemon/korusd` + `daemon.mjs`). No system
  Node is required and the launcher is never put on `PATH`.
  `node-runtime-release.json` pins version and SHA-256 per platform/arch; Forge
  prepares and verifies it (cached archives included) before signing. Runtime
  updates ship with app updates.
- **Why not the alternatives:** Node SEA cannot load filesystem dependencies and
  needs native add-ons extracted at runtime; Electron `ELECTRON_RUN_AS_NODE`
  requires enabling the `RunAsNode` fuse, a real security regression because the
  app executable becomes a Node runtime (`forge.config.ts` keeps it off);
  `utilityProcess` cannot pipe stdin, so it would force a second transport.
  Author the backend as a plain Node program and keep the runtime pluggable.
- The bundle imports no `electron`, leaves Node built-ins external, ships
  sourcemaps, and avoids native dependencies unless their packaging and signing
  are designed.
- `codex-app-server-release.json` pins official Codex archive SHA-256s; preparation
  verifies hash, architecture and executable version on the native build host.
  macOS keeps upstream Codex signatures. Windows preparation verifies the whole
  package, keeps its `bin/`, `codex-path/` and `codex-resources/` layout intact
  (sandbox helpers and DLLs), checks the version from the final location because
  running staged binaries locks the directory, and rolls back on failed validation.
  The `extract-zip` dependency pins an overridden `yauzl`; keep its completion
  regression test.
- Computer Use, Screenshots and Apple speech helpers are macOS-only; packaging
  another OS does not enable them.
- Release builds sign and notarize; use `APP_SKIP_SIGNING=1` for local
  verification. Every build must still start the packaged backend and answer
  `backend/health/get`.

### Platform Matrix

macOS ARM64, Windows x64, Linux x64 and ARM64. Intel macOS is deferred because the
Computer Use helper is ARM64-only; Windows ARM64 is experimental. Passing builds do
not prove GUI installation, login or a full agent turn on a clean machine: do that
acceptance check before promoting the first release for an OS. Windows installers
are **unsigned** (SmartScreen warnings are expected; no certificate prerequisite).
Codex is bundled; Claude Code stays a separately installed prerequisite, as do
Git/GitHub tools.

## GitHub desktop releases

`npm run prerelease` (or, for an explicitly approved stable release, `npm run
latest`) is the only release command. It requires a clean checkout of the default
branch whose HEAD is pushed, creates the remote `v<version>` tag at HEAD (reusing
one already at HEAD, refusing one elsewhere or an already published release),
dispatches **one** workflow from that tag, and watches it to completion, printing
one line per job state change. Never move a release tag.

- The workflow (`.github/workflows/desktop-build.yml`) is quality, four native
  builds, publish. Because it is dispatched from the tag, the workflow, scripts and
  app source all come from the same immutable commit; a release-tooling fix means a
  new version.
- Quality checks run on Linux; macOS-only signing cleanup tests gate the macOS
  build. Publishing requires both the shared quality gate and every native build.
- Only the final job has contents-write permission. It requires every platform to
  ship its full installer set, stages them on a draft release, then publishes the
  requested channel. Published releases are never modified; an interrupted run
  leaves a draft that a rerun completes.
- Artifact names carry no run attempt, so `gh run rerun <id> --failed` yields a
  complete set. Resume watching with `npm run release:watch -- <run-id>`.
- Build-only validation: `npm run release:build` dispatches the current pushed
  branch with `channel=none`, which skips the tag check and publication.
- Install dependencies with `npm ci` and run `node node_modules/electron/install.js`
  before parallel tests or Forge (the lazy Electron download races between workers).
- Account and OAuth client IDs are GitHub **Secrets**, not Actions variables, to
  keep them private and masked. They still ship inside the app and can be
  extracted. Never put OAuth client secrets in the app. macOS signing uses a
  temporary keychain that is always cleaned up, and no signing credential reaches
  dependency installation or other OS jobs.
- Prereleases are manual downloads on every platform. Website links must use
  `/releases/tag/v<version>` or `/releases/download/v<version>/<asset>`;
  `/releases/latest` excludes prereleases. Asset names derive from product
  metadata; Windows `*-full.nupkg` and `RELEASES` bytes must stay intact because
  Squirrel's manifest references them.

### Desktop auto-update

Packaged macOS and Squirrel-installed Windows use Electron's native `autoUpdater`
against the public update service
(`update.electronjs.org/<owner>/<repo>/<platform>-<arch>/<version>`; origin
overridable with `APP_UPDATE_BASE_URL`), with the native Squirrel protocol, not
`serverType: 'json'`. The service ignores drafts and prereleases, so only promoted
stable releases update clients. Development, portable Windows and Linux report
automatic updates as disabled. On Windows and Linux, manual update requests fall
back to the repository's latest stable release downloads when the native updater
is disabled.

Installed macOS clients predating this still read
`meetkorus.dev/desktop/releases/darwin/arm64/RELEASES.json` and the DMG download
URL. Preserve both during prereleases. At the first approved **stable** cutover,
the website owner publishes a bridge entry in the existing JSON schema pointing to
a signed GitHub ZIP of a newer version that contains the new updater, keeping
history and verifying the download first. Never redirect that URL to the Electron
service: old clients expect a different response format.

Release notes in the What's New dialog are generated from `CHANGELOG.md`
(`npm run release-notes:generate`). `release-notes:check` runs before packaging and
fails on version mismatches, a missing changelog section or stale generated JSON.

## State Ownership

Durable state, files and token storage are described in
[architecture.md](architecture.md#state). Electron keeps only desktop window state
(bounds restored only when they intersect a connected display) and a volatile
snapshot cache advanced by sequenced `daemon` events; it never writes product state.
Persistent files are `daemon`-only.

## Security

`daemon` can read source trees, run coding backends, mutate git, store tokens and
manage MCP tools: treat it as a privileged control plane.

- Keep capability checks in `daemon`, not only in renderer UI.
- Never expose raw provider protocols to the renderer or to unauthenticated local
  clients.
- Keep the Korus MCP server loopback-only.
- Standalone `daemon` must not import Electron; secret storage sits behind an
  abstract token-store port.
