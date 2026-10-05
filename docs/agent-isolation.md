# Agent Isolation

Status: working product-design note. No implementation direction in this
document is final unless it is marked as an agreed direction.

## Why This Needs A Product Model

An agent in Korus is attached to a folder. That simple rule makes the
conversation understandable, but it also means two agents can be attached to
the same Git checkout and mutate the same files, index, branch, and build
outputs.

Korus currently exposes isolation choices in several different places:

- repository session creation can reuse a checkout or create a worktree;
- backlog assignment can continue in an existing agent or create an isolated
  agent and worktree;
- duplicating or forking an agent may retain its folder;
- automations and MCP tools can create agents.

These are all presentations of one product question: **when should work share
a checkout, and when should Korus require or recommend isolation?** Designing
each warning or dialog independently will produce inconsistent policy.

## Vocabulary

The product should distinguish these concepts precisely:

- **Repository identity**: the credential-free Git remote identity when one is
  available, otherwise a stable local repository root.
- **Checkout**: one concrete working-tree folder with its files, Git index,
  checked-out branch, and uncommitted changes.
- **Worktree**: another checkout linked to the same Git repository. It shares
  Git objects and refs, but has its own files and index.
- **Agent workspace**: the folder attached to an agent. Quick Chats have no
  workspace.
- **Shared checkout**: two or more open agents attached to the same checkout
  on the same execution location.
- **Isolated agent**: an agent attached to a checkout that no other open agent
  uses.

Teams are organizational boundaries, not filesystem or isolation boundaries.
Agents in different teams can still conflict when they use the same checkout.
Likewise, identical path strings on different remote hosts do not identify the
same checkout.

## Isolation Levels

| Situation | Working files | Git index and `HEAD` | Expected warning |
| --- | --- | --- | --- |
| Quick Chat | None | None | None |
| Two agents in the same checkout | Shared | Shared | Yes |
| Two linked worktrees from one repository | Separate | Separate | No shared-checkout warning |
| Two independent clones of one remote | Separate | Separate | No shared-checkout warning |
| Matching paths on different hosts | Separate | Separate | No shared-checkout warning |

Linked worktrees still share repository objects and refs, so they are not
perfect process isolation. They are, however, the intended Korus isolation
boundary for concurrent coding work.

## Current Behavior

- Agent creation permits multiple agents to use the same folder without an
  explicit warning.
- There is no persisted user policy for shared-checkout warnings.

## Agreed Direction: Explicit Shared-Checkout Creation

When an explicit, user-driven action would create another agent in a checkout
already used by any open agent, Korus should warn before creating it. The check
must include agents in every team on the same execution location and should
not depend on whether those agents are currently working or idle.

The warning should name the checkout and list the conflicting agents with
their teams. Its explanation should be concrete: both agents will share files,
uncommitted changes, branch switches, commits, resets, and generated outputs.

The user needs four outcomes:

- cancel;
- continue this time;
- continue and stop warning for this repository;
- continue and stop warning for every repository.

The dialog should express those outcomes with two footer actions, **Cancel**
and **Continue**, plus one radio group:

- **Ask me again next time** (default);
- **Don't ask again for `<repository>`**;
- **Don't ask again for any repository**.

This is intentionally not four footer buttons. The radio group makes the
persistent consequence visible and requires only one selection before
continuing.

Suppression must be reversible in Settings. A global setting should control
whether Korus warns when agents share a checkout, and repository exceptions
need a discoverable reset mechanism.

## Creation Surfaces Requiring A Decision

The shared-checkout rule is clear for direct user creation, but the complete
product policy remains open for other entry points.

### New agent and repository session

These are explicit user actions and can show the warning before mutation. The
same policy should apply whether creation begins from Add project, a repository
row, a branch picker, the Agent dialog, a backlog item, or another team.

### Duplicate and fork

Duplicating or forking a conversation often intentionally retains its folder,
but that intent does not necessarily mean the user understands that the
checkout is shared. Decide whether these actions show the same warning, use
different explanatory copy, or offer isolation as part of the action itself.

### Model-created agents

The `create-agent` MCP tool can atomically create an isolated worktree, create
an unselected agent, and start it with a self-contained initial prompt. It can
also create an agent in an existing folder, so a renderer-only shared-checkout
warning would still leave this path inconsistent. A model must not be able to
bypass a user safety preference merely because creation began through MCP.

### Automations

Automations cannot wait indefinitely on an interactive dialog. Possible
policies are worktree-only creation, a configured isolation policy on the
automation, or a blocked execution with a clear resolution path. Silently
sharing an active checkout is the weakest option.

### Remote agents

Conflict identity must include execution location. Agents using the same
repository and path on two different hosts do not share files. Two agents on
the same remote host and checkout do.

## Preference Model Questions

Potential persisted settings:

- global shared-checkout warning enabled by default;
- repository exceptions for the shared-checkout warning;
- separately, a future default-branch routing prompt enabled by default;
- separately, repository exceptions for default-branch routing.

Repository exceptions can use the same credential-free remote identity and
repository-root fallback already used for repository icons. It remains to be
decided whether an exception follows a repository across execution locations
or is scoped to a specific local or remote location.

Settings must make persistent choices reversible. A raw hidden array of
exceptions is insufficient product behavior.

## Architecture Direction

Isolation assessment belongs behind `daemon`, because it owns agent state,
remote locations, filesystem identity, Git state, persistence, MCP, and
automations. Renderer components should receive an app-owned assessment and
present it; they should not infer canonical checkout identity from path strings
alone.

A future assessment contract may need to answer:

- whether the target is a Git checkout, plain folder, or no workspace;
- its repository and checkout identity;
- which open agents share it and in which teams;
- whether they share the same execution location;
- whether the requested operation is safe, warnable, or disallowed;
- which persisted preference applies;
- which alternatives, such as a new worktree, are available.

The confirmation and the eventual mutation should use one authoritative
decision path. Avoid implementing a renderer preflight that MCP, automations,
remote clients, or a race can bypass.

## Open Product Questions

1. Should duplicate and fork always warn when they retain a shared checkout?
2. Should a shared-checkout warning apply to plain folders as well as Git
   checkouts? The filesystem risk is the same, but repository-level suppression
   has no remote identity.
3. Does "don't ask again for this repository" follow the repository across
   machines and clones, or only this execution location?
4. How should repository exceptions be listed and reset in Settings?
5. What isolation contract should automations enforce?
6. What should `create-agent` MCP do when its target checkout is already in
   use?
7. Should Korus offer navigation to the existing agent as an alternative to
    creating another one?

## Next Step

Resolve the open questions into one isolation policy matrix before implementing
the shared-checkout dialog. Once agreed, define
the app-owned backend contract and persistence shape, then implement every
creation surface against that same policy rather than adding independent UI
guards.
