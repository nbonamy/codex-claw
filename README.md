# Codex Claw

Codex Claw is a desktop app for working with multiple Codex agents as a team.
It combines the team and agent workflow from Skwad with native chat, tool-call,
diff, and artifact rendering inspired by id8.

The first product is intentionally Codex-only. The app talks to the Codex
app-server from Electron main, translates Codex events into app-owned messages,
and streams those messages into a Vue renderer over typed IPC.

## Status

The current implementation is the no-team multi-agent MVP. It boots an Electron
app with two Codex agents, routes prompts through Electron main to the Codex
app-server, keeps each agent's transcript isolated, and allows switching agents
while another agent keeps working in the background.

## Product Shape

- **Teams**: top-level groups for agents.
- **Agents**: named teammates with avatars, folders, Codex threads, and status.
- **Bench**: saved deployable agent templates, borrowed from Skwad.
- **Conversation**: native rendering for messages, tool calls, approvals,
  plans, command output, file changes, and diffs.
- **Artifacts**: side panes for plans, files, diffs, git state, and related
  coding context.

The renderer consumes Codex Claw's own message model. Codex-specific protocol
types stay behind the main-process Codex driver so another backend, such as
Claude Code, can be added later without rewriting the UI.

## Tech Stack

- Electron
- Electron Forge
- TypeScript
- Vue 3 with TypeScript
- Element Plus
- Vitest

## Architecture Principles

- Electron main owns Codex app-server lifecycle, protocol transport, request
  IDs, approval handling, filesystem access, and persistence.
- Preload exposes a small typed IPC bridge.
- Renderer owns visual state and interaction state only.
- Backend protocol events are translated into app-owned events before they
  reach the renderer.
- Themes are built from semantic tokens and CSS variables from the start.
- Bench is a first-class product primitive, not just a creation shortcut.

## Roadmap

1. No team, single Codex agent chat with basic rendering. Complete.
2. No team, multiple independent agent chats. Complete.
3. Bench support for reusable agent templates.
4. Agent-to-agent communication tools.
5. Team support.
6. Richer Codex rendering for plan mode, approvals, questions, diffs, and
   command output.
7. SWE surfaces such as git diff, git actions, and file viewing.

See [plans/codex-claw.md](plans/codex-claw.md) for the working product plan.

## Documentation

- [docs/architecture.md](docs/architecture.md): product model, process
  architecture, IPC, backend seam, persistence, and open decisions.
- [docs/codex.md](docs/codex.md): Codex app-server communication.
- [docs/mcp.md](docs/mcp.md): app-owned MCP server for agent collaboration.
- [docs/frontend.md](docs/frontend.md): Vue, Element Plus, component, shell,
  and theming principles.
- [docs/testing.md](docs/testing.md): testing strategy and coverage bar.
- [docs/codex.png](docs/codex.png): visual reference for the target shell.
- [AGENTS.md](AGENTS.md): repo guidance for Codex agents working here.

## Development

Run the app during development with:

```bash
npm run dev
```

Every code change should include focused tests unless it is docs-only or cannot
be tested. Once coverage tooling exists, the minimum coverage threshold is 85%
for statements, branches, functions, and lines.

## License

Apache-2.0. See [LICENSE](LICENSE).
