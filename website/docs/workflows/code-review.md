---
description: Run an independent review, inspect findings, and verify remediation.
---

# Code review

Use standalone Code Review when you already have changes to assess in an agent's Git workspace. It supports structured findings, your selection of fixes, and repeated review rounds. A [Mission](./missions#review-and-remediate) has a separate Review stage for its approved feature workflow.

## Before you start

Open the agent working in the checkout you want reviewed. Connect the provider that will do the review, and finish or pause other writers in that folder so the selected change remains stable. An independent reviewer uses the same checkout as the implementation agent; it does not create a worktree.

There must be something to review: staged, unstaged, or untracked changes, or a branch with changes against its base. Inspect the current folder and branch if the expected diff is missing.

## Start a review

1. Enter `/review` in the agent's composer to open Code Review.
2. Choose **Uncommitted changes** for the working diff, or **Current branch** for changes against the base shown in the panel, including uncommitted changes. Unavailable scopes are disabled. A clean checkout with no branch changes shows **Nothing to review**.
3. Choose **Independent reviewer** for a separate Review agent and fresh conversation, or **Current thread** to use the current agent's existing conversation. Current thread requires an existing provider session.
4. When using an independent reviewer, choose its connected provider. It can differ from the implementation agent's provider. Current thread uses the existing agent's provider.
5. Choose a **Review model** and, when the model supports it, **Review effort**. Default keeps the existing reviewer defaults. Korus remembers the last-used provider, model and effort, including separate selections for each provider.
6. Click **Start review** and wait for the round to finish. Follow the separate Review agent when using independent mode.

Choose the scope deliberately. If the feature is committed on a branch, reviewing only uncommitted changes will miss those commits. Check the displayed base for a branch review before starting.

## Automatic remediation

Enable **Automatic remediation** to run the review/fix/verify loop without
selecting findings or starting each round yourself. Choose the highest priority
to fix (P0–P2 by default) and the maximum number of review rounds (3 by default,
including the final verification review). **Configure** also offers **Commit
after each fix round**, off by default. Korus remembers these choices too.

Automatic mode uses an independent reviewer and a fresh conversation for each
review round. After remediation, the reviewer must record validation evidence
for every fix. With commits disabled, Korus leaves the fixes uncommitted for you
to inspect and commit. With commits enabled, Korus creates a local commit after
each validated fix round, including existing uncommitted changes in the reviewed
workspace—not just the fixes. The reviewer is instructed not to stage or commit
in either mode; Korus owns the optional commit step. Both modes review again
against the original fixed Git baseline. Neither pushes nor merges.
Start from the repository root; the reviewed scope includes its existing
staged, unstaged, and untracked files. Other active agents do not block automatic
review. Avoid editing the same files concurrently: Git safety checks can still
pause the review when the branch, HEAD, or expected working changes no longer match.

A clean review at the selected priority threshold closes the temporary reviewer
and sends the original agent a report with fixes, verification evidence, local
commits, and any remaining lower-priority findings. A clean review is not proof
that the code has no defects or approval to ship.

Failed validation or commits, repeated findings, detected concurrent workspace
changes, and the round limit pause automation and send a partial report instead.
**Stop automatic review** also pauses the loop and interrupts the reviewer; it
does not undo files or commits. After a backend restart, interrupted automatic
reviews stay paused for inspection rather than replaying commits or fixes.
You can continue manually after inspecting the checkout.

### Start from chat

You can explicitly ask your agent to **run an automatic review of my uncommitted
changes**, or of the current branch against a specified base. The agent starts
an independent reviewer with the calling thread's provider, model, and effort
unless you request overrides. It reuses your saved priority and round limits,
but local commits stay off unless you explicitly request them—even if the panel
previously had commits enabled.

The launch response confirms that review started, not that it passed. The report
returns to the originating conversation automatically. Avoid editing the reviewed
files while it runs. Agents are instructed not to start this workflow for a
generic request to review, finish, or ship work; it requires an explicit request
for automatic review because it can modify files.

## Inspect the findings

Findings are ordered by priority, from P0 through P3. Read the reported impact and open the affected file where a location is available. Ask for clarification through the finding's discussion action before deciding whether to fix it.

All findings are initially included for remediation. Deselect any you do not want changed. These selections are your approval boundary: starting a review gathers findings; choosing remediation authorizes the selected fixes.

A review is evidence about the selected scope. It does not replace the tests, typechecks, or runtime checks needed for the feature. A round with no findings does not prove there are no defects.

## Remediate

Click **Remediate selected findings** to queue fixes for the included findings. The reviewer applies the changes in the reviewed checkout. Follow the pending, fixing, and fixed states, then inspect the resulting diff and recorded verification evidence.

If no findings are selected, choose **Complete review round**. Unselected findings are recorded as skipped. Remediation changes the files; it is separate from a later commit, merge, push, or deployment.

## Review again

Once the round and any selected fixes are complete, choose **Review again** for another pass over the same scope, or **Finish review** when you accept the result. The round tabs let you compare earlier findings and decisions while the session is active.

An independent reviewer starts a fresh review conversation for the next round. Finishing removes the temporary Review agent and sends a handoff to the original agent describing the remediated findings. Finishing a current-thread review clears its active review panel while leaving the agent's conversation available.

Before closing, Korus saves a report in `~/.korus/reviews/` on the host running
the review (or the configured app home). The independent review handoff includes
its path. Reports retain inspection summaries, findings, decisions, verification
evidence, local commits, and each round's provider session ID. Full conversations
remain in provider-owned storage; completing a review does not delete them.
If the report cannot be saved, the reviewer stays open and automatic mode pauses.

The reviewer must explicitly confirm how many findings it registered, including
zero for a clean round. A mismatched count prompts it to correct its findings
before finishing. If it ends without valid confirmation, the round fails and
automatic mode pauses; an empty findings list alone never means a clean review.

Review state is saved while the session is active. If a round fails, read its error, resolve the provider or workspace problem, and use **Retry review** when offered. An existing active review must finish or stop before another starts for the same target. After interrupted work resumes, check the findings and actual files before authorizing more changes.

See [Workspace & diffs](../features/workspace) for inspecting the changes beside the conversation.
