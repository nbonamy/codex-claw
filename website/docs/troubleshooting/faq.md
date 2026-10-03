---
description: Answers to common questions about accounts, local state, agents, and delivery.
---

# Frequently asked questions

## Does Claw include model access?

Use your connected coding provider's account and plan. Claw supplies the workspace; the provider determines model availability and usage limits.

## Which desktop platforms are supported?

The desktop download targets macOS on Apple silicon. Linux x64 support is experimental. Computer Use and Appshots are currently macOS-only.

## Do agents share files?

Agents using the same folder share its files. Use separate [worktrees](../workflows/worktrees) for concurrent writers in one repository.

## Does “Separate Claw chats” mean a separate model subscription?

It selects a separate provider setup environment for Claw's chats, sign-in, and configuration. You still use a provider account with the model access you need. Codex and Claude Code make this setup choice independently.

See [Provider guides](../providers/) for the exact account, skills, and plugin boundaries.

## Why do I need to sign in when my CLI is already connected?

Check the engine's selected setup location. A separate Claw environment has its own authentication; **Use existing setup** selects the provider environment already configured on this computer. Signing in to Codex also does not authenticate Claude Code.

## Do I need GitHub to use Claw?

You can skip GitHub onboarding and work in an existing local folder. Connect GitHub in **Settings → Integrations** when you want GitHub repository browsing, issue and pull-request workflows, or Automations.

## Does creating a new project create a Git worktree?

A project provides a working folder. A worktree is a checkout of an existing Git repository with its own branch. Ask for the operation you want and verify the resulting folder and Git state.

## What happens when I switch agents?

The selected conversation and workspace change. Background work can continue, and each agent retains its own draft and workspace context.

## Can work continue after I close the desktop app?

The background `clawd` daemon can keep agent work alive after the desktop app closes. Check **Settings → General → Keep Codex Claw ready in the background** and the conversation state when you return. A provider question or approval can still require your response.

## Does my provider receive repository context?

The selected coding provider receives the prompts and context used for its session, which can include file content, diffs, command output, and tool results. Consider the provider's own data policies when choosing what to share.

## Is a completed task already committed or deployed?

Check the agent's result and Git state. Implementation, validation, commit, push, pull-request creation, merge, and deployment are separate outcomes. Ask explicitly for the delivery action you want.

## When should I use a Mission?

Use a [Mission](../workflows/missions) for an outcome that needs requirements, an implementation breakdown, and explicit stage review. Use an ordinary conversation for a bounded task, or [Code Review](../workflows/code-review) for existing changes.
