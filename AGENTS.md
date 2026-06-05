# AGENTS.md

## Overview

This repository is **Codex Claw**, an Electron desktop app that merges the
team/agent product model from Skwad with native Codex rendering inspired by id8.

- Electron + Electron Forge desktop app.
- TypeScript across main, preload, renderer, shared contracts, and tests.
- Vue 3 with TypeScript and Element Plus for the renderer.
- Vitest for unit, component, contract, and desktop workflow tests.
- Codex-only backend for the first product, talking to the Codex app-server
  from Electron main.

Core product surfaces:

- **Teams**: Skwad-style top-level grouping for agents.
- **Agents**: named teammates with avatars, folders, Codex threads, and status.
- **Bench**: saved deployable agent templates.
- **Conversation**: native chat rendering for Codex messages, tool calls,
  approvals, plans, command output, file changes, and diffs.
- **Artifacts**: document, plan, diff, git, and file panes beside the active
  conversation.

## Architecture

Preserve the product and process boundaries:

- Electron main owns Codex app-server process lifecycle, JSON-RPC transport,
  request IDs, approvals, server requests, app persistence, and filesystem
  access.
- Renderer owns visual state and interactions. It must not talk directly to
  Codex app-server, spawn Codex, read arbitrary local files, or depend on
  app-server protocol types.
- Preload exposes a small typed IPC bridge. Keep it boring and explicit.
- Backend events become app-owned events before they become renderer state.
- Codex-specific protocol data belongs in the Codex driver/adapter, not in
  reusable renderer components.
- `RendererMessage` is our app contract. It can borrow ideas from id8, but it
  is not bound to id8 or multi-llm-ts message shapes.
- Future Claude Code support should arrive through a new backend driver and
  translator, not by making every renderer component provider-aware.
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
- `docs/codex.md`: how Electron main communicates with Codex app-server,
  including transport, lifecycle, event adaptation, generated types, and test
  fixtures.
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

The app is expected to build through Electron Forge once scaffolded. Keep build
outputs, generated protocol bindings, copied id8 renderer code, and packaged
resources clearly separated from source code.

When scripts exist, run the relevant focused tests while iterating and the
relevant build/test gate before handoff. Do not invent server/API integration
gates for this project; Codex Claw is a desktop app.

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
