---
name: app-live-preview
description: Use when interactively dogfooding any Korus feature from a worktree in the in-app browser, especially with seeded state, reload persistence, UI workflows, or branch-local backend changes.
---

# Korus Live Preview

Run a **branch-faithful preview** for any Korus feature: the real renderer and
backend from the current worktree, isolated app state, and enough realistic data
to exercise the behavior as a user would. Keep automated tests as a separate
gate; this preview exists to find integration, state, and interaction failures
that mounted tests can miss.

## Prepare The Preview

1. Read `docs/testing.md` and, for visible UI, `docs/frontend.md`.
2. Inspect the worktree and choose the exact workflow states worth exercising.
   Seed representative domain state, including meaningful edge states, rather
   than a decorative screenshot fixture. The seed must match the current
   app-owned schema.
3. Build the current worktree with `npm run build:web`.
4. Create a uniquely named temporary Korus home outside the repository. Include
   the agent or worktree identity in the prefix and let `mktemp` add uniqueness.
   Put the seed at `<preview-home>/state.json` (a legacy-shaped seed is migrated
   on first start, with its backup kept in `<preview-home>/backups/`) or write
   `roster.json` and `settings.json` directly; never point the preview at the
   user's normal Korus home.
5. If the normal Korus installation is already authenticated, copy only its
   `codex-home/auth.json` into `<preview-home>/codex-home/auth.json`, preserve
   restrictive permissions, and never read or print its contents. Otherwise,
   let the user authenticate in the isolated preview.

The preview home contains credentials and synthetic state. Keep it out of Git,
do not include it in command output, and remove it after the testing session.

## Allocate A Parallel-Safe Port

Assume other Korus agents are previewing other worktrees at the same time. Never
use a fixed port.

1. Ask the operating system for an available loopback port with a short-lived
   Node server bound to port `0`, then close that allocator. Run this as its own
   command and capture the printed port without shell command substitution:

   ```bash
   node -e "const net=require('node:net');const server=net.createServer();server.listen(0,'127.0.0.1',()=>{console.log(server.address().port);server.close()})"
   ```

2. Launch the preview immediately with the returned port.
3. If the preview loses the allocation race and reports `EADDRINUSE`, allocate a
   new port and retry. Do not stop or inspect another agent's server.
4. Keep the chosen port, persistent exec session ID, preview-home path, and
   worktree root together as this preview's ownership record.

Each agent gets its own preview home, backend process, port, and in-app browser
pane. Multiple previews may coexist; cleanup targets only the resources in the
current agent's ownership record.

## Pin The Worktree Runtime

Korus agents inherit environment variables from the host app. In
particular, `APP_BACKEND_COMMAND` and `APP_BACKEND_ARGS` may point
at the host app or a different worktree. A preview that inherits them can render
the new frontend against an old backend and produce convincing false failures.

Resolve the Node executable and worktree root with separate read-only commands,
then launch with literal absolute values:

```bash
APP_HOME=<preview-home> \
APP_BACKEND_COMMAND=<absolute-node-path> \
APP_BACKEND_ARGS=<absolute-worktree>/backend/dist/daemon.mjs,--stdio \
PORT=<allocated-loopback-port> \
npm run start:web
```

Run it in a persistent exec session. A successful preview serves only on a
loopback address and keeps running while the user tests it. Inspect process
arguments or query the app through its public web operation when provenance
needs confirmation; use process views limited to PID and command arguments so
credentials stay out of output.

## Drive The Real Shell

1. Open the allocated loopback URL with the Korus in-app browser.
2. Use browser DOM inspection before each interaction. Complete or skip
   first-run onboarding inside the isolated preview, then navigate to the
   feature through the same shell controls a user would use.
3. Confirm the seeded domain state is visible. If it is missing, check in this
   order:
   - the seed is valid under current persistence guards;
   - the backend snapshot contains it;
   - the preview is pinned to this worktree's backend;
   - the renderer adopted the snapshot through the unified client contract.
4. Exercise meaningful transitions, including reload when persistence is part
   of the feature. Let the user own subjective product evaluation; keep the
   preview live and report exactly what is synthetic.

Treat the UI as evidence, not as the implementation seam. Fix failures at the
owning domain, persistence, protocol, provider, or renderer boundary.

## Close The Session

When the user is finished:

1. Stop only the persistent web process in this preview's ownership record and
   confirm its loopback port is closed.
2. Validate the exact temporary preview-home path, then remove that directory,
   including the copied auth file and seeded state.
3. Confirm `git status --short` contains no preview state, credentials, build
   noise, or generated screenshots.
4. Report the automated gates separately from the live-preview evidence.
