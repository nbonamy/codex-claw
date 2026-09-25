import { describe, expect, it } from 'vitest';
import { editCanvas, isCanvasDocument, selectedCanvasElements, type CanvasDocument } from '../visualize-canvas';
const document: CanvasDocument = {
  revision: 1,
  elements: [{ id: 'a', type: 'text', x: 15, y: 20, width: 100, height: 24, text: 'User name' }, { id: 'b', type: 'rectangle', x: 200, y: 80, width: 90, height: 60 }],
  files: {}, selectedElementIds: ['a'], preview: '',
};
describe('canvas edits', () => {
  it('changes only targeted properties, preserving user geometry, IDs and the input document', () => {
    const updated = editCanvas(document, [{ id: 'a', changes: { text: 'New name' } }]);
    expect(updated.revision).toBe(2);
    expect(updated.elements[0]).toMatchObject({ id: 'a', text: 'New name', originalText: 'New name', x: 15, y: 20 });
    expect(updated.elements[1]).toStrictEqual(document.elements[1]);
    expect(document.elements[0].text).toBe('User name');
  });
  it.each([
    [{ id: 'missing', changes: { x: 20 } }],
    [{ id: 'a', changes: { x: 20 } }, { id: 'a', changes: { y: 30 } }],
    [{ id: 'a', changes: { link: 'javascript:alert(1)' } }],
    [{ id: 'a', changes: { opacity: 'red' } }],
    [{ id: 'a', changes: { x: Infinity } }],
    [{ id: 'a', changes: { text: 'Valid' } }, { id: 'b', changes: { width: -1 } }],
  ].map(edits => ({ edits })))('rejects the entire invalid batch %#', ({ edits }) => {
    expect(() => editCanvas(document, edits)).toThrow();
    expect(document.elements[0].text).toBe('User name');
  });
  it('includes a selected shape’s bound label without pulling in the whole graph', () => {
    const scene = { ...document, selectedElementIds: ['b'], elements: [{ ...document.elements[0], containerId: 'b' }, document.elements[1], { ...document.elements[1], id: 'c' }] };
    expect(selectedCanvasElements(scene).map(element => element.id)).toStrictEqual(['a', 'b']);
  });
  it('rejects executable embeds, duplicate IDs, external assets and invalid selections', () => {
    expect(isCanvasDocument(document)).toBe(true);
    for (const invalid of [
      { ...document, elements: [...document.elements, document.elements[0]] },
      { ...document, elements: [{ ...document.elements[0], type: 'iframe' }] },
      { ...document, selectedElementIds: ['missing'] },
      { ...document, files: { a: { id: 'a', mimeType: 'image/png', dataURL: 'https://example.com/a.png', created: 0 } } },
    ]) expect(isCanvasDocument(invalid)).toBe(false);
  });
});
