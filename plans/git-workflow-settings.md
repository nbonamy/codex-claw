# Git workflow settings

Status: implemented and validated; local commits ready for review.
Local commits authorized. No push, merge, publication, release, or automatic review.

## Goal

Let people use their own Git workflow without fighting Korus. Preferences do not
grant permission to commit, push, rewrite history, or delete work.

## Settings → Git

Two global settings, saved immediately when changed like other settings:

| Setting | Choices | Default |
| --- | --- | --- |
| Pull strategy | Git configuration · Merge · Rebase · Fast-forward only | Git configuration |
| Update from base | Merge · Rebase | Merge |

There is no repository selector or repository override layer. Integration strategy
belongs only in the merge dialog: Merge commit, Squash, Rebase and fast-forward,
or Fast-forward only. The dialog initially selects Merge commit.

Pull updates the current branch from its upstream. Update from base brings the
base into the working branch. Integration brings completed work into the base.

Git configuration is the default where Git defines the policy: Pull resolves
effective branch/pull settings on the machine owning the checkout. With no policy,
use fast-forward only and require an explicit choice for divergent histories.
Git has no equivalent single setting selecting merge versus rebase for updating
from a base. Do not silently inherit autostashing or destructive behavior.

Keep preferences in Korus data without editing Git configuration or creating
repository files. Accept the current settings format directly; do not migrate
earlier development shapes or preserve superseded development defaults.

## Applying the preferences

One-off choices override global settings without changing them. Action dialogs
show actual source and target branches before mutation. Base selection remains
auto-detected, including nonstandard base names; no repository-level override.

Use precise labels such as “Rebase onto main.” Keep Commit and Commit & Push
distinct. A strategy choice never adds pushing or cleanup.

Korus-managed agent instructions receive global preferences as guidance. Explicit
user directions and applicable repository instructions still matter. Backend
enforcement covers Korus-owned operations, not arbitrary agent Git commands.

All policy, repository resolution, and Git execution belong in the owning backend,
including remote checkouts. No SDK changes.

## Failure handling and safeguards

Rebase includes conflicts, Continue/Abort, and restart-visible native operation
state. Rebase and fast-forward rebases the working branch, then advances the base
only if safe. Fast-forward only never rewrites or falls back to another strategy.

Validate dirty/shared worktrees, actual source and target, and recheck before
mutation. Published-history rewriting requires explicit operation confirmation;
force-with-lease pushing remains a separate action. No silent stashing, force push,
deletion, cleanup, or strategy fallback. Failed integration cannot trigger cleanup
or push. Existing explicit commit scope and cleanup controls remain intact.

Commit conventions, signing, branch naming, automatic cleanup/pushing, and hosted
PR merge workflows are out of scope. Local integration is separate from forge
merge policy.

## Implementation strategy and commit checkpoints

Keep each behavior change and its tests together in local commits.

1. **Preferences:** app-owned global settings/contracts, current-format validation,
   default Git-configuration Pull, one-off precedence, and owning-backend resolution.
2. **Pull:** explicit/configured strategies, real branch histories, unset policy,
   divergence, and refusal without fallback.
3. **Rebase lifecycle:** merge/rebase updates, conflicts, Continue/Abort, restart,
   published-history confirmation, dirty/shared checks, and abort restoration.
4. **Integration:** four resulting histories, safe target rechecks, no push or
   cleanup after failure.
5. **UI:** two autosaved global settings; integration in merge dialog only;
   one-off choices, concise source/target labels, and recovery controls.
6. **Guidance and routing:** app-owned local/remote operations and preference
   guidance without expanding authority. Representative app-boundary workflows.

## Test strategy

- Follow docs/testing.md and its Test Value Gate. No production-source assertions.
- Real temporary Git repositories prove histories, contents, conflicts, recovery,
  dirty/shared/published refusal, and absence of fallback or unintended mutations.
- Settings tests prove defaults, independent partial updates, persistence and
  one-off precedence. No tests for compatibility with discarded development data.
- Mounted UI tests exercise autosaving, errors, operation choices and confirmation.
- Verify local and remote app-owned routing. Shared Git directory identity is for
  mutation serialization across linked worktrees, not preferences.
- Focused tests/typechecks during iteration; proportional full gates and korus-dod
  before handoff. Runtime UI check for layout and save/reload behavior. No packaging.

## Progress

All six implementation phases completed. Original full validation passed:
3,648 workspace tests and 47 script tests; lint/typechecks; statement coverage
core 86.40%, backend 87.65%, Vue 88.12%, Electron 86.52%, web 95.89%.
Real app-server and built web-to-daemon workflows exercised Rebase onto `release`
and fast-forward integration without push or cleanup. Headless Chromium provided
runtime evidence after the Korus browser pane timed out. Provider connection and
catalog fixtures bypassed unauthenticated onboarding; Git/settings used the daemon.

Scope refinement implemented: two global settings, immediate autosave, integration
only in the merge dialog, no repository preference types/storage/routes/UI or
development-state migrations. Refinement validation passed: full `test:ai`
(3,645 workspace tests and 47 script tests), lint/typechecks, and `build:web`.
Headless Chromium verified two global controls, no Save button, automatic saves
through the owning daemon, reload persistence, usable widths, and no page errors.
Coverage figures above precede this simplification; coverage was not rerun.

Remote routing is contract-tested; no live SSH host, packaged desktop, signing,
release, or automatic review. Source-mode SDK wiring and lockfile pins unchanged.

## Completion learnings

- Follow existing settings autosave behavior. Keep operation choices in operation
  dialogs; avoid building persistence layers beyond the agreed product scope.
- Unreleased development schema changes do not require data migrations.
- Native rebase files supply restart recovery without another operation database.
  Recovery completes/aborts rebase; integration requires its own confirmation.
- Canonical common-directory identity serializes linked-worktree Git mutations.
- Explicit strategy flags override unrelated Git config. Consult configuration
  for strategy policy only when Git-configuration Pull is selected.
- Real histories catch unsafe fallbacks and shared-branch rewrites. Pair mounted
  interaction tests with runtime layout checks and independent snapshot copies.
