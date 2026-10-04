---
description: Set up Codex with separate Claw chats or your existing environment, sign in, and configure skills and plugins.
---

# Codex

Codex is bundled with the Claw desktop app. You can use it without installing a separate Codex CLI, but you still need to connect an account with Codex access.

## Choose a separate or existing setup

On the first connection screen, select **Customize** beneath Codex. If you are already in the workspace, open **Settings → Codex → Location → Customize**.

For a separate environment:

1. Select **Separate Claw chats**.
2. Leave **Reuse my existing skills** checked to share your existing Codex skills and plugins, or uncheck it to manage them separately.
3. Select **Save**.

With the standard installation, Claw uses `~/.codex-claw/codex-home`. Your normal Codex conversations and account configuration remain in their existing home. The separate setup requires its own sign-in; Claw does not copy your existing credentials.

For your existing environment:

1. Select **Use existing setup**.
2. Select **Save**.
3. Check the location displayed in Settings. It normally points to `~/.codex`, or the existing home configured in Claw's launch environment.

Claw can use the authentication and configuration already present there. If that setup is signed out, connect it using the steps below. This choice shares the provider home; it does not import old conversations as Claw agents or move them into a separate home.

::: warning Changing location after creating agents
Changing between these choices removes local Codex agents and Quick Chats from Claw after explicit confirmation. Their history stays in the old home, and switching back does not restore those agents. Read [Change the conversation location later](./index#change-the-conversation-location-later) first.
:::

## Connect Codex

1. Select **Connect Codex** on the first connection screen, or **Connect** under **Account** in **Settings → Codex**.
2. Complete the browser sign-in with the account you want Claw to use.
3. Return to Claw and wait for the account to show **Connected**. While sign-in is pending, **Cancel sign-in** lets you stop and retry.
4. If this is your first engine, choose **Continue** to proceed with setup. Otherwise, check that **Enable engine** is on in Settings.

If your selected existing setup is already authenticated, Claw can recognize it without another browser login. A connected engine that was disabled can be enabled again without signing out.

## Verify the first conversation

Create an agent in the working folder you want to use. Choose **Codex** if an engine picker appears, then select an available model and reasoning level from the conversation controls.

Start with a request such as:

> Read this repository's instructions and summarize how to run its checks. Do not change any files.

Check that Codex responds and uses the intended folder. If a tool needs approval, review the request in the conversation. A successful sign-in alone does not prove that every repository, model, or external tool is available.

## Skills, plugins, and MCP servers

With **Separate Claw chats → Reuse my existing skills** enabled, Codex shares the `skills` and `plugins` resources from your existing Codex home. This is live sharing: installing or editing a shared resource can affect Codex sessions outside Claw too.

The rest of the provider setup stays separate. For example, an MCP server configured only in your normal Codex configuration is not copied by checking **Reuse my existing skills**. Configure it for the home shown in Claw, or choose **Use existing setup** if you intend to share the full setup.

With reuse disabled, install the resources you need into the Claw Codex home. If Claw reports that private skills or plugins already exist when enabling sharing, leave sharing disabled to preserve them rather than treating reuse as an automatic merge.

Claw supplies its own collaboration tools to agents. You do not need to add the `codex_claw` MCP server by hand to coordinate Claw teammates. See [Agent collaboration](../reference/agent-collaboration).

## Customize Codex

For the **Separate Claw chats** setup on macOS:

1. Install the ChatGPT desktop app if you want to use its Codex customization interface.
2. Open **Settings → Codex** and select **Launch ChatGPT**. **Settings → Plugins → Install Codex Plugins and MCP Servers** uses the same launch action.
3. If ChatGPT is already running, Claw offers to quit and relaunch it for the separate Claw Codex home.
4. Manage the desired skills, plugins, or sandbox policies there, then return to Claw and verify the tool in a conversation.

::: info Existing setup and ChatGPT launch
The current **Launch ChatGPT** action targets Claw's separate Codex home. If you chose **Use existing setup**, customize the existing Codex environment you selected rather than assuming this launch action opens it. Check **Location** before comparing settings.
:::

To edit personal instructions, open **Settings → Personalization**, choose **Codex**, and check the displayed instruction-file path. These edits follow the selected Codex home; with **Use existing setup**, they also affect your setup outside Claw.

## Use a custom Codex executable

The bundled runtime is the default. For development or a specific troubleshooting need, open **Settings → Codex → Runtime** and set **Codex executable**, using **Choose** to select the file. Changing this setting restarts Claw.

Clear the setting to return to bundled Codex. Selecting a different executable does not select a different conversation home; **Location** controls that separately.

## Connection problems

| Symptom | What to check |
| --- | --- |
| Codex is signed in in your terminal, but Claw asks for sign-in | Compare homes under **Location**. A separate Claw home needs its own authentication. |
| The first screen says **Detected**, but work cannot start | Detection confirms the runtime, not authentication. Complete **Connect Codex**. |
| Browser sign-in remains pending | Finish the flow in the browser or select **Cancel sign-in** and retry. |
| A skill, plugin, or MCP server is missing | Check the selected home and whether resource reuse is enabled. Skills/plugin sharing does not copy all provider configuration. |
| A custom runtime fails | Check **Codex executable**; clear it to retry with bundled Codex. |
| The engine is connected but unavailable for new work | Turn on **Enable engine**. **Disconnect** signs out of the selected Codex setup; connect again if you used it. |

When reporting a problem, include the Claw version, displayed location, runtime choice, and the error message. See [Troubleshooting](../troubleshooting/) for the wider diagnostic checklist.
