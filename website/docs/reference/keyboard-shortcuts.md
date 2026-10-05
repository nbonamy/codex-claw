---
description: Common macOS shortcuts for navigating agents and their workspace.
---

# Keyboard shortcuts

These shortcuts apply to the Korus desktop shell on macOS. Conversation controls can also have provider-specific shortcuts.

## Navigation

| Shortcut | Action |
| --- | --- |
| ⌘K | Open the agent picker. |
| ⌘N | Create a team. |
| ⌘1–9 | Select the corresponding agent in the active team. |
| Control Tab | Cycle forward through agents. |
| Control Shift Tab | Cycle backward through agents. |
| ⌘\` | Cycle teams. |

Hold Command briefly to reveal the quick agent shortcut hints.

## Active agent

| Shortcut | Action |
| --- | --- |
| ⌘P | Open the file picker. |
| ⌘G | Open Git changes. |
| ⌘B | Open the in-app Browser. |
| ⌘E | Edit the active agent. |
| ⌘D | Duplicate the active agent. This does not create an isolated Git worktree. |
| ⌘R | Restart the active agent with a fresh conversation. |
| ⌘Shift K | Compact the active session when it is idle. |
| ⌘W | Close the active agent. |
| ⌘Shift W | Close the active team; remote teams offer the applicable delete or disconnect flow. |
| ⌘Shift M | Toggle muting spoken announcements. |

Some shortcuts require an active agent workspace and are suspended while a modal dialog is open. Browser access requires a host that supports the embedded browser.

## Drafts and app

| Shortcut | Action |
| --- | --- |
| ⌘Shift X | Save the active prompt draft. |
| ⌘Shift V | Open saved prompt drafts. |
| ⌘, | Open Settings. |
| ⌘Q | Quit through Korus's app lifecycle flow. |

## Composer commands

Type `/` in the composer to discover commands. These commands are available for both Codex and Claude Code:

| Command | Action |
| --- | --- |
| `/plan` | Enter Plan mode. |
| `/compact` | Compact conversation context. |
| `/review` | Open Korus's [Code Review](../workflows/code-review) workflow. |
| `/visualize` | Open [Visualize](../features/visualize). |
| `/delegate [task]` | Ask the current agent to hand off work to a new Korus teammate in a worktree. |
| `/worktree [task]` | Alias for `/delegate`. |

The composer's **+** menu includes **Review**, **Delegate**, and **Visualize**. See [Worktree delegation](../workflows/worktrees#delegate-implementation) for handoff and local-commit behavior.

Both Codex and Claude Code offer `/goal`. Claude goals have no token-budget support. Other composer controls and turn actions depend on the selected provider; see [Conversations](../features/conversations).
