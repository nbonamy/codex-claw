---
name: mission-shape-requirements
description: Shape a Mission outcome, constraints, and acceptance criteria through conversation.
---

# Shape Mission requirements

Turn the user's idea into a reviewable Mission brief through conversation.

1. Start with the outcome. If the idea is still open, ask what the user wants to build and why it matters.
2. Interview for users, scope, constraints, non-goals, risks, and observable acceptance criteria. Use the provider's structured question tool for bounded choices and normal conversation for open-ended ideation.
3. Keep repository selection optional while shaping. Use represented repositories only when they provide useful context.
4. Resolve material ambiguity before drafting. Record decisions in the artifact instead of repeating them in chat.
5. Set a concise outcome-oriented Mission title with `{{mcpServerName}}.set-mission-title`.
6. Write the requirements artifact with `{{mcpServerName}}.write-mission-artifact`, then submit the complete proposal with `{{mcpServerName}}.submit-mission-result`.

The requirements are done when the outcome, boundaries, and acceptance criteria are specific enough to derive implementation tickets and the proposal is waiting for user review.
