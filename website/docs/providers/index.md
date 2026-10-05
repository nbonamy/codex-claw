---
description: Connect Codex and Claude Code for agent work, and GitHub or Linear for backlog work.
---

# Provider guides

Korus can run **Codex**, **Claude Code**, or both. Each engine has its own installation, account, conversation location, and customization. Connecting Codex does not connect Claude Code.

| Engine | Installation and sign-in |
| --- | --- |
| [Codex](./codex) | Bundled with the desktop app; browser sign-in from Korus |
| [Claude Code](./claude-code) | Requires the Claude Code CLI; sign-in through a command copied from Korus |

## Choose where each engine keeps its setup

On the first connection screen, select **Customize** beneath the engine before signing in. Later, open **Settings → Codex** or **Settings → Claude Code** and select **Customize** beside **Location**.

There are two choices under **Conversations**:

| Choice | Conversations and sign-in | Skills and configuration |
| --- | --- | --- |
| **Separate Korus chats** | Korus uses its own provider home. Sign in for that setup, even if the engine already works in your terminal. | **Reuse my existing skills** is selected by default. Other provider configuration remains separate. |
| **Use existing setup** | Korus uses the provider home you already use outside Korus, including its sign-in and conversation storage. | Skills and configuration belong to that existing setup; changes can affect sessions outside Korus too. |

For a new setup, the default is **Separate Korus chats** with **Reuse my existing skills** enabled. You can choose differently for each engine: for example, keep Codex separate while using your existing Claude Code setup. On an upgrade, check **Location** to see the setup retained for your engine.

A provider home is the folder where that engine keeps its account state, conversations, and user configuration. With the standard Korus installation, separate homes are:

- Codex: `~/.korus/codex-home`
- Claude Code: `~/.korus/claude-home`

Existing setups normally use `~/.codex` and `~/.claude`. Custom launch environments can use different paths, so the path displayed under **Location** is the one to check when troubleshooting.

::: tip Separate chats can still share skills
**Reuse my existing skills** links to your existing provider skills rather than taking a one-time copy. Updates are shared in both directions. For Codex, this choice also shares the provider's plugins; for Claude Code, it shares skills only. It does not copy your sign-in or move your old conversations.
:::

Uncheck **Reuse my existing skills** if you want to manage those resources separately too. Repository instructions and project configuration still apply to the working folder you open.

## Connect and verify

1. Choose the conversation setup for the engine, then **Save**. If the CLI is missing, the dialog offers **Install** instead.
2. Follow the [Codex](./codex#connect-codex) or [Claude Code](./claude-code#connect-claude-code) sign-in steps. **Detected** means the executable is available; **Connected** means Korus recognizes the selected setup's authentication.
3. Connect at least one engine, then select **Continue** on the first connection screen.
4. In the engine's Settings page, check that **Account** shows **Connected** and **Enable engine** is on.
5. Start a small conversation and check that the engine can respond before assigning a larger task.

## Accounts and usage

Authentication, model availability, and usage limits belong to the selected provider. Connecting an account to Korus does not create a new model subscription or transfer one provider's access to another. Claude subscription sign-in and Anthropic Console API billing are separate choices in its connection dialog.

## Connect GitHub or Linear

Coding engines and backlog integrations are separate choices. Codex or Claude Code runs the agent; GitHub or Linear supplies the work items.

Open **Settings → Integrations** and connect the service you want to use:

| Integration | Connect | Backlog source |
| --- | --- | --- |
| GitHub | Select **Connect**, copy the displayed device code, open GitHub, and authorize Korus. Return when authorization finishes. | A GitHub repository, with issues and pull requests. |
| Linear | Select **Connect**, complete sign-in and authorization in the browser, and return to Korus. Check for **Connected** and the expected account. | A Linear team or project, with issues. |

Linear does not require pasting an API key or registering your own OAuth application in Settings. **Cancel** stops an in-progress authorization; use **Connect** to retry. If the build reports that Linear sign-in is not configured, use a build with Linear configuration rather than entering credentials in chat. **Disconnect** removes Korus's connection to that service without disconnecting the other integration or your coding engines.

In backlog pickers, choose the provider first, then its **Repository** or **Team / project**. Browsing only offers connected providers; with one connected provider, the provider selector is hidden. Automation setup also lets you select a disconnected provider and directs you to connect it before saving.

A Linear team or project identifies **where the issue lives**, not **where code runs**. Work started from a repository uses that repository. Without a repository context, choose a **Code repository** before starting. For unattended work, [automations](../features/automations) require a saved repository for every Linear source.

Git branches, commits, pushes, and pull requests still belong to the code repository. Linear supplies backlog work; it does not replace GitHub's pull-request workflow. See [Browse and start backlog work](../features/workspace#browse-and-start-backlog-work) and [Missions](../workflows/missions) for the entry points.

## Choosing an engine

When multiple engines are available, choose an engine when starting new work. With only one available engine, Korus can use it without showing a picker. Models, reasoning controls, and permission choices depend on that engine.

An existing conversation stays with its provider. Connecting another engine does not convert it. To continue work with another engine, use [Hand off…](../features/conversations#hand-work-to-another-engine), which creates a replacement agent in the same workspace using a written handoff.

**Enable engine** controls whether Korus uses an engine without signing out. **Disconnect** signs out of the account in the selected provider home; saved conversations remain. With **Use existing setup**, that sign-out also affects the shared terminal setup. Korus prevents turning off the last active engine with the enable toggle; connect or enable another one first.

## Change the conversation location later

Choose the location before creating agents when possible. Switching between **Separate Korus chats** and **Use existing setup** after starting work has consequences:

1. Wait until the affected engine's local agents are idle. Finish or discard affected code reviews and finish affected Mission runs.
2. Open the engine's Settings page, choose **Customize**, select the new location, and select **Save**.
3. Review **Change conversation setup?** Korus reports how many local agents, including Quick Chats, will be removed.
4. Acknowledge the removal, then choose **Remove agents and switch** only if you intend to proceed.
5. Connect the new setup if needed and create new agents there.

Conversation files remain in the previous provider home. This action does not migrate them, and switching back does **not** restore the removed agents in Korus. Your repository folders and worktrees are not deleted by the location switch. Remote-team agents use their remote host's setup and are outside this local reset.

## If the connection behaves differently from your terminal

Compare the path under **Location** first. A working terminal sign-in, skill, or MCP server may belong to an existing home while Korus is using a separate one. Resolve installation and authentication errors in the engine's Settings page, then verify with a small conversation.

For additional help, record the engine, app version, displayed location, and exact error. Continue with [Troubleshooting](../troubleshooting/).
