<p align="center">
   <img src="assets/icon.png" width="128" height="128" alt="Codex Claw App Icon" />
</p>

# Codex Claw

Meet your native Codex coding crew. Codex Claw is a desktop app that lets you
run a team of Codex agents, each with its own folder, identity, thread, tools,
and inbox, while rendering the work as a real app instead of a terminal stream.

![Electron](https://img.shields.io/badge/Electron-42+-47848F)
![Vue](https://img.shields.io/badge/Vue-3-42b883)
![TypeScript](https://img.shields.io/badge/TypeScript-6+-3178c6)
![License](https://img.shields.io/badge/License-Apache--2.0-green)

## Why Codex Claw

- **Feels like a team room:** teams, agents, avatars, folders, statuses, and
  Bench templates stay visible and organized.
- **Native Codex rendering:** messages, tool calls, command output, approvals,
  questions, plans, file edits, diff stats, and Markdown render as app UI.
- **Actually collaborative:** built-in MCP lets agents register, set status,
  list teammates, send messages, broadcast, and check their inbox.
- **Built for coding flow:** queue prompts, steer active turns, interrupt work,
  mention files, trigger skills, dictate prompts, and keep context/rate-limit
  state in sight.

## Features

- **Team and agent management** - Create teams, add Codex agents, edit avatars,
  move agents between teams, duplicate, restart, close, and persist everything.
- **Bench templates** - Save good agents as reusable templates and deploy them
  back into a team.
- **Native chat surface** - Stream assistant text, ordered message parts,
  syntax-highlighted code, links, tool groups, command logs, and file-change
  summaries.
- **Plan and goal modes** - Toggle Codex plan mode, start goal-oriented turns,
  and process app-server mode updates.
- **Agent-to-agent communication** - Local Claw MCP server with Skwad-shaped
  collaboration tools.
- **Composer superpowers** - Model/reasoning selector, queued prompts,
  active-turn steering, slash commands, skill search, file mentions, attach
  affordances, and macOS speech-to-text.
- **Runtime awareness** - Context-window gauge, account rate limits, backend
  status, agent status, thread history resume, and loading skeletons.

## Requirements

- A current macOS development environment.
- Node.js compatible with the Electron Forge/Vite toolchain.
- Access to a Codex app-server binary.

Codex Claw can use an isolated Codex home through `CODEX_CLAW_CODEX_HOME` and
resumes persisted agent sessions when possible.

## Development

```bash
npm install
npm run dev
```

Useful verification commands:

```bash
npm test
npm run test:coverage
npm run lint
npm run build
```

macOS packaging signs and notarizes by default. For local packaging checks that
do not need release signing:

```bash
CODEX_CLAW_SKIP_SIGNING=1 npm run build
CODEX_CLAW_SKIP_SIGNING=1 npm run package
```

## Architecture

Codex Claw keeps Codex protocol details in Electron main:

```text
Renderer UI -> typed preload IPC -> Electron main -> backend driver -> Codex app-server
```

The renderer consumes app-owned events and `RendererMessage` parts. Codex is
the implemented backend today, with a narrow backend seam ready for a future
Claude Code driver.

## Documentation

- [AGENTS.md](AGENTS.md) - repo rules for agents working on Codex Claw
- [docs/architecture.md](docs/architecture.md) - product and process
  architecture
- [docs/codex.md](docs/codex.md) - Codex app-server protocol notes
- [docs/mcp.md](docs/mcp.md) - Claw MCP collaboration server
- [docs/frontend.md](docs/frontend.md) - renderer and theming principles
- [docs/testing.md](docs/testing.md) - test strategy and coverage bar
- [plans/codex-claw.md](plans/codex-claw.md) - product progression

## License

Apache-2.0. See [LICENSE](LICENSE).
