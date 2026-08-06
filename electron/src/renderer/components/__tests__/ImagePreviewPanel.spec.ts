import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ImagePreviewPanel from '../ImagePreviewPanel.vue';

describe('ImagePreviewPanel', () => {
  it('renders the renderer-safe image source with its accessible description', () => {
    const wrapper = mount(ImagePreviewPanel, {
      props: {
        panel: {
          kind: 'image',
          title: 'diagram.png',
          subtitle: '/repo/diagram.png',
          path: '/repo/diagram.png',
          src: 'data:image/png;base64,aW1hZ2U=',
          alt: 'Architecture diagram',
          mimeType: 'image/png',
          state: 'idle',
          error: null,
        },
      },
    });

    expect(wrapper.attributes('aria-label')).toBe('diagram.png');
    expect(wrapper.get('img').attributes()).toMatchObject({
      alt: 'Architecture diagram',
      src: 'data:image/png;base64,aW1hZ2U=',
    });
  });
});
