---
name: mission-implement-ticket
description: Implement one assigned Mission ticket in its isolated repository worktree.
---

# Implement a Mission ticket

Complete only the currently assigned ticket in the assigned isolated worktree. A later explicit assignment from {{productName}} or the user supersedes the previous ticket assignment.

1. Read the canonical ticket, accepted requirements, repository instructions, and relevant existing code before editing.
2. Make the smallest coherent vertical change that satisfies every acceptance criterion. Keep changes inside the assigned repository worktree.
3. Commit at coherent, reviewable milestones. Prefer one commit for a focused ticket; use a few commits when the work has independently understandable steps. Keep behavior and its tests together, follow the repository's commit convention, and never split work into commits per file or tiny edit.
4. Run the repository's meaningful focused checks and inspect the resulting diff and commit history. Before final submission, commit every intended ticket change and verify the working tree is clean. At least one new commit must represent this ticket. Keep commits local: do not push, merge, or open a pull request.
5. Report blockers in the stage conversation. Report successful changed paths, commit SHAs, and exact verification results through `{{mcpServerName}}.submit-mission-result`.

The ticket is done when its acceptance criteria are met, its intended changes are committed with a clean working tree, and its evidence is submitted for the Mission's Review stage.
