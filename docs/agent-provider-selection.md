# Choosing the coding agent

Status: implemented for creation routes and pre-prompt selection. Mission
implementation/review role policy remains a separate decision.

## Problem

Claw can create agents through several manual and automated entry points.
The original New agent dialog offers Codex or Claude Code when Claude is
enabled, but newer creation paths frequently force Codex. A provider setting
that exists in only one dialog no longer covers the product.

We need a consistent way to choose the coding agent without adding friction to
quick actions such as starting a session on main.

## Agreed requirements

- Account for creation actions, including those without a dialog.
- Include both user-driven creation and automated creation through tools and
  workflows.
- Support choosing Claude Code to review code written by Codex, and vice versa.
  A reviewer's provider is an independent choice; inheritance alone is not
  sufficient.
- Reuse the creation services and selection controls across entry points.
- Show a provider selector only when multiple backends are enabled. With one
  enabled backend, use it automatically and keep the existing simple interaction.
- Populate choices from enabled backends. Availability is a user configuration
  concept here, not whether a backend process is currently running.
- Any fresh, empty chat allows changing its backend before the first prompt,
  even when creation already selected one. Show this control only when multiple
  backends are enabled.

## Decisions by creation route

| Entry point | Interaction | Agreed behavior |
| --- | --- | --- |
| Any route using New agent, including Cockpit | New agent dialog | Already has the selector; retain it with the shared visibility rule |
| New session on main | Direct menu action | Create immediately; choose the backend on the empty chat before the first prompt |
| New worktree session | Worktree dialog | Add a conditional select like New agent |
| New session from branch or work item | Repository source/assignment dialog | Add a conditional footer containing the provider select |
| New agent from Backlog | Assignment flow or New agent dialog | Follow the rule for the dialog used by that route |
| New project | Project-name dialog | Add a conditional select like New agent |
| Open an existing folder | Folder picker, then empty chat | Choose or override the backend on the empty chat before the first prompt |
| From GitHub | Acquire/clone, then branch/work-item dialog | Use the downstream dialog's selector |
| From repository URL | URL dialog | Repair the broken dialog and add a conditional select like New agent |
| New Quick Chat | Direct action, then empty chat | Choose or override the backend before the first prompt |
| Duplicate or fork | Agent action | Keep the source agent's backend |
| Delegate/create agent through MCP, with or without a worktree | Tool call | Optional backend argument; default to the caller's backend |
| Create project from Quick Chat | Tool call and provisioning progress | Same tool-call rule: optional backend, default to the caller's backend |
| New Mission | Empty requirements chat | Choose or override the lead's backend before the first prompt |
| Independent code review | Start-review flow | Optional provider select, shown only with multiple enabled backends |

Progress dialogs display the provider selected before creation begins.
Acquisition flows carry an explicit selection through subsequent steps.

## Backend selection before the first prompt

The empty chat is a common place to choose the backend for existing folders,
Quick Chats, and new Missions. It also allows changing a selection made earlier
in any creation flow. Earlier menus and dialogs provide the initial choice;
they do not lock it before the conversation starts.

Switching backend updates the composer's model catalog and selected model,
reasoning controls, approval/permission controls, and other capabilities to
match that backend. Keep the draft text and attachments while switching; apply
the selected backend's attachment support and validation before sending.
Model IDs and approval settings must remain scoped to their provider.

Eligibility means a fresh conversation before its first submitted prompt, not
merely an empty rendered message list. A conversation that is loading, has a provider session,
forked with history, or already running must not become switchable because no
messages are currently visible. Automated first prompts use the provider chosen
by their creation flow.

The first prompt goes to the selected backend with its matching settings.
Switching and sending must be coordinated so a prompt cannot reach the previous
backend while the composer displays the new selection. Once the first prompt
has been submitted, this pre-conversation switch is no longer offered.

The backend control sits on the composer shelf. With one enabled backend,
the control is hidden.

## Dialog details

For the branch/work-item dialog, the selector sits in the bottom-left corner
of the conditional footer, separate from action buttons on the right.

Use the same compact selector as New agent for worktree, project, and URL
dialogs. Routes already using New agent need no additional selection step.

When assigning work to an existing session, its backend is already determined;
the new-agent choice must not imply that it changes that session's provider.

The repository URL input accepts both HTTPS and SSH Git addresses; browser
URL-field validation must not reject the supported SSH syntax.

The design uses route-specific controls. It does not currently require a global
"next agent" toggle.

## Automated creation and review

Tool calls accept an optional backend. Explicit selection takes precedence;
omitting it uses the authenticated caller's backend. This applies to delegation
and project creation from Quick Chat. Duplicate and fork preserve their source
backend.

Independent review exposes an optional provider selection so Claude can review
Codex work and vice versa. It defaults to the source agent's backend, without
persisting a separate reviewer preference. Findings, triage, remediation,
and the completion message remain Claw-owned. Changing the reviewer provider
must not transfer provider-specific conversation IDs or incompatible model
settings; model selection must remain valid for the selected backend.

The new Mission's empty requirements chat selects the lead's backend. Provider
policy for later implementation and review roles remains to be agreed.

## Shared implementation boundary

`BackendSelector` is the shared product control, with small, default, and large
sizes. `AppShell` provides the enabled choices once through `backend-selection`;
dialogs do not read settings independently.
Current configuration always enables Codex and optionally enables Claude Code.

`core/agent-backends` owns enabled-provider resolution and fresh-agent
eligibility. Selected providers travel through app-owned contracts to existing
creation services. The existing provider-specific catalogs supply model options.

Changing the backend of a fresh agent needs an app-owned operation that updates
its provider and compatible defaults together. Any eagerly created empty
provider session must be handled by the backend lifecycle; the renderer cannot
simply swap a label while retaining a session belonging to another provider.

Backend validation should give a clear error for an unavailable explicit
provider rather than silently creating an agent with another provider.

Backend changes clear incompatible provider defaults and refresh catalogs.
The persisted `hasSubmittedPrompt` marker locks selection even if the first
submission fails before a provider session is created. Restart clears this
marker along with the old session. Sending waits for an outstanding switch;
late catalog responses from the former provider are ignored.

## Validation

Exercise representative manual flows with Claude selected, including the empty
chat created on main and a dialog flow. With one enabled backend, verify selectors disappear
and creation uses that backend.
Verify tool calls honor explicit overrides and otherwise use the caller's
backend. Cover Codex-authored work reviewed by Claude, as well as incompatible
model settings and unavailable providers. Verify the repaired URL flow carries
its selected backend through acquisition and agent creation.
For empty chats, verify switching updates model and permission controls,
preserves the draft, and routes the first prompt to the selected provider.
Verify loaded history or an in-flight first prompt cannot expose the switch.
Test the shared policy at its owner and the UI wiring where each path can lose
the selection.
