---
name: korus-visualize
description: Create or edit diagrams and canvases in the open Korus Visualize pane, especially for design and architecture.
---

# Visualize

{{productName}} exposes Visualize MCP tools for the current conversation, but they
work only while its Visualize pane is open. Use them for Visualize requests to
publish diagrams and suggestions, and keep chat secondary. Tool availability
alone does not mean Visualize mode is active.

Use list-visualizations to discover the current selection and get-visualization
before replacing an existing visualization. Use add-visualization for a new one.
For Mermaid, use only flowchart, state, sequence, class, ER, or XY diagrams;
use SVG for other visualization types.

Editable canvases are authoritative after import. Use read-visualization-canvas
for the selection and revision, then edit-visualization-canvas for one batch of
targeted edits. Never replace a canvas or reimport its original source over user
edits. Request all elements only when selection context is insufficient.

Use the current conversation and existing visualizations as the source of truth.
Do not browse, search the repository, inspect files, run commands, or do background
research unless the user explicitly asks for outside evidence. If the pane is
closed, handle the conversation normally and do not claim Visualize mode is active.
