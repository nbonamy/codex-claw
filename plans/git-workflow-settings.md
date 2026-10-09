# Git workflow settings

Status: in progress. Implementation and coherent local commits authorized by delegation.
No push, merge, publication, release, or automatic review authorized.

This reconstructs the proposal discussed with Nicolas; it is not a recovered copy
of the earlier document.

## Goal

Let people use their own Git workflow without fighting Korus. Settings select
defaults; they do not grant permission to commit, push, rewrite history, or delete
work.

## Settings → Git

Start with three independent choices:

| Setting | Choices | Proposed default for new installations |
| --- | --- | --- |
| Pull strategy | Git configuration · Merge · Rebase · Fast-forward only | Git configuration |
| Update from base | Merge · Rebase | Merge |
| Integrate into base | Merge commit · Squash · Rebase and fast-forward · Fast-forward only | Merge commit |

Pull updates the current branch from its upstream. Update from base brings the
selected base into the working branch. Integration brings completed work back into
the selected base. One global “merge vs rebase” toggle cannot express all three.

For Pull, “Git configuration” resolves the repository's effective pull strategy on
the machine owning the checkout. If no strategy is configured, use fast-forward
only; divergent histories require an explicit choice. This setting is not
permission to inherit unrelated destructive behavior or enable hidden autostashing.

“Rebase and fast-forward” explicitly rebases the working branch onto the base,
then advances the base only if safe. “Fast-forward only” never rewrites commits and
never silently falls back to merge or squash.

For existing users, seed Merge / Merge / Merge commit to preserve behavior. New
installations default Pull to Git configuration. Both can change the settings
explicitly.

## Scope and precedence

Provide app defaults plus optional repository overrides. Worktrees of one clone
share its override; separate clones and remote locations remain distinct. Keep
preferences in Korus data without editing Git configuration or committing a new
repository file.

Resolve each preference as:

1. One-off operation choice.
2. Repository override.
3. App default.

Git configuration is consulted only when that option is selected.

Show repository overrides in Settings → Git through a repository selector;
inherit app defaults until overridden. The Git menu can open the settings for its
current repository.

The base branch remains auto-detected, with an explicit repository-level override.
Show the actual target branch before applying an operation; do not assume every
repository uses main.

## Applying the preferences

Existing Git actions use the effective defaults. Their dialogs expose a compact
strategy choice and the actual source/target branches. Changing a choice affects
that operation only; saving a default is explicit.

Use precise action text, such as “Rebase onto main,” without explanatory Git
lessons. Keep Commit and Commit & Push distinct. Choosing a preferred strategy
never silently adds a push or cleanup step.

Korus-managed agent instructions receive the effective repository preferences as
guidance. Explicit user directions and applicable repository instructions still
matter. The backend enforces Korus-owned operations; preferences are not a
guarantee about arbitrary Git commands an agent executes independently.

All policy, repository resolution, and Git execution belong in the Korus backend,
including remote checkouts. No SDK changes are needed for this feature.

## Failure handling and safeguards

Rebase support includes conflicts, Continue and Abort, and visible in-progress
operation state after restart. An integration operation must not proceed to push
or cleanup until the requested integration has actually succeeded.

Dirty or shared worktrees require appropriate checks. No silent stashing, force
push, deletion, or strategy fallback. A published branch that would be rewritten
requires explicit confirmation; an eventual force-with-lease push remains a
separate action.

## First-version scope

Include the three strategies, repository overrides, base-branch selection,
one-off choices, and proper conflict handling.

Leave commit-message conventions, signing, branch naming, automatic cleanup,
automatic pushing, and new hosted-PR merge workflows out of this change. Existing
commit scope and cleanup controls remain intact. Local integration settings must
not be confused with a forge's PR merge policy.

## Implementation strategy and commit checkpoints

These are the authorized implementation milestones.
Keep each behavior change with its tests. Update this plan after each phase.

1. **Preferences and resolution:** add app-owned settings/contracts, migration
   preserving existing behavior, repository/worktree identity, inheritance and
   remote-owner resolution. Test normalization, precedence, migration and
   isolation between repositories and locations.
2. **Pull strategies:** apply explicit or configured strategies in the backend.
   Test actual branch histories in temporary Git repositories, including unset
   configuration, divergence and refusal without fallback.
3. **Rebase lifecycle and base updates:** add merge/rebase updates with operation
   state, conflict reporting, Continue/Abort and restart recovery. Test dirty,
   shared and published branches and restoration after abort.
4. **Integration strategies:** implement merge commit, squash, rebase-and-fast-
   forward and fast-forward-only behavior. Test resulting history, target safety,
   and prevention of push/cleanup on failure.
5. **Settings and workflow UI:** expose defaults, repository overrides, base
   selection and per-operation choices; use precise action labels and render
   conflict controls. Test mounted user interactions, inherited values and the
   distinction between one-off choices and saved defaults.
6. **Agent guidance and end-to-end wiring:** expose effective preferences to
   agents without expanding authority; verify local and remote routing and run
   representative workflows through the app-owned boundary.

## Test strategy

- Follow the Test Value Gate in docs/testing.md. Prefer observable outcomes over
  assertions about implementation text or command arrays alone.
- Use real temporary Git repositories for strategy and recovery behavior;
  exercise fast-forwardable and divergent histories and inspect resulting commits
  and worktree contents.
- Test preference resolution at its owner, including existing-user migration,
  reset-to-inherit, linked worktrees and remote locations.
- Mount settings and operation dialogs to exercise choices and confirmations.
- Verify no implicit push, force push, cleanup, autostash or strategy fallback;
  failed or conflicted operations must retain recoverable state.
- Use focused tests and affected-workspace typechecks while iterating; apply
  korus-dod before each handoff. Do not run release packaging for this feature.

## Progress

Scope and defaults confirmed by delegation. Worktree setup and ownership inspection
complete. Existing Git, settings, and workflow UI baseline: 95 tests passing.
The parent confirmed implementation authorization after the fix-skill invocation.
Phase 1 implemented: settings normalization, existing-user migration, precedence,
and owning-backend repository identity shared by linked worktrees.
Phases 2–3 backend execution implemented: explicit/configured Pull strategies,
merge/rebase updates, published-history confirmation, native restart-visible rebase
state and Continue/Abort. Real-repository and service tests: 60 passing; core and
backend typechecks pass. UI and app-boundary recovery wiring follow in phase 5.
Phase 4 implemented: all four integration histories, explicit base overrides,
source/target rechecks and cleanup only after success. Real repository tests
replace overlapping command-array assertions; 62 focused tests pass.

## Completion learnings

Append reusable ways-of-working and design-pattern learnings after execution.
