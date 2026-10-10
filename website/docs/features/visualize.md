---
description: Explore a design with diagrams and targeted canvas feedback.
---

# Visualize

Visualize brings diagrams and interactive explanations into the workspace next to your conversation.

## Start a visualization

Enter `/visualize` in your conversation, or open **Visualize** from the workspace's **+** menu. The pane uses your conversation as context and can offer suggested diagrams. Select a suggestion when the agent is idle, or ask for a specific result in the composer.

```text
Show how a request moves from the frontend through the backend
and where authentication is checked.
```

## Explore the canvas

Diagrams open on an editable canvas. Zoom, use **Fit canvas**, and select or move shapes to explore the result. Use the diagram to discuss responsibilities, dependencies, or a sequence of operations.

The thumbnail strip switches among generated visualizations. Use **Save PNG** to download the selected canvas. A visualization's delete button asks for confirmation before removing it.

## Give targeted feedback

1. Choose **Annotate canvas** in the canvas toolbar.
2. Select the shape you want to discuss.
3. Write a concrete comment and choose **Add annotation**.
4. Submit the annotation from the composer. You can send it without additional text, or include a broader instruction.

For example, annotate a service with “Split the validation step out of this service and show the error path.” Korus sends the selected elements and comment, allowing the agent to edit that part while preserving unrelated shapes and your manual edits.

Keep the Visualize pane open while working on the visualization so the agent can access its current selection and canvas state.

## Supported results and recovery

Visualize supports Mermaid flowchart, state, sequence, class, ER, and XY diagrams, along with SVG and generated-image results. Ask for SVG if you need a diagram type outside those Mermaid families. Image generation depends on the tools available to the selected provider.

If suggestions are still being generated, wait for the current turn to finish before choosing one. If the agent cannot access the canvas, reopen Visualize for that agent and ask it to inspect the current selection. After manual edits, ask for a targeted change to the existing canvas so those edits remain part of the result.
