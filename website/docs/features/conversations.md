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

## Discuss before implementation

Use `/plan` to enter Plan mode, then explain what you want to decide before editing. Claw uses Codex's native Plan mode; for Claude Code, it supplies planning instructions to the conversation.

```text
First discuss the tradeoffs between extending this module and adding
a new one. Do not edit files until we agree on the approach.
```

Review the proposed plan and answer any questions before asking the agent to implement it.

## Follow the evidence

Claw renders messages, tool calls, command output, plans, approvals, and file changes. Use those details to check what the agent inspected and what it actually validated.

Open a document or diff in the workspace when you need to examine it while continuing the discussion.

## Steer, queue, or interrupt

| Action | Use it when |
| --- | --- |
| **Steer** | Correct or add a constraint to the running Codex turn. Claude Code does not support live steering. |
| **Queue** | Save a follow-up for after the current turn. Inspect the pending prompt list if you need to edit or remove a queued instruction. |
| **Interrupt** | Stop the current turn before assigning a different direction. Both providers support interruption. |

For example, steer “Keep the current API; change only the implementation” into an active Codex task. Queue “Now update the guide for the final behavior” when documentation should follow the implementation.

Available actions depend on the conversation's provider and state. Check the control shown in the composer before sending a correction.

## Respond to requests

Answer inline questions and inspect approval requests in the conversation. An agent awaiting input needs a response before it can proceed. Where an approval offers different scopes, choose the one appropriate to the action; the controls depend on your provider and permission settings.

Select text in a message to attach targeted feedback instead of retyping the passage. Image attachments also support annotations. Submit the resulting annotations with your next message, or on their own when the annotation contains the complete request.

Include a short explanation when changing a constraint so the agent can carry it into the rest of the task.

## Revisit a turn or manage context

Codex turn actions can edit, retry, delete, or fork from a turn. Use the action shown on the relevant message. These actions change the conversation's context; they do not roll back edits already made to the repository. Claude Code does not currently expose these turn actions.

Use `/compact` or **Agent → Compact Session** when the conversation is long and you want a context summary. The agent must be idle for the shell's compact action. Codex also supports **Replace conversation with summary** from the agent context menu.

Right-click an agent for session actions:

- **Resume Session** opens the provider's saved conversation picker.
- **Restart Agent** starts a fresh conversation for the same agent and folder. It is not the way to reload the current history.
- **Fork**, when available for Codex, creates another conversation from existing context.

For provider setup and capability differences, see [Codex](../providers/codex) and [Claude Code](../providers/claude-code).

## Resume work

Claw restores durable workspace state when you return. Older messages load through conversation history; use the retry action if history loading reports a failure.

Its background daemon can keep agent work running after the desktop window closes. The host still needs to be running and connected; stopping the daemon or sleeping the host interrupts that availability. Check the conversation and current status before submitting another instruction.
