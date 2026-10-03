---
description: Download and install the Codex Claw desktop app.
---

# Installation

The desktop release is available for **macOS on Apple silicon**. Linux x64 support is experimental; Computer Use and Appshots are macOS-only.

## Install on macOS

1. [Download the macOS DMG](https://codex-claw.nabocorp.com/desktop/downloads/codex-claw-macos-arm64.dmg).
2. Open the DMG and move Codex Claw to Applications.
3. Launch Codex Claw. The first-run screen checks your coding engines and offers **Connect Codex**, **Connect Claude Code**, and **Customize** for each one.
4. Choose how each engine should store its setup before connecting it. Follow the steps below, then open a repository.

## Choose separate or existing provider setup

Claw can keep its provider setup separate from your existing command-line tools. On the first-run screen, click **Customize** beneath the engine you want to configure.

| Choice | Use it when |
| --- | --- |
| **Separate Claw chats** | You want Claw's chats and provider sign-in kept in a separate setup environment. |
| **Use existing setup** | You want Claw to use the provider environment already configured on this computer. |

This choice is independent for Codex and Claude Code. Selecting an existing Codex setup does not select an existing Claude setup, and signing in to one engine does not authenticate the other.

Follow the [provider setup overview](../providers/) before changing an existing setup. It explains skills and plugin sharing, the selected provider location, and what happens to Claw conversations when you switch locations later.

## Connect at least one engine

Claw does not include a separate model subscription. Connect a provider account with access to the engine you want to use.

1. Use **Connect Codex** for the OpenAI sign-in flow, or **Connect Claude Code** for its provider-specific authentication steps.
2. Confirm the engine is connected and enabled. The first-run **Continue** action becomes available when at least one installed engine is connected and enabled; connecting both is optional.
3. Select **Continue**.

Use the complete [Codex](../providers/codex) or [Claude Code](../providers/claude-code) guide for the engine you choose. A detected installation alone does not establish that its selected setup environment is signed in.

## Connect GitHub, or skip it

The next onboarding step offers GitHub authorization. Connect it if you want to browse GitHub repositories and use issue or pull-request workflows. Choose **Skip for now** to start with a local folder; you can connect GitHub later in **Settings → Integrations**.

GitHub authorization is separate from your coding provider's account. You can run a local repository task without connecting GitHub.

## Open a working folder

In the empty workspace, choose **Existing folder or repository…** to open a checkout already on disk. The same start-work menu offers a new project, a GitHub repository, or a repository URL.

For a first task, choose a small local repository whose branch and existing changes you understand. Continue with the [quickstart](./quickstart).

## Development builds

Contributors can run the app from source. The repository README describes the required Node.js toolchain, sibling SDK checkout, and development commands.

Experimental source builds may expose behavior that differs from the desktop release. When reporting a problem, include the app version and whether you are using a release or a development build.

## Next step

Follow the [quickstart](./quickstart). If launch or authentication fails, start with [Troubleshooting](../troubleshooting/).
