---
name: mission-to-tickets
description: Turn approved Mission requirements into repository-scoped tracer-bullet tickets.
---

# Turn a Mission into tickets

Convert the accepted requirements into a small, ordered backlog that Mission agents can execute.

1. Read the accepted requirements and shared Mission artifacts. Inspect represented repositories or delegate focused repository research when code context affects the breakdown.
2. Draft tracer-bullet vertical slices. Each ticket must deliver independently verifiable behavior, fit one agent context, name exactly one represented repository, and include acceptance criteria plus meaningful verification.
3. Record real blocking edges only. Use an expand-migrate-contract sequence for a wide mechanical refactor that cannot land as independent vertical slices.
4. Upsert each draft through `{{mcpServerName}}.upsert-mission-ticket` as soon as it is coherent, then revise it through the same tool as the breakdown improves. Use the stable Mission ticket IDs returned by the tool for dependencies.
5. Review dependencies and repository assignment yourself before submission. Implementation results flow automatically into the explicit Review stage. User review happens manually in the Mission workspace after submission; do not ask the user to confirm the breakdown in chat.
6. When an existing tracker and its repository instructions are already configured, preserve its labels but do not publish tickets during this stage. Otherwise keep Mission tickets as the canonical backlog and continue without tracker setup.
7. Submit the complete proposal with `{{mcpServerName}}.submit-mission-result`.

The ticket stage is done when every ticket has one represented repository, the dependency frontier is valid, and the proposal is waiting for manual user review.
