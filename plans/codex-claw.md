# Codex Claw Plan

Status: reviewed initial plan, 2026-06-05.

## Tech Stack

- Electron
- Electron Forge
- TypeScript
- Vue 3 with TypeScript
- Element Plus
- Vitest

## Product Progression

### 0. Foundation - Complete

Scaffold the desktop app with Electron Forge, TypeScript, Vue 3, Element Plus,
and Vitest. Hard-copy the first useful id8 renderer pieces, define app-owned
theme tokens, app state, IPC, `RendererMessage`, and `AgentBackendDriver`.
Use the Skwad screenshots and `docs/codex.png` as the visual references for the
first shell.

Verification: `npm test`, `npm run test:coverage`, `npm run lint`, and
`npm run build` pass. Coverage is above the 85% threshold for statements,
branches, functions, and lines.

Commit checkpoint: `feat: scaffold codex claw desktop`

### 1. No Team, Single Agent Chat

One configured agent with name, avatar, and folder. Main launches
`codex app-server`, preferably with isolated `CODEX_HOME`, starts or resumes one
Codex thread, sends prompts, and streams basic text plus simple tool calls.

Verification: fake app-server tests plus one real local smoke test.

Commit checkpoint: `feat: add single codex agent chat`

### 2. No Team, Multiple Agent Chats

Add an agent list and multiple independent agents, each with folder, thread, and
status. Switching agents restores the right transcript and in-flight state.

Verification: multi-agent reducer/session tests, UI smoke.

Commit checkpoint: `feat: add multiple agent sessions`

### 3. Bench / Agent Templates

Add Bench as the Skwad-style saved-agent concept: save an active agent as a
reusable template, show Bench in the agent creation flow, and deploy a Bench
template into the current no-team agent list.

Verification: persistence tests and deploy-from-bench UI smoke.

Commit checkpoint: `feat: add agent bench`

### 4. No Team, Agent Communication

Expose app-owned communication tools to Codex agents: list agents, send message,
check messages, and broadcast. Start global first; team scoping comes later.

Verification: fake app-server tool-call tests and two-agent communication smoke.

Commit checkpoint: `feat: add agent messaging tools`

### 5. Team Support

Add teams as the product grouping: team rail, team-scoped agent lists,
create/edit/delete teams, move agents, team status, and persisted selected team.

Bench deployment becomes team-aware here.

Verification: persistence tests and team navigation UI tests.

Commit checkpoint: `feat: add team support`

### 6. Richer Rendering

Render Codex-native surfaces beyond basic chat: plan updates, reasoning
summaries, ask-user questions, approvals, command output, file-change progress,
errors, and interrupted turns.

Verification: captured event fixture tests and screenshot checks.

Commit checkpoint: `feat: render codex turn details`

### 7. SWE Features

Add practical coding surfaces: git diff panel, git status/actions, file viewer,
open file, diff navigation, command helpers, and eventually rollback/review
flows.

Verification: git fixture tests, file viewer tests, end-to-end local workflow
smoke.

Commit checkpoint: `feat: add swe workspace tools`

## Cross-Cutting Rules

- Keep renderer independent from backend protocol details:
  backend event -> app event -> `RendererMessage`.
- Codex is the first backend; future Claude Code support should arrive through
  a new backend driver and translator.
- Keep commits phase-sized and demoable.
- Run, update, and add tests at every phase.
- At the end of plan execution, append key learnings focused on ways of working
  and design patterns.

## Key Learnings

- Phase 0 works best as a single-package Electron app. We can split packages
  later if the code asks for it, but the initial product surface benefits from
  fewer moving parts.
- Keep coverage thresholds enabled from the first scaffold. It immediately
  pushed tests toward state loading, status branches, and component fallbacks
  instead of only checking the happy path.
