# AGENTS.md

## Overview

This repository is **Codex Claw**, an Electron desktop app that merges the
team/agent product model from Skwad with native Codex rendering inspired by id8.

- Electron + Electron Forge desktop app.
- TypeScript across main, preload, renderer, shared contracts, and tests.
- Vue 3 with TypeScript and Element Plus for the renderer.
- Vitest for unit, component, contract, and desktop workflow tests.
- Codex is the implemented backend today, talking to the Codex app-server from
  Electron main. The shared contracts and main-process seams are backend-aware
  so a future Claude Code driver can be added without rewriting renderer UI.

Core product surfaces:

- **Teams**: Skwad-style top-level grouping for agents.
- **Agents**: named teammates with avatars, folders, backend sessions, and
  status.
- **Bench**: saved deployable agent templates.
- **Conversation**: native chat rendering for backend messages, tool calls,
  approvals, plans, command output, file changes, and diffs.
- **Artifacts**: document, plan, diff, git, and file panes beside the active
  conversation.

## Architecture

Preserve the product and process boundaries:

- Electron main is the desktop adapter. It owns windows, preload IPC, native
  dialogs, app lifecycle, packaged resource resolution, and the stdio client
  used to reach `clawd`.
- `clawd` owns backend process lifecycle beyond the Electron-to-backend stdio
  process, backend drivers, provider protocols, approvals, server requests,
  app persistence, backend-owned filesystem access, git, loops, and agent
  runtime state.
- Renderer owns visual state and interactions. It must not talk directly to
  Codex app-server or any future backend process, spawn tools, read arbitrary
  local files, or depend on backend protocol types.
- Preload exposes a small typed IPC bridge. Keep it boring and explicit.
- Backend events become app-owned events before they become renderer state.
- Codex-specific protocol data belongs in the Codex driver/adapter, not in
  reusable renderer components.
- Backend-dependent features must enter through app-owned contracts and the
  backend protocol first. Add or extend an optional driver method or capability
  behind `clawd`, route Electron through `ClawBackendClient`, and keep renderer
  components free of Codex/Claude protocol branches.
- `RendererMessage` is our app contract. It can borrow ideas from id8, but it
  is not bound to id8 or multi-llm-ts message shapes.
- Future provider support should arrive through backend drivers and translators
  behind `clawd`, not by making Electron main or renderer components
  provider-aware.
- Theme support must use semantic tokens and CSS variables. Do not hard-code
  product colors inside components.

Bench is a first-class concept. Treat it as saved deployable agent templates,
not a minor shortcut inside the New Agent button.

## Documentation Map

Keep `AGENTS.md` high-level. Before changing a feature area, read the relevant
doc and update it when behavior changes:

- `docs/testing.md`: desktop testing principles, coverage expectations,
  Vitest/component/contract/smoke test guidance, and verification gates.
- `docs/frontend.md`: Vue/Element Plus conventions, design tokens, app shell,
  visual references, and UX standards.
- `docs/team-cockpit.md`: design note for a possible team-scoped Cockpit entry
  inside the agent sidebar while preserving the global Cockpit.
- `docs/codex.md`: how Electron main communicates with Codex app-server,
  including transport, lifecycle, event adaptation, generated types, and test
  fixtures.
- `docs/claude.md`: Claude Code websocket/SDK protocol research, support
  strategy, and remaining Claude-driver questions.
- `docs/mcp.md`: how the app-owned MCP server exposes agent collaboration
  tools, inbox state, backend enablement, security, and tests.
- `docs/backend-architecture.md`: architecture record and implementation
  slicing for extracting the backend core into a separate TypeScript process.
- `docs/protocol.md`: app-owned JSON-RPC backend protocol between clients,
  `clawd`, and client callbacks implemented by Electron today.
- `docs/architecture.md`: product model, process architecture, IPC,
  backend seam, persistence, and open architecture decisions.
- `plans/codex-claw.md`: current product progression and commit checkpoints.
- `docs/codex.png`: visual reference for the target shell.

When a new doc is needed, discuss it with Nicolas first. If approved, add it
under `docs/` and link it here.

## Quality

Quality is not optional in this repo. Every code change must add or update
tests unless it is truly docs-only or impossible to test; in that case, say so
explicitly in the handoff.

Coverage must stay very high. Once coverage tooling exists, the minimum
threshold is 85% for statements, branches, functions, and lines. Do not lower
coverage thresholds to land a change.

Before editing code, read `docs/testing.md`. Before editing UI, also read
`docs/frontend.md`.

## Build

The app builds through Electron Forge. Keep build outputs, generated protocol
bindings, copied id8 renderer code, and packaged resources clearly separated
from source code.

Electron packaging signs and notarizes macOS builds by default. This can take a
long time and should be reserved for explicit release/signing work. For normal
agent verification that needs Forge packaging, set
`CODEX_CLAW_SKIP_SIGNING=1` so Forge skips macOS app signing, notarization, and
bundled helper signing:

```bash
CODEX_CLAW_SKIP_SIGNING=1 npm run package
CODEX_CLAW_SKIP_SIGNING=1 npm run build
```

When scripts exist, run the relevant focused tests while iterating and the
relevant build/test gate before handoff. Do not invent server/API integration
gates for this project; Codex Claw is a desktop app.

## Project Skills

Repo-local Codex skills live in `.agents/skills/`. When a task clearly matches
one of those areas, read the relevant `.agents/skills/<name>/SKILL.md` before
editing.

Use `codex-claw-dod` before handing off, committing, pushing, or calling Codex
Claw work done.

Never update `CHANGELOG.md` during ordinary implementation, review, handoff,
commit, or push work. Curate it only when Nicolas explicitly invokes
`update-changelog` or `prepare-release`.

- `codex-claw-dod`: Definition of Done checklist for scope, architecture,
  tests, coverage, security, UX, docs, worktree hygiene, and handoff.
- `codex-claw-frontend-dev`: Vue, Element Plus, app shell, chat rendering,
  artifact panes, design tokens, themes, and frontend tests.
- `codex-claw-testing-coverage`: Vitest, component isolation, IPC contracts,
  fake Codex transports, coverage triage, and verification gates.
- `update-changelog`: release-time audit of Claw and SDK histories, curated
  Unreleased notes, and an evidence-backed semantic-version recommendation.
- `prepare-release`: invokes `update-changelog`, confirms the recommended
  version, freezes release artifacts, and creates the local provenance tag.

## Plans

Plans are used for large implementations and are developed collaboratively.

- Only create a plan when Nicolas asks for one or when plan mode is active.
- Before saving a plan to disk, review it with Nicolas.
- Save plans under `plans/` in this repo, never under `~/.Codex/plans`.
- Use `feature-name.md` naming.
- Include implementation strategy, test strategy, and fine-grained commit
  checkpoints.
- Update the plan at the end of each phase.
- At the end of plan execution, append key learnings focused on ways of working
  and design patterns.

## Commits

Use single-line lowercase commit messages.

Valid prefixes:

- `feat:`
- `fix:`
- `test:`
- `chore:`

Use `chore:` for documentation-only commits unless Nicolas asks for a separate
`doc:` prefix.

## Dirty Worktree Hygiene

Before handoff or commit:

- Run `git status --short`.
- Review the diff.
- Stage only files relevant to the task.
- Do not revert unrelated user changes.
- Run `git diff --check`.
- Run the relevant tests or explain exactly why they were not run.

Never use destructive git commands unless Nicolas explicitly asks for them.
