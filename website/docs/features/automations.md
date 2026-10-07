---
description: Schedule prompts in agents or Quick Chats.
---

# Automations

An automation sends a prompt on a recurring schedule. It can run in an existing agent, an existing Quick Chat, or a new Quick Chat each time. No repository or work integration is required.

## Create an automation

1. Open **Automations** from the left rail.
2. Choose **Local** or a connected remote host.
3. Choose **New automation**.
4. Give it a name and write the prompt.
5. Choose where it runs:
   - **New Quick Chat every run** starts with fresh context each time. Choose its team, coding engine, model, and effort. Empty model and effort fields use provider defaults.
   - **Existing Quick Chat** continues the selected chat.
   - **Existing agent** continues the selected agent in its folder or worktree.
6. Choose **Daily**, **Weekdays**, **Weekly**, **Custom**, or **Interval**, then set the time where applicable. New schedules use your local timezone; existing schedules retain their saved timezone. Check **Next run** and save.

Existing conversations keep their backend, model, effort, and approval settings. Fresh Quick Chats use the selected settings without changing your saved defaults.

You can also ask an agent or Quick Chat to create an automation, for example “Run the refresh-work-calendar skill every day at 8 AM America/Chicago in this agent.” Specify the prompt, schedule, timezone, and destination. It appears in the same Automations view for editing or disabling.

Automations are enabled by default. Their first scheduled run is the next occurrence, not immediately on saving. Calendar schedules keep their local time across daylight-saving changes; nonexistent times are skipped and repeated times run once. The host owning the automation must stay running. When it returns after missing occurrences, Korus runs once rather than replaying a backlog.

Custom schedules support every-N days, selected weekdays, and days of the month. More advanced recurrence rules created through the tool are preserved in the editor rather than silently simplified.

## Keep the prompt explicit

An automation has the same tools and permission boundaries as its conversation. Scheduling does not grant extra permissions or automatically create worktrees, commit changes, or publish work.

For example:

```text
Check the open issues in my configured repository. Summarize anything
that needs attention. Do not edit files or change issue status.
```

A Quick Chat can use Korus's existing tools to create a repository agent in a dedicated worktree when your prompt explicitly asks for that. Specify the repository and delivery constraints in the prompt; they are not separate automation configuration.

## Follow a run

Use the play button to run an enabled automation immediately. **View logs** shows the conversation, start time, duration, status, and any error. Its conversation action opens the recorded conversation.

A busy target is not interrupted. Korus does not overlap runs of the same automation or dispatch two automations into the same busy conversation. A run awaiting approval remains **Needs input**; open the target conversation to respond.

**Completed** means the prompt's provider turn ended successfully. It does not mean delegated agents finished, issues were closed, or changes were shipped. A daemon restart marks interrupted runs as failed rather than claiming success.

## Edit or remove

Switching an automation off stops future runs, not an already-running conversation. Deleting it removes the schedule but leaves conversations and worktrees intact. Clearing history removes finished entries and preserves active runs.

## When a run fails

Check the error in its execution log. Reconnect the coding engine if needed, or edit the automation when its target conversation or team no longer exists. A remote automation uses the remote host's conversations, provider connections, and permissions—not those on your local computer.
