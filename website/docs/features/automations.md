---
description: Connect work integrations and automate the intake of matching work.
---

# Automations

Automations periodically check configured GitHub or Linear sources, select open work items, and start a dedicated agent in a worktree for each selected item. They are useful for recurring issue triage and implementation work.

## Connect the work source

Before creating an automation:

1. Connect [GitHub or Linear](../providers/#connect-github-or-linear) in **Settings → Integrations**.
2. Add the code repositories to Korus so each has a configured local clone. GitHub sources must match those clones. For Linear, choose a code repository separately for each team or project you want to watch.
3. Create the destination team and connect the provider you want its agents to use. See [Providers](../providers/).

For a remote automation, these prerequisites apply on the selected remote host. A clone or integration connection on your Mac does not supply the remote host's setup.

## Define the work to watch

1. Open **Automations** from the left rail.
2. Choose **Local** or a connected remote host in the location selector.
3. Choose **New automation** or the creation action on the empty screen.
4. Choose the backlog provider, then the GitHub repositories or Linear teams/projects to watch. **Refresh** reloads the source list; **Retry** retries a failed load.
5. For each Linear source, select **Code repository for …**. Confirm any prefilled repository: this saved mapping is where its worktrees will be created. A scheduled run cannot pause to ask where the code belongs.
6. Select the destination **Team** and coding engine, independently of the backlog provider.
7. Choose the **Run** interval: every 5, 15, or 30 minutes; hourly; every 6 or 12 hours; or daily. The default is hourly.
8. Write the **Selection prompt** and **Assignment prompt**, then choose **Save automation**.

Changing the backlog provider clears the source selections and Linear repository mappings. Select and verify them again before saving.

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
diff ready for review. Do not commit, push, or change the source issue's status.
```

::: warning Selection defaults
New automations are enabled by default. Leaving **Selection prompt** empty selects every eligible open, unassigned item in the chosen sources, including pull requests for GitHub. Use a narrow selection prompt or switch the automation off before saving while you configure it.
:::

## Follow the resulting work

The play button runs an enabled automation immediately. Use **View logs** to inspect its executions, created agents, status, and errors. The conversation action on an execution opens its recorded agent conversation.

Each selected item gets an agent in the destination team and a repository worktree. Items already assigned in Korus are skipped, including a Linear issue encountered through both a team and a project source, so another scheduled check does not create a second assignment for them.

An execution with no matches updates the last execution time without creating agents or a log entry. When agents finish their assigned work, the execution can become **Completed**. That is Korus's local work status; it does not by itself confirm that a Linear or GitHub issue was closed, a pull request merged, or changes deployed.

## Review delivery

Inspect the created agents and their diffs as you would for manually assigned work. Put delivery constraints such as “leave changes uncommitted for review” in the assignment prompt when that is the workflow you want.

Use the automation's action menu to edit or delete it. Switching it off stops future intake; deleting it stops the rule from creating more agents. Removing an execution or clearing history removes the recorded history, rather than acting as a worktree cleanup workflow.

## When something does not run

| Symptom | What to check |
| --- | --- |
| No source choices | The selected integration is connected on this host and your account can access the source. GitHub repositories also need a configured clone. Try **Refresh** or **Retry**. |
| Save is unavailable | Select a source, a team, and an available coding engine. Map every Linear source to a configured code repository and resolve any source-loading error. |
| Play button is unavailable | The automation is switched on. |
| No new agents | Items are open, match the selection prompt, and have no existing Korus assignment. |
| Failed execution | Open its logs; check integration authorization, coding-engine connection, and the saved clone/worktree error shown. Repair an unavailable repository mapping before retrying. |

Schedules run on the host that owns the automation. That host must remain running and able to reach the backlog service and selected coding engine. A disconnected integration or invalid code-repository mapping prevents new work from starting.

Use [parallel agents](../workflows/parallel-agents) and [worktrees](../workflows/worktrees) when an automation creates work that may overlap other tasks.
