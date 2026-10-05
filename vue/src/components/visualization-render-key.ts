import type { Visualization } from '@workspace/core/visualize';

export function visualizationRenderKey(visualization: Visualization): string {
  const content = visualization.content;
  return JSON.stringify(content.kind === 'image'
    ? [visualization.id, content.kind, content.assetPath, content.mimeType]
    : [visualization.id, content.kind, content.source]);
}
