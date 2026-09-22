import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { DesignSession } from '@codex-claw/core/design';
import DesignPanel from '../DesignPanel.vue';

function designSession(): DesignSession {
  return {
    id: 'design-1',
    conversationRef: { backend: 'codex', threadId: 'thread-1' },
    suggestions: [
      { id: 'suggestion-system', title: 'System map', description: 'Services, boundaries, and data flow.' },
      { id: 'suggestion-sequence', title: 'Request sequence', description: 'The critical request path.' },
    ],
    diagrams: [],
    selectedDiagramId: null,
    createdAt: '2026-09-21T12:00:00.000Z',
    updatedAt: '2026-09-21T12:00:00.000Z',
  };
}

describe('DesignPanel', () => {
  it('moves from suggestions to an inspectable diagram and switches with the thumbnail strip', async () => {
    const readAsset = vi.fn().mockResolvedValue({
      diagramId: 'diagram-image',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,ZGlhZ3JhbQ==',
    });
    const design = designSession();
    const wrapper = mount(DesignPanel, { props: { design, readAsset } });

    expect(wrapper.get('.design-panel__intro').text()).toContain('Choose a diagram to generate');
    expect(wrapper.findAll('.design-panel__suggestion')).toHaveLength(2);
    await wrapper.findAll('.design-panel__suggestion')[0].trigger('click');
    expect(wrapper.emitted('generate')).toStrictEqual([['suggestion-system']]);

    const generated: DesignSession = {
      ...design,
      suggestions: [{ ...design.suggestions[0], diagramId: 'diagram-svg' }, design.suggestions[1]],
      diagrams: [{
        id: 'diagram-svg',
        title: 'System map',
        content: { kind: 'svg', source: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>' },
        revision: 1,
        createdAt: design.createdAt,
        updatedAt: design.updatedAt,
      }, {
        id: 'diagram-image',
        title: 'Concept image',
        content: { kind: 'image', assetPath: 'concept.png', mimeType: 'image/png', alt: 'Concept diagram' },
        revision: 1,
        createdAt: design.createdAt,
        updatedAt: design.updatedAt,
      }],
      selectedDiagramId: 'diagram-svg',
    };
    await wrapper.setProps({ design: generated });
    await flushPromises();

    expect(wrapper.get('.design-panel__heading').text()).toContain('System map');
    expect(wrapper.findAll('.design-panel__thumbnail')).toHaveLength(2);
    expect(readAsset).toHaveBeenCalledWith('diagram-image');
    await wrapper.findAll('.design-panel__thumbnail')[1].trigger('click');
    expect(wrapper.emitted('select')).toStrictEqual([['diagram-image']]);
  });

  it('keeps legacy long suggestion descriptions compact while preserving the full text on hover', () => {
    const design = designSession();
    const description = `Map ${'every relevant system boundary '.repeat(12)}`.trim();
    design.suggestions[0].description = description;
    const wrapper = mount(DesignPanel, { props: { design, readAsset: vi.fn() } });
    const rendered = wrapper.findAll('.design-panel__suggestion p')[0];

    expect(rendered.text()).toHaveLength(118);
    expect(rendered.text()).toMatch(/…$/u);
    expect(rendered.attributes('title')).toBe(description);
  });

  it('sanitizes unsafe SVG before displaying it as an image', () => {
    const design = designSession();
    design.diagrams = [{
      id: 'diagram-svg',
      title: 'Untrusted SVG',
      content: {
        kind: 'svg',
        source: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><a href="https://example.com"><rect onload="alert(2)" width="20" height="20"/></a></svg>',
      },
      revision: 1,
      createdAt: design.createdAt,
      updatedAt: design.updatedAt,
    }];
    design.selectedDiagramId = 'diagram-svg';
    const wrapper = mount(DesignPanel, {
      props: { design, readAsset: vi.fn() },
    });
    const source = decodeURIComponent(wrapper.get('.design-panel__diagram img').attributes('src') ?? '');

    expect(source).not.toContain('<script');
    expect(source).not.toContain('onload');
    expect(source).not.toContain('https://example.com');
  });

  it('zooms, pans, and resets the selected diagram while leaving thumbnails static', async () => {
    const design = designSession();
    design.diagrams = [{
      id: 'diagram-svg',
      title: 'Interactive diagram',
      content: { kind: 'svg', source: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>' },
      revision: 1,
      createdAt: design.createdAt,
      updatedAt: design.updatedAt,
    }];
    design.selectedDiagramId = 'diagram-svg';
    const wrapper = mount(DesignPanel, { props: { design, readAsset: vi.fn() } });
    const diagram = wrapper.get('.design-panel__diagram');
    const viewport = diagram.get('.design-diagram-view__viewport');
    const image = diagram.get('.design-diagram-view__image');

    expect(wrapper.findAll('button[aria-label="Zoom in"]')).toHaveLength(1);
    expect(wrapper.findAll('.design-panel__thumbnail .design-diagram-view__controls')).toHaveLength(0);

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
  });
});
