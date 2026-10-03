---
description: Connect work integrations and automate the intake of matching work.
---

# Automations

Automations periodically check configured GitHub repositories, select open work items, and start a dedicated agent in a worktree for each selected item. They are useful for recurring issue triage and implementation work.

## Connect the work source

Before creating an automation:

1. Connect GitHub in **Settings → Integrations**.
2. Add the repositories to Claw so each has a configured local clone. The repository picker matches accessible GitHub repositories to those clones; GitHub access alone is insufficient.
3. Create the destination team and connect the provider you want its agents to use. See [Providers](../providers/).

For a remote automation, these prerequisites apply on the selected remote host. A clone or GitHub connection on your Mac does not supply the remote host's setup.

## Define the work to watch

1. Open **Automations** from the left rail.
2. Choose **Local** or a connected remote host in the location selector.
3. Choose **New automation** or the creation action on the empty screen.
4. Select the repositories, destination **Team**, and provider in the editor.
5. Choose the **Run** interval: every 5, 15, or 30 minutes; hourly; every 6 or 12 hours; or daily. The default is hourly.
6. Write the **Selection prompt** and **Assignment prompt**, then choose **Save automation**.

The selection prompt decides *which items* qualify. The assignment prompt tells each created agent *what to do* with its item.

**Selection prompt example:**

```text
Select only open issues labeled docs with a clear requested change.
Do not select pull requests or issues that need a product decision.
```

**Assignment prompt example:**

```text
Read the relevant guide and implementation before editing documentation.
Make the requested change, check the documentation build, and leave the
diff ready for review. Do not commit, push, or close the GitHub issue.
```

::: warning Selection defaults
New automations are enabled by default. Leaving **Selection prompt** empty selects every eligible open, unassigned item in the chosen repositories, including pull requests. Use a narrow selection prompt or switch the automation off before saving while you configure it.
:::

## Follow the resulting work

The play button runs an enabled automation immediately. Use **View logs** to inspect its executions, created agents, status, and errors. The conversation action on an execution opens its recorded agent conversation.

Each selected item gets an agent in the destination team and a repository worktree. Items already assigned in Claw are skipped, so another scheduled check does not create a second assignment for them.

An execution with no matches updates the last execution time without creating agents or a log entry. When agents finish their assigned work, the execution can become **Completed**. That is Claw's local work status; it does not by itself confirm that a GitHub issue was closed, a pull request merged, or changes deployed.

## Review delivery

Inspect the created agents and their diffs as you would for manually assigned work. Put delivery constraints such as “leave changes uncommitted for review” in the assignment prompt when that is the workflow you want.

Use the automation's action menu to edit or delete it. Switching it off stops future intake; deleting it stops the rule from creating more agents. Removing an execution or clearing history removes the recorded history, rather than acting as a worktree cleanup workflow.

## When something does not run

| Symptom | What to check |
| --- | --- |
| No repository choices | GitHub is connected and the repository has a configured clone on this host. |
| Save is unavailable | Select at least one repository, a team, and an available provider. |
| Play button is unavailable | The automation is switched on. |
| No new agents | Items are open, match the selection prompt, and have no existing Claw assignment. |
| Failed execution | Open its logs; check GitHub authorization, provider connection, and the clone/worktree error shown. |

Schedules run on the host that owns the automation. That host must remain running and able to reach GitHub and the selected provider.

Use [parallel agents](../workflows/parallel-agents) and [worktrees](../workflows/worktrees) when an automation creates work that may overlap other tasks.
