---
description: Install Claude Code, choose its conversation home, sign in to the correct setup, and verify a Claw agent.
---

# Claude Code

Claude Code runs alongside Codex as an independent engine. It requires a Claude Code CLI installation and its own authentication. A Codex connection or ChatGPT subscription does not connect Claude Code.

## Install and choose a setup

1. Select **Customize** beneath Claude Code on the first connection screen, or open **Settings → Claude Code → Location → Customize**.
2. Select **Separate Claw chats** or **Use existing setup**.
3. For separate chats, leave **Reuse my existing skills** checked if you want to share existing Claude Code skills; uncheck it to keep skills separate too.
4. If Claude Code is detected, select **Save**. If the CLI is missing, select **Install** and wait for setup to finish.

Claw's install action uses Claude Code's native installer. If installation fails, follow the [official Claude Code installation guide](https://code.claude.com/docs/en/setup#install-claude-code), restart Claw, and retry the connection. Installing the executable and signing in are separate steps.

### Separate Claw chats

With the standard installation, this uses `~/.codex-claw/claude-home`. Claude authentication, saved conversations, and user configuration follow that home. Your usual terminal setup remains separate, so signing in there does not automatically sign in to Claw's setup.

**Reuse my existing skills** shares your existing Claude `skills` directory with the separate home. Changes are shared rather than copied once. This option does not import credentials, conversations, plugins, or the rest of your Claude configuration.

### Use existing setup

This uses your existing Claude home, normally `~/.claude`, or a configured existing location in Claw's launch environment. Claw can recognize the authentication already present there. Skills and user configuration are shared with Claude Code sessions outside Claw.

Check the path under **Location** after saving. Choosing an existing home does not turn its old conversations into Claw agents or copy them into a separate home.

::: warning Changing location after creating agents
Changing these choices later requires confirming removal of local Claude Code agents and Quick Chats from Claw. Their conversation files remain in the previous home, and switching back does not restore the agents. Read [Change the conversation location later](./index#change-the-conversation-location-later) before switching.
:::

## Connect Claude Code

1. Select **Connect Claude Code** on the first connection screen, or **Connect** under **Account** in **Settings → Claude Code**.
2. The connection dialog offers two sign-in commands: **Claude subscription** and **Anthropic Console (API billing)**. Choose the account type you intend to use and copy that command.
3. Paste the complete command into Terminal and run it. Complete Claude Code's sign-in flow.
4. Return to the Claw dialog and select **Refresh status**.
5. Check that Claude Code shows **Connected**. On first setup, select **Continue**; in Settings, check that **Enable engine** is on.

The displayed command includes the configuration-directory environment needed for your selected setup. Keep that prefix when copying it: running an unscoped login command can authenticate your usual terminal setup instead of the home Claw is checking.

Claw uses `claude auth login --claudeai` for the subscription choice and `claude auth login --console` for Console API billing, with the appropriate home prefix supplied by the dialog. Run **one** of the offered commands, not both. Claude Code manages the credentials; you do not paste credentials into Claw.

If the existing setup is already authenticated, Claw may recognize it immediately and close the dialog. You can re-enable a connected engine without another login.

## Verify a conversation

Create an agent in the folder you want to work in and choose **Claude Code** if an engine picker appears. Start with a small request:

> Read this repository's instructions and summarize how to run its checks. Do not change any files.

Confirm that the engine responds and uses the intended working folder before assigning implementation work. Review any permission requests in the conversation. Available models, effort levels, and permission modes depend on Claude Code; Codex controls do not all apply to Claude sessions.

## Conversation controls

For steering, forks, and goals, see [Conversations](../features/conversations). These Claude capabilities are implemented on main for the intended 0.26.0 release and are not included in the published 0.25.2 app. Steering waits for a tool boundary or following turn; forks require an idle conversation and keep the same working folder; goals require native hooks and do not support token budgets. Edit, retry, and delete turn actions remain unavailable.

## Configure instructions, skills, and external tools

For personal instructions, open **Settings → Personalization**, choose **Claude Code**, and check the displayed instruction-file path. The file belongs to the selected Claude home. With **Use existing setup**, your edits also affect Claude Code outside Claw. Project instructions continue to apply in the working folder.

Configure Claude-specific external tools for the selected home or project using your Claude Code setup. When using a separate Claw home from Terminal, use the same configuration-directory prefix shown in the connection dialog so you are configuring the environment Claw actually uses.

The **Codex** section in **Settings → Plugins** manages Codex resources; it is not a Claude plugin manager. Selecting **Reuse my existing skills** for Claude does not share the Codex plugin catalog or copy MCP configuration from another provider.

Claw supplies the `codex_claw` collaboration tools to Claude agents itself. Despite the server name, you do not need Codex installed or a manual MCP entry to use those Claw tools with Claude Code. See [Agent collaboration](../reference/agent-collaboration).

## Connection problems

| Symptom | What to do |
| --- | --- |
| The CLI is not detected | Open **Customize** and use **Install**. If it fails, install Claude Code manually, restart Claw, and try again. |
| Your terminal is signed in, but Claw is not | Check **Location** and use the full login command copied from Claw, including its home prefix. |
| You finished terminal login, but the dialog is still open | Select **Refresh status**; terminal sign-in is not an automatic completion signal for this dialog. |
| Claw reports an authentication-check error | Verify that the CLI is installed and that the login ran against the selected home, then retry **Connect** and **Refresh status**. |
| A skill is missing | Check whether **Reuse my existing skills** is enabled and whether the skill belongs to Claude Code's existing home or the current project. |
| A plugin or MCP server works outside Claw only | Check which home or project owns its configuration. Sharing skills does not copy those settings. |
| Changing setup reports private skills already exist | Leave skill sharing disabled to preserve the separate home's skills. Claw does not overwrite them to enable reuse. |
| The engine is connected but absent when starting work | Check **Enable engine**. **Disconnect** signs out of the selected Claude setup; connect again if you used it. |

When reporting a problem, include the Claw version, location shown in Settings, account type, error text, and whether the failure occurs during installation, sign-in, conversation creation, or sending a prompt. Continue with [Troubleshooting](../troubleshooting/).
