---
name: codex-claw-dod
description: Use before handing off, committing, pushing, or calling Codex Claw work done. Apply a risk-based, bounded Definition of Done checklist and run only the smallest verification gates that prove the requested change.
---

# Codex Claw Definition Of Done

Use this skill before saying Codex Claw work is done, before committing, before
pushing, or whenever Nicolas asks whether something is ready.

## Efficiency rule

Verification is evidence gathering, not a ritual. Start with the narrowest
test that proves the changed behavior and expand only when the change crosses
a boundary or the focused gate exposes a related failure. The Definition of
Done skill never runs builds or packaging. Release artifacts are a separate
workflow, even when the task is otherwise complete.

Before running a command, state what uncertainty it resolves. If it resolves
none, do not run it. Do not repeat a passing command unless the relevant source,
fixture, generated artifact, or dependency changed afterward.

## Core Rule

Do not call work done just because it compiles. Walk the checklist, verify each
applicable gate, and explicitly call out anything skipped or not applicable.

## Risk classification

Classify the change before choosing commands:

- **Docs/config only:** no runtime behavior; run `git diff --check`.
- **Pure backend or shared logic:** focused unit/contract tests for changed
  files, then the affected workspace typecheck when contracts changed.
- **Renderer/UI:** focused component/store test, then renderer typecheck; use
  one proportional runtime/screenshot check only for visible behavior.
- **IPC/protocol/persistence/lifecycle:** focused boundary tests plus the
  affected workspace typecheck; run a broader suite only if the change spans
  workspaces or the focused tests cannot cover the contract.
- **Release/package request:** outside this skill. Stop the DoD checklist and
  use the explicit release workflow instead of starting a build here.

When several failures come from one command, collect and classify all of them,
fix them in one pass, and rerun that same command. Do not use a fix-test-fix
loop for each individual failure. After two unsuccessful iterations, stop and
reassess the root cause instead of blindly rerunning.

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
- [ ] **Coverage:** Run coverage only when coverage-sensitive code changed,
  coverage is explicitly requested, or the focused tests reveal an uncovered
  branch. Do not pay the cost of a repository-wide coverage run by default.
  Never lower configured thresholds.
- [ ] **Relevant gates:** The relevant test/lint commands pass.
- [ ] **Visual verification:** Visible UI changes are checked in the running app
  or with screenshots when tooling exists.
- [ ] **Docs:** `AGENTS.md`, `docs/*.md`, and plans are updated when behavior,
  architecture, or workflow expectations change.
- [ ] **Changelog:** Meaningful user-facing features and fixes get a short,
  user-oriented entry under the current release in `CHANGELOG.md`. Describe
  the outcome users notice; omit internal plumbing such as logging,
  refactors, tests, and dependency updates unless they change user behavior.
- [ ] **Worktree hygiene:** `git status --short` is reviewed; unrelated user
  changes are not staged.
- [ ] **Commit readiness:** The staged diff contains only intended files and
  uses the repo commit format.

## Minimal verification matrix

Choose exactly the smallest applicable row. Add a gate only when its boundary
is touched or the user requests it.

For docs-only changes:

```bash
git diff --check
```

For ordinary code changes once scripts exist:

```bash
npm test -- <focused-file-or-pattern>
```

If the repository script cannot filter tests, run the package-local Vitest
command with its file/pattern filter instead of the full suite.

For coverage-sensitive work:

```bash
npm run test:coverage
```

For lint-sensitive work:

```bash
npm run lint
```

For visible frontend changes, run the app locally only when a DOM/layout/runtime
property is part of the request. A single targeted screenshot or DOM check is
enough; do not launch a release build.

Never run `npm run build`, `npm run package`, Forge, signing, or notarization
from this skill. If a user asks for a release artifact, hand off to the
explicit release workflow rather than starting it as part of DoD. Avoid an
unfiltered repository-wide suite unless the change is genuinely cross-cutting
and no focused gate can prove it.

If a script does not exist yet, say so clearly in the handoff instead of
pretending the gate passed.

## Stop Conditions

Stop and report clearly instead of committing when:

- a required test, lint, or coverage gate fails;
- the chosen command has been run twice without a new root-cause hypothesis;
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
