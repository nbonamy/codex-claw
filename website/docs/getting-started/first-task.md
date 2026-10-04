---
description: Take a repository task from a clear request to validation and review.
---

# Your first task

Pick a small outcome so you can learn the workspace while reviewing a manageable diff.

## Check your starting point

1. Connect and enable an engine using its [provider setup guide](../providers/).
2. Open **Existing folder or repository…** and select the checkout you want to work in.
3. Confirm the working folder and branch. Check whether there are already uncommitted changes that must be preserved.
4. Use a dedicated [worktree](../workflows/worktrees) if another agent will write to the same repository or if you want the task isolated.

For an unfamiliar repository, start with a read-only inspection:

```text
Read the repository instructions and identify the test and development commands.
Tell me which branch and working folder you are using, and whether there are
existing changes to preserve. Do not edit anything yet.
```

This checks the engine, folder, and repository context before implementation begins.

## Describe the outcome

Tell the agent what should change, where it should look, and how you will judge success. Include constraints that matter: supported platforms, existing patterns, or behavior that must be preserved.

```text
The repository picker needs a useful empty state.
Inspect the existing UI patterns first, then implement it.
Keep the current selection behavior and run the relevant tests.
```

If you want to discuss before implementation, say so explicitly.

For a broader idea whose requirements and implementation breakdown are still open, use a [Mission](../workflows/missions) rather than squeezing every stage into one prompt.

## Follow the work

Read the agent's findings and respond to questions. Tool calls and command output show what the agent actually inspected or ran. A proposal describes intended work; a diff and validation results show completed work.

Keep useful plans and documents open in the [workspace](../features/workspace) beside the conversation.

## Give feedback

Correct the scope as soon as something looks wrong. Ask for a specific adjustment, such as preserving a control's placement or covering an error case.

Use the conversation's steer, queue, or interrupt controls as appropriate. See [Conversations](../features/conversations).

Keep feedback specific to the observable result. For example, “The empty state should appear only when the repository list is empty, not while it is loading” gives the agent a behavior to verify.

## Validate and review

Inspect all intended changes and confirm the checks match the task. For a UI change, ask for a local preview. For an integration, ask which boundary was exercised.

Ask for a handoff that names the files changed, the exact checks run and their results, and any remaining limitations. Passing a test suite proves the cases it exercises; a build proves compilation. Neither alone shows that the requested UI or device workflow was tried.

Use [Code Review](../workflows/code-review) for another pass over the changes.

## Deliver

Specify whether you want a local commit, a push, or a pull request. Ask the agent to keep unrelated changes out of the delivery. Review the reported Git state when it finishes.
