---
description: Choose separate or shared provider setups, connect Codex and Claude Code, and manage each engine independently.
---

# Provider guides

Claw can run **Codex**, **Claude Code**, or both. Each engine has its own installation, account, conversation location, and customization. Connecting Codex does not connect Claude Code.

| Engine | Installation and sign-in |
| --- | --- |
| [Codex](./codex) | Bundled with the desktop app; browser sign-in from Claw |
| [Claude Code](./claude-code) | Requires the Claude Code CLI; sign-in through a command copied from Claw |

## Choose where each engine keeps its setup

On the first connection screen, select **Customize** beneath the engine before signing in. Later, open **Settings → Codex** or **Settings → Claude Code** and select **Customize** beside **Location**.

There are two choices under **Conversations**:

| Choice | Conversations and sign-in | Skills and configuration |
| --- | --- | --- |
| **Separate Claw chats** | Claw uses its own provider home. Sign in for that setup, even if the engine already works in your terminal. | **Reuse my existing skills** is selected by default. Other provider configuration remains separate. |
| **Use existing setup** | Claw uses the provider home you already use outside Claw, including its sign-in and conversation storage. | Skills and configuration belong to that existing setup; changes can affect sessions outside Claw too. |

For a new setup, the default is **Separate Claw chats** with **Reuse my existing skills** enabled. You can choose differently for each engine: for example, keep Codex separate while using your existing Claude Code setup. On an upgrade, check **Location** to see the setup retained for your engine.

A provider home is the folder where that engine keeps its account state, conversations, and user configuration. With the standard Claw installation, separate homes are:

- Codex: `~/.codex-claw/codex-home`
- Claude Code: `~/.codex-claw/claude-home`

Existing setups normally use `~/.codex` and `~/.claude`. Custom launch environments can use different paths, so the path displayed under **Location** is the one to check when troubleshooting.

::: tip Separate chats can still share skills
**Reuse my existing skills** links to your existing provider skills rather than taking a one-time copy. Updates are shared in both directions. For Codex, this choice also shares the provider's plugins; for Claude Code, it shares skills only. It does not copy your sign-in or move your old conversations.
:::

Uncheck **Reuse my existing skills** if you want to manage those resources separately too. Repository instructions and project configuration still apply to the working folder you open.

## Connect and verify

1. Choose the conversation setup for the engine, then **Save**. If the CLI is missing, the dialog offers **Install** instead.
2. Follow the [Codex](./codex#connect-codex) or [Claude Code](./claude-code#connect-claude-code) sign-in steps. **Detected** means the executable is available; **Connected** means Claw recognizes the selected setup's authentication.
3. Connect at least one engine, then select **Continue** on the first connection screen.
4. In the engine's Settings page, check that **Account** shows **Connected** and **Enable engine** is on.
5. Start a small conversation and check that the engine can respond before assigning a larger task.

## Accounts and usage

Authentication, model availability, and usage limits belong to the selected provider. Connecting an account to Claw does not create a new model subscription or transfer one provider's access to another. Claude subscription sign-in and Anthropic Console API billing are separate choices in its connection dialog.

## Choosing an engine

When multiple engines are available, choose an engine when starting new work. With only one available engine, Claw can use it without showing a picker. Models, reasoning controls, and permission choices depend on that engine.

An existing conversation stays with its provider. Connecting another engine does not convert it.

**Disconnect** and **Enable engine** control whether Claw uses an engine; disconnecting preserves its CLI sign-in and chats. Claw prevents turning off the last active engine. Connect or enable another one first.

## Change the conversation location later

Choose the location before creating agents when possible. Switching between **Separate Claw chats** and **Use existing setup** after starting work has consequences:

1. Wait until the affected engine's local agents are idle. Finish or discard affected code reviews and finish affected Mission runs.
2. Open the engine's Settings page, choose **Customize**, select the new location, and select **Save**.
3. Review **Change conversation setup?** Claw reports how many local agents, including Quick Chats, will be removed.
4. Acknowledge the removal, then choose **Remove agents and switch** only if you intend to proceed.
5. Connect the new setup if needed and create new agents there.

Conversation files remain in the previous provider home. This action does not migrate them, and switching back does **not** restore the removed agents in Claw. Your repository folders and worktrees are not deleted by the location switch. Remote-team agents use their remote host's setup and are outside this local reset.

## If the connection behaves differently from your terminal

Compare the path under **Location** first. A working terminal sign-in, skill, or MCP server may belong to an existing home while Claw is using a separate one. Resolve installation and authentication errors in the engine's Settings page, then verify with a small conversation.

For additional help, record the engine, app version, displayed location, and exact error. Continue with [Troubleshooting](../troubleshooting/).
