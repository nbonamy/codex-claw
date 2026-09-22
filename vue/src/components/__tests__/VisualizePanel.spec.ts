import { flushPromises, mount } from '@vue/test-utils';
import { ElMessageBox } from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import type { VisualizeSession } from '@codex-claw/core/visualize';
import VisualizePanel from '../VisualizePanel.vue';

function visualizeSession(): VisualizeSession {
  return {
    id: 'visualize-1',
    conversationRef: { backend: 'codex', threadId: 'thread-1' },
    isOpen: true,
    suggestions: [
      { id: 'suggestion-system', title: 'System map', description: 'Services, boundaries, and data flow.' },
      { id: 'suggestion-sequence', title: 'Request sequence', description: 'The critical request path.' },
    ],
    visualizations: [],
    selectedVisualizationId: null,
    createdAt: '2026-09-21T12:00:00.000Z',
    updatedAt: '2026-09-21T12:00:00.000Z',
  };
}

describe('VisualizePanel', () => {
  it('moves from suggestions to an inspectable visualization and switches with the thumbnail strip', async () => {
    const readAsset = vi.fn().mockResolvedValue({
      visualizationId: 'visualization-image',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,ZGlhZ3JhbQ==',
    });
    const visualize = visualizeSession();
    const wrapper = mount(VisualizePanel, { props: { visualize, readAsset } });

    expect(wrapper.get('.visualize-panel__intro').text()).toContain('Choose a visualization to generate');
    expect(wrapper.findAll('.visualize-panel__suggestion')).toHaveLength(2);
    await wrapper.findAll('.visualize-panel__suggestion')[0].trigger('click');
    expect(wrapper.emitted('generate')).toStrictEqual([['suggestion-system']]);

    const generated: VisualizeSession = {
      ...visualize,
      suggestions: [{ ...visualize.suggestions[0], visualizationId: 'visualization-svg' }, visualize.suggestions[1]],
      visualizations: [{
        id: 'visualization-svg',
        title: 'System map',
        content: { kind: 'svg', source: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>' },
        revision: 1,
        createdAt: visualize.createdAt,
        updatedAt: visualize.updatedAt,
      }, {
        id: 'visualization-image',
        title: 'Concept image',
        content: { kind: 'image', assetPath: 'concept.png', mimeType: 'image/png', alt: 'Concept visualization' },
        revision: 1,
        createdAt: visualize.createdAt,
        updatedAt: visualize.updatedAt,
      }],
      selectedVisualizationId: 'visualization-svg',
    };
    await wrapper.setProps({ visualize: generated });
    await flushPromises();

    expect(wrapper.get('.visualize-panel__heading').text()).toContain('System map');
    expect(wrapper.text()).not.toContain('Also suggested');
    expect(wrapper.text()).not.toContain('Ask in chat to edit this visualization or add another.');
    expect(wrapper.findAll('.visualize-panel__thumbnail')).toHaveLength(2);
    expect(readAsset).toHaveBeenCalledWith('visualization-image');
    await wrapper.findAll('.visualize-panel__thumbnail')[1].trigger('click');
    expect(wrapper.emitted('select')).toStrictEqual([['visualization-image']]);
  });

  it('keeps legacy long suggestion descriptions compact while preserving the full text on hover', () => {
    const visualize = visualizeSession();
    const description = `Map ${'every relevant system boundary '.repeat(12)}`.trim();
    visualize.suggestions[0].description = description;
    const wrapper = mount(VisualizePanel, { props: { visualize, readAsset: vi.fn() } });
    const rendered = wrapper.findAll('.visualize-panel__suggestion p')[0];

    expect(rendered.text()).toHaveLength(118);
    expect(rendered.text()).toMatch(/…$/u);
    expect(rendered.attributes('title')).toBe(description);
  });

  it('sanitizes unsafe SVG before displaying it as an image', () => {
    const visualize = visualizeSession();
    visualize.visualizations = [{
      id: 'visualization-svg',
      title: 'Untrusted SVG',
      content: {
        kind: 'svg',
        source: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><a href="https://example.com"><rect onload="alert(2)" width="20" height="20"/></a></svg>',
      },
      revision: 1,
      createdAt: visualize.createdAt,
      updatedAt: visualize.updatedAt,
    }];
    visualize.selectedVisualizationId = 'visualization-svg';
    const wrapper = mount(VisualizePanel, {
      props: { visualize, readAsset: vi.fn() },
    });
    const source = decodeURIComponent(wrapper.get('.visualize-panel__diagram img').attributes('src') ?? '');

    expect(source).not.toContain('<script');
    expect(source).not.toContain('onload');
    expect(source).not.toContain('https://example.com');
  });

  it('zooms, pans, and resets the selected visualization while leaving thumbnails static', async () => {
    const visualize = visualizeSession();
    visualize.visualizations = [{
      id: 'visualization-svg',
      title: 'Interactive visualization',
      content: { kind: 'svg', source: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>' },
      revision: 1,
      createdAt: visualize.createdAt,
      updatedAt: visualize.updatedAt,
    }];
    visualize.selectedVisualizationId = 'visualization-svg';
    const wrapper = mount(VisualizePanel, { props: { visualize, readAsset: vi.fn() } });
    const visualization = wrapper.get('.visualize-panel__diagram');
    const viewport = visualization.get('.visualization-view__viewport');
    const image = visualization.get('.visualization-view__image');

    expect(wrapper.findAll('button[aria-label="Zoom in"]')).toHaveLength(1);
    expect(wrapper.findAll('.visualize-panel__thumbnail .visualization-view__controls')).toHaveLength(0);

    await wrapper.get('button[aria-label="Zoom in"]').trigger('click');
    expect(image.attributes('style')).toContain('scale(1.25)');

    viewport.element.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true, button: 0, clientX: 10, clientY: 10,
    }));
    viewport.element.dispatchEvent(new MouseEvent('pointermove', {
      bubbles: true, clientX: 30, clientY: 40,
    }));
    await flushPromises();
    expect(image.attributes('style')).toContain('translate(20px, 30px)');

    await viewport.trigger('keydown', { key: 'ArrowRight' });
    expect(image.attributes('style')).toContain('translate(0px, 30px)');

    await wrapper.get('button[aria-label="Reset view"]').trigger('click');
    expect(image.attributes('style')).toContain('translate(0px, 0px) scale(1)');

    viewport.element.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true, cancelable: true, deltaY: -100,
    }));
    await flushPromises();
    expect(wrapper.get('button[aria-label="Reset view"]').text()).toBe('106%');
  });

  it('confirms thumbnail deletion before emitting the visualization id', async () => {
    const visualize = visualizeSession();
    visualize.visualizations = [{
      id: 'visualization-system',
      title: 'System map',
      content: { kind: 'mermaid', source: 'flowchart LR\n A --> B' },
      revision: 1,
      createdAt: visualize.createdAt,
      updatedAt: visualize.updatedAt,
    }];
    visualize.selectedVisualizationId = 'visualization-system';
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const wrapper = mount(VisualizePanel, { props: { visualize, readAsset: vi.fn() } });

    await wrapper.get('button[aria-label="Delete System map"]').trigger('click');
    await flushPromises();

    expect(confirm).toHaveBeenCalledWith(
      '“System map” will be removed from this conversation.',
      'Delete diagram?',
      expect.objectContaining({ confirmButtonText: 'Delete', cancelButtonText: 'Cancel' }),
    );
    expect(wrapper.emitted('delete')).toStrictEqual([['visualization-system']]);

    confirm.mockRejectedValueOnce(new Error('cancelled'));
    await wrapper.get('button[aria-label="Delete System map"]').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('delete')).toStrictEqual([['visualization-system']]);
  });
});
