# Git workflow settings

Status: narrowed scope implemented and validated.
Local commits authorized; no push, merge, publication, release, or automatic review.

## Scope

Settings select how the existing Pull and Update from base operations combine
histories. Preserve their user interaction. Preserve Merge entirely: UI, target
selection, strategies, execution, push, and cleanup.

Settings → Git has two global, immediately autosaved dropdowns:

| Setting | Choices | Default |
| --- | --- | --- |
| Pull strategy | Git configuration · Merge · Rebase · Fast-forward only | Git configuration |
| Update from base | Merge · Rebase · Fast-forward only | Merge |

Git configuration is consulted on the owning checkout only when selected. An
unconfigured Pull uses fast-forward only. There is no corresponding Git policy
for updating from a base. No repository overrides, development-state migrations,
one-off strategy dialogs, or additional confirmation steps.

## Execution boundary

- Pull and Update use the saved strategy through the existing backend action.
  Their renderer component and action contracts remain unchanged.
- Preserve target selection, linked-worktree eligibility, dirty-worktree handling,
  progress feedback, and conflict handoff to the agent.
- Rebase conflicts use the same handoff. Instructions tell the agent to inspect
  Git state and continue the native rebase rather than create a merge commit.
  Native Git state survives restart and can be continued or aborted.
- Fast-forward only refuses divergence without fallback. Operations never add
  a push, cleanup, autostash, or an update to unrelated branches.
- No new mutation lock, agent-wide guidance, integration strategies, recovery
  API/banner, remote fetch-all, or branch/head confirmation protocol.

## Implementation and commit checkpoint

One coherent local correction containing production changes and their tests:

1. Restore unrelated changes from the common main baseline.
2. Retain global settings, persistence, normalization, and the Settings UI.
3. Apply strategies only inside Pull and Update from base.
4. Retain the existing conflict workflow with rebase-aware instructions.
5. Validate original merge/action behavior and all configured histories.

## Validation

- Real temporary repositories: merge and rebase histories, fast-forward success
  and refusal, configured Pull, native conflict continuation/abort, dirty changes,
  no unintended pushes/deletions/stashes, and no unrelated-remote dependency.
- App boundary: changing and persisting settings changes the next Update action.
- Mounted UI: settings autosave, errors, choices, original immediate actions,
  and original Merge/Squash interactions.
- Compare complete GitWorkflowControl and merge execution against main.
- Focused tests, full test:ai, lint/typechecks, targeted runtime check, and DoD.
  No release packaging or signing.

## Progress

Unrelated workflow additions restored to the common main baseline. Focused
backend tests (82) and settings/action component tests (54) pass. Full test:ai
passes: 3,796 workspace tests and 47 script tests. All-workspace lint/typechecks,
architecture checks, dead-code checks, and build:web pass.

The complete GitWorkflowControl component, Git operation contracts, and backend
merge implementations match main byte-for-byte. Headless Chromium verified
settings autosave and reload persistence through the owning daemon, including
Update's Fast-forward only choice. It also verified original immediate actions
and Merge/Squash UI using intercepted Git operations. Provider catalog states
were synthetic; no live Git mutations were made by the UI check. Real repository
mutations were exercised by the backend tests. No live SSH or packaged desktop
validation, release packaging, or automatic review.

## Learnings

- A strategy preference changes Git execution, not its surrounding workflow.
  Preserve the action and presentation before adding abstractions.
- Follow existing settings autosave behavior and global scope.
- Use real Git histories to distinguish merge, rebase, and fast-forward behavior.
- Reuse the existing conflict handoff; inspect native Git state when deciding
  how to finish or abort an interrupted update.
