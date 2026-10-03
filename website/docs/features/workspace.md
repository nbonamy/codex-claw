---
description: Inspect documents, plans, files, and Git changes beside the conversation.
---

# Workspace & diffs

The workspace beside the conversation keeps the artifacts you need for decisions within reach.

Use its **+** menu to open **Files**, **Changes**, **Review**, **Visualize**, or **Browser** where supported. Tabs can be closed with their close button; right-click a tab for its tab actions.

## Documents and plans

Ask the agent to display Markdown in the side panel when a guide, report, or proposal should remain visible:

```text
Show the migration proposal in the side panel so we can discuss each step.
```

Plans and displayed documents have their own tabs. Keep the artifact open while discussing revisions so feedback refers to a concrete result.

## Files and diffs

Open **Files** to browse the agent's folder, expand directories, or search by path. Select a file to preview it. On macOS, **⌘P** opens the quick file picker; type part of the path and select the result.

When available, **Open In** opens the selected project file in a detected editor or application. The file preview is for inspection; ask the agent to change a file or open it in your editor when you want to edit it yourself.

Open **Changes** or press **⌘G** to inspect Git diffs. The agent header's diff selector lets you choose the scope:

| Scope | What it shows |
| --- | --- |
| Uncommitted | The current repository changes; this is the initial selection. |
| Staged / Unstaged | The corresponding Git changes. |
| Last turn | The recorded diff for the latest turn, when available. |
| Branch | Changes against the available base reference. |
| Commits | A selected commit from the available catalog. |

The **Changes** pane's refresh action reloads the selected diff. Its **…** menu controls staged, unstaged, and untracked sections when available, word wrap, and expanding or collapsing files. Select a file in the diff to open its preview.

Use the full repository diff before delivery so earlier or unrelated edits are accounted for.

## Commit and deliver

The agent header's Git action menu offers actions supported by the current branch and repository, including **Commit**, **Push**, **Merge**, and **Create PR**.

In **Commit**, review the message and change scope before choosing **Commit** or **Commit and push**. Staged changes are included. **Include unstaged changes** is on by default; **Include untracked files** is off by default. Turn off unstaged inclusion if you have deliberately staged only part of the work.

**Push** sends existing commits to the displayed destination. Uncommitted changes remain local. A remote and branch must be available; the push action becomes available when there are commits ahead to send.

Linked worktrees can also offer an update from their base branch. See [Worktrees](../workflows/worktrees) for merge and cleanup, and [Code Review](../workflows/code-review) for the separate structured review workflow. **Changes** is the diff viewer; **Review** runs the review workflow.

## Agent workspace state

Workspace tabs stay associated with their agent. Switching agents changes the context without combining their documents or browser work.

In a split conversation layout, the artifact sidebar follows the focused agent.

## Review before delivery

Check the files changed, the intended scope, and the validation evidence. Ask for a [Code Review](../workflows/code-review) when you want another pass.
