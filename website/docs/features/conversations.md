---
description: Follow agent work, respond to approvals, and steer or queue instructions.
---

# Conversations

The conversation is where you describe the task, follow the agent's work, and give feedback.

## Send a prompt

Select the agent that owns the task, check its repository folder, and describe the desired outcome in the composer. Include success criteria and constraints:

```text
Add a filter to the issue list. Keep the current sorting, support an
empty result, and check the rendered interaction. Leave the change
uncommitted so I can review it.
```

Use the composer's file mentions, skills, and attachment controls to supply relevant context. Both Codex and Claude Code conversations support attachments. Each agent keeps its own conversation and draft as you switch agents.

Choose a model in the composer before sending when you need a particular provider model. Reasoning effort and service tier controls are Codex-specific; the choices shown depend on the provider's available catalog.

In the upcoming release after 0.25.2, the composer's **+** menu includes **Review**, **Delegate**, and **Visualize** for both engines. These open [Code Review](../workflows/code-review), request [worktree delegation](../workflows/worktrees#delegate-implementation), and open [Visualize](./visualize), respectively. The corresponding slash commands remain available.

## Discuss before implementation

Use `/plan` to enter Plan mode, then explain what you want to decide before editing. Korus uses Codex's native Plan mode; for Claude Code, it supplies planning instructions to the conversation.

```text
First discuss the tradeoffs between extending this module and adding
a new one. Do not edit files until we agree on the approach.
```

Review the proposed plan and answer any questions before asking the agent to implement it.

## Follow the evidence

Korus renders messages, tool calls, command output, plans, approvals, and file changes. Use those details to check what the agent inspected and what it actually validated.

Open a document or diff in the workspace when you need to examine it while continuing the discussion.

## Steer, queue, or interrupt

| Action | Use it when |
| --- | --- |
| **Steer** | Correct or add a constraint to a running turn. Claude Code support is new in the upcoming release after 0.25.2. |
| **Queue** | Save a follow-up for after the current turn. Inspect the pending prompt list if you need to edit or remove a queued instruction. |
| **Interrupt** | Stop the current turn before assigning a different direction. Both providers support interruption. |

For example, steer “Keep the current API; change only the implementation” into an active Codex task. Queue “Now update the guide for the final behavior” when documentation should follow the implementation.

Available actions depend on the conversation's provider and state. Check the control shown in the composer before sending a correction.

Claude steering delivers input at a tool boundary or in a following turn; it does not immediately cancel a running tool. Use **Interrupt** when you need the active work to stop, then inspect any files or other side effects already produced.

## Respond to requests

Answer inline questions and inspect approval requests in the conversation. An agent awaiting input needs a response before it can proceed. Where an approval offers different scopes, choose the one appropriate to the action; the controls depend on your provider and permission settings.

Select text in a message to attach targeted feedback instead of retyping the passage. Image attachments also support annotations. Submit the resulting annotations with your next message, or on their own when the annotation contains the complete request.

Include a short explanation when changing a constraint so the agent can carry it into the rest of the task.

## Revisit a turn or manage context

Codex turn actions can edit, retry, delete, or fork from a turn. Use the action shown on the relevant message. These actions change the conversation's context; they do not roll back edits already made to the repository. Claude Code does not expose edit, retry, or delete turn actions.

In the upcoming release after 0.25.2, Claude Code supports native conversation forks while idle, including from a completed turn when that boundary is available. The fork has independent conversation history but uses the same folder. It does not create a worktree or restore earlier file contents. If a turn cannot be used as a fork point, reload the conversation and choose an available completed boundary.

Use `/compact` or **Agent → Compact Session** when the conversation is long and you want a context summary. The agent must be idle for the shell's compact action. Codex also supports **Replace conversation with summary** from the agent context menu.

Right-click an agent for session actions:

- **Resume Session** opens the provider's saved conversation picker.
- **Restart Agent** starts a fresh conversation for the same agent and folder. It is not the way to reload the current history.
- **Fork**, when available, creates another conversation from existing context.

For provider setup and capability differences, see [Codex](../providers/codex) and [Claude Code](../providers/claude-code).

## Hand work to another engine

Use **Hand off…** to continue a workspace task with a new agent, including switching between Codex and Claude Code. You can also choose the same engine with a different model.

1. Wait until the agent is idle, then right-click it in the sidebar or Cockpit and choose **Hand off…**. The native **Agent** menu offers the same action.
2. Choose the destination **Coding agent** and **Model**, or keep **Provider default**.
3. Optionally add **Additional handoff instructions** describing what the current agent should emphasize in its note.
4. Choose **Hand off**. The current agent writes the note, and Korus replaces it with a new agent that starts work from that note.

The replacement keeps the same folder, branch, and uncommitted changes and uses the destination engine's default permissions. The source conversation remains available through **Source conversation** in the handoff dialog, alongside the **Saved handoff note**. This transfers a written summary rather than converting one provider's conversation history into another's.

Finish queued prompts, pending requests, active goals, reviews, and running delegated work before handing off. Quick Chats and Mission workers cannot use this action. **Hide** closes the progress dialog while the handoff continues. If it fails or is interrupted, inspect the saved note and available conversations before trying again.

For parallel work that keeps the original agent open and creates an isolated checkout, use [worktree delegation](../workflows/worktrees#delegate-implementation).

## Set a goal

Use `/goal` to define an outcome the agent should keep working toward. Keep the condition concrete and inspect the resulting evidence before accepting it as done.

Claude goal support is new in the upcoming release after 0.25.2. It uses Claude Code's native goal behavior and requires native goal hooks to be enabled. Claude goals do not support a token budget or live iteration counters. An interrupted goal can appear paused; a failed run or unverifiable goal state can appear blocked. Clearing a goal removes it rather than claiming it succeeded.

## Resume work

Korus restores durable workspace state when you return. Older messages load through conversation history; use the retry action if history loading reports a failure.

Its background daemon can keep agent work running after the desktop window closes. The host still needs to be running and connected; stopping the daemon or sleeping the host interrupts that availability. Check the conversation and current status before submitting another instruction.
