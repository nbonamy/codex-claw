---
description: Isolate implementation in a separate Git checkout and integrate it after review.
---

# Worktrees

A Git worktree gives an agent a separate checkout and branch while keeping it attached to the same repository.

## Before you start

Use a worktree for concurrent implementation, an experiment, or a change you want to keep separate from the current checkout. The folder must belong to a Git repository with a usable base branch. A plain project folder needs Git initialization before it can have worktrees.

A worktree has its own files, index, and checked-out branch. It shares the repository's Git history and remotes. Git does not copy uncommitted edits, installed dependencies, ignored environment files, or running services from your original checkout.

Korus's **Worktree initialization** setting controls extra setup. **Auto-detect** uses repository setup instructions when available; otherwise it can copy local environment files and detect dependency setup. **Repo instructions only** limits setup to the repository's instructions, while **Disabled** skips initialization. Reusing an existing worktree does not rerun initialization. Check what was prepared rather than assuming every required service is ready.

## Create one from the sidebar

1. Open a team with an agent in the repository.
2. Use the **+** beside that repository group and choose the new-worktree option.
3. In **New Worktree**, choose **Start from** and enter a branch such as `feat/export-csv`. Check the destination folder wherever the creation flow lets you change it. If Korus offers an existing worktree, verify its path and branch before reusing it.
4. Select the provider when more than one is available, create the worktree, and send the implementation task to the new session.

When creating an agent through the agent dialog, the equivalent choice is **Repository**, then **Work in… → New Worktree…**.

Korus displays provisioning progress. When it finishes, check the new agent's folder and branch before asking it to edit files.

## Delegate implementation

::: info Upcoming release
The `/delegate` and `/worktree` commands and composer **Delegate** action are implemented on main for the intended 0.26.0 release, not the published 0.25.2 app.
:::

Let the current conversation shape a task first, then submit `/delegate` to hand off the agreed work. `/worktree` is an alias. You can include a specific task:

```text
/delegate Implement the agreed CSV export flow and its tests. Keep commits local and report back for review.
```

Both Codex and Claude Code support these commands. The composer's **+** menu also offers **Delegate**. The current agent uses the conversation to prepare a self-contained handoff and creates a separate Korus teammate in a dedicated worktree. If the task or repository is unclear, it asks for clarification first. The original agent and conversation remain open.

You can also request delegation in plain language:

> Create a Korus teammate in a dedicated worktree on `feat/export-csv`. Implement the agreed export flow, add the relevant tests, and leave the changes ready for review.

When Korus offers **Start implementation in a worktree?** above the composer, the checkmark sends a delegation request to the current agent. That agent prepares a handoff and creates the separate teammate. The dismiss button removes the proposal. Accepting this proposal starts implementation; it does not approve a later merge or push.

Continue the implementation discussion with the new agent so its instructions, changes, and evidence stay together. This creates a Korus teammate, rather than a [native subagent](./parallel-agents#choose-the-kind-of-agent).

The command's handoff asks the teammate to commit at coherent milestones and keep those commits local. Delegation does not authorize a push or merge; specify any stricter delivery constraint in the task.

## Verify the workspace

Ask the agent to follow the repository's setup instructions: install dependencies, provide the required local configuration, and use separate service ports when another checkout is running. Keep credentials out of prompts and committed files. Verify a preview is actually using the worktree before judging its behavior.

If provisioning fails, read the reported phase and error. Check whether a branch or folder was already created before retrying; reuse the correct existing worktree rather than creating a second copy of the same task.

## Review and merge

1. Review the [diff](../features/workspace) and checks. Run [Code Review](./code-review) if the change needs an independent pass.
2. Commit the intended changes through the agent's Git controls. A merge includes committed changes; remaining uncommitted edits are not included.
3. Open the merge action and verify the destination branch. Choose **Merge commit** to preserve the branch's commits, or **Squash and merge** and enter a single commit message.
4. Decide whether to **Delete worktree after merging** and **Delete branch after removing worktree**. Keep them when you need follow-up work. Where offered, **Report back** sends the outcome to the delegating agent.
5. Choose **Merge** for local integration, or **Merge and push** to also update the remote. Alternatively, create a pull request instead of merging locally.

The destination checkout must be clean, and the feature branch must include the latest destination commits. If Korus requests a branch update, update from the base, resolve conflicts, and rerun the relevant checks before merging.

When merge cleanup removes the worktree, Korus closes the associated agent after the delivery completes. Retaining the worktree keeps it available for further work. A cleanup warning can mean the merge succeeded while a folder remains; inspect that warning before retrying the merge.

If a push fails after a successful local merge, use **Retry push**. The local merge already exists. Keep a worktree that contains unfinished work, and resolve Git errors before choosing deletion.
