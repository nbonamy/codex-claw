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
5. Click **Start review** and wait for the round to finish. Follow the separate Review agent when using independent mode.

Choose the scope deliberately. If the feature is committed on a branch, reviewing only uncommitted changes will miss those commits. Check the displayed base for a branch review before starting.

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

Review state is saved while the session is active. If a round fails, read its error, resolve the provider or workspace problem, and use **Retry review** when offered. An existing active review must finish or stop before another starts for the same target. After interrupted work resumes, check the findings and actual files before authorizing more changes.

See [Workspace & diffs](../features/workspace) for inspecting the changes beside the conversation.
