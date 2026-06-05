---
name: codex-claw-dod
description: Use before handing off, committing, pushing, or calling Codex Claw work done. Run the Definition of Done checklist for latest request fit, scope, architecture, tests, coverage, Electron security, UX, docs, dirty worktree hygiene, and final handoff.
---

# Codex Claw Definition Of Done

Use this skill before saying Codex Claw work is done, before committing, before
pushing, or whenever Nicolas asks whether something is ready.

## Core Rule

Do not call work done just because it compiles. Walk the checklist, verify each
applicable gate, and explicitly call out anything skipped or not applicable.

## Checklist

Before handoff or commit, check every applicable item:

- [ ] **Latest request:** The implementation matches the newest user request,
  including follow-up corrections made during the turn.
- [ ] **Scope control:** No unrelated cleanup, formatting churn, or drive-by
  refactors are included.
- [ ] **Architecture:** Main/preload/renderer boundaries are preserved. Codex
  protocol details stay in the main-process driver/adapter.
- [ ] **Contracts:** IPC events, app event types, `RendererMessage`, persisted
  JSON, generated protocol types, and theme tokens stay compatible or have
  migration/regression tests.
- [ ] **Codex integration:** App-server lifecycle, approval requests, user-input
  requests, turn events, interruption, steering, and error states are handled at
  the right layer.
- [ ] **Electron security:** Renderer does not gain direct Node, filesystem,
  shell, Codex process, or broad Electron access.
- [ ] **Filesystem safety:** Folder, file, git, and Codex-home behavior cannot
  modify unrelated user data without an explicit user action.
- [ ] **Privacy/logging:** Logs, errors, and debug output avoid leaking prompts,
  file contents, secrets, tokens, or unnecessary local paths.
- [ ] **UX acceptance:** The workflow works, avoids layout jumps, and handles
  empty, loading, working, awaiting-input, error, and interrupted states.
- [ ] **Frontend standards:** Components stay small, typed, testable, and token
  themed. Element Plus is used for standard controls when practical.
- [ ] **Tests:** Every changed behavior has focused tests at the right level:
  main process, preload/IPC, renderer component, store/reducer, contract
  fixture, or desktop smoke.
- [ ] **Coverage:** Coverage remains at or above the configured thresholds. Once
  configured, the minimum is 85% for statements, branches, functions, and
  lines.
- [ ] **Relevant gates:** The relevant test/lint/build commands pass.
- [ ] **Visual verification:** Visible UI changes are checked in the running app
  or with screenshots when tooling exists.
- [ ] **Docs:** `AGENTS.md`, `docs/*.md`, and plans are updated when behavior,
  architecture, or workflow expectations change.
- [ ] **Worktree hygiene:** `git status --short` is reviewed; unrelated user
  changes are not staged.
- [ ] **Commit readiness:** The staged diff contains only intended files and
  uses the repo commit format.

## Verification Matrix

Run focused tests first, then the relevant final gates.

For docs-only changes:

```bash
git diff --check
```

For ordinary code changes once scripts exist:

```bash
npm test
npm run build
```

For coverage-sensitive work:

```bash
npm run test:coverage
```

For lint-sensitive work:

```bash
npm run lint
```

For visible frontend changes, also run the app locally and capture/check
screenshots when desktop smoke tooling exists.

If a script does not exist yet, say so clearly in the handoff instead of
pretending the gate passed.

## Stop Conditions

Stop and report clearly instead of committing when:

- a required test, lint, build, or coverage gate fails;
- the worktree contains ambiguous unrelated changes in files you need to stage;
- an Electron security, filesystem, Codex-home, or privacy boundary is
  uncertain;
- the implementation no longer matches the latest user request;
- protocol behavior cannot be inferred safely from fixtures or local smoke
  tests.

## Handoff Checklist

- [ ] Summarize what changed in one or two concrete sentences.
- [ ] Report exact verification commands and whether they passed.
- [ ] Mention remaining risks, skipped checks, or unrelated dirty files.
- [ ] If committing, stage only relevant files and use `feat:`, `fix:`,
  `test:`, or `chore:`.
