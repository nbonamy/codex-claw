import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImageAnnotationDialog from '../ImageAnnotationDialog.vue';

const context = {
  arc: vi.fn(),
  arcTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  closePath: vi.fn(),
  drawImage: vi.fn(),
  ellipse: vi.fn(),
  fill: vi.fn(),
  fillText: vi.fn(),
  getImageData: vi.fn(),
  lineTo: vi.fn(),
  measureText: vi.fn(() => ({ width: 34 })),
  moveTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  stroke: vi.fn(),
};
const mountedWrappers: VueWrapper[] = [];
const originalClipboard = navigator.clipboard;
const componentSource = readFileSync(resolve(process.cwd(), 'src/renderer/components/ImageAnnotationDialog.vue'), 'utf8');
const ElTooltipStub = {
  name: 'ElTooltip',
  props: ['content'],
  template: '<span class="tooltip-stub" :data-content="content"><slot /></span>',
};

beforeEach(() => {
  for (const value of Object.values(context)) {
    if (typeof value === 'function' && 'mockClear' in value) value.mockClear();
  }
  context.getImageData.mockReturnValue(solidImageData(800, 400));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,annotated');
});

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard });
});

describe('ImageAnnotationDialog', () => {
  it('scopes its compact title inset to the image annotation dialog', () => {
    expect(componentSource).toContain(':global(.image-annotation-dialog.el-dialog > .el-dialog__header)');
    expect(componentSource).toContain('padding-left: var(--space-12);');
    expect(componentSource).toMatch(
      /:global\(\.image-annotation-dialog\.el-dialog > \.el-dialog__body\) \{[^}]*padding: 0;/,
    );
    expect(componentSource).toContain('<template #footer>');
    expect(componentSource).toMatch(
      /:global\(\.image-annotation-dialog\.el-dialog > \.el-dialog__footer\) \{[^}]*padding: var\(--space-3\) var\(--space-4\);/,
    );
    expect(componentSource).toMatch(
      /\.image-annotation-dialog__body \{[^}]*display: grid;[^}]*grid-template-rows: minmax\(0, 1fr\);/,
    );
    expect(componentSource).toMatch(/\.image-annotation-dialog__content \{[^}]*height: 100%;/);
    expect(componentSource).toMatch(/\.image-annotation-dialog__comment-list \{[^}]*padding: var\(--space-2\);/);
    expect(componentSource).toMatch(
      /\.image-annotation-dialog__comment-list \{[^}]*grid-auto-rows: max-content;[^}]*align-content: start;/,
    );
  });

  it('keeps the compact title and annotation tools together without instructional copy', async () => {
    const wrapper = await mountDialog();

    const header = wrapper.get('.image-annotation-dialog__header');
    const dialog = wrapper.findComponent({ name: 'ElDialog' });
    expect(dialog.props('width')).toBe('80vw');
    expect(dialog.attributes('style')).toContain('height: 80vh');
    expect(dialog.attributes('style')).toContain('margin-top: 10vh');
    expect(header.get('.claw-dialog__title').text()).toBe('Annotate');
    expect(header.get('.image-annotation-dialog__header-main').find('.image-annotation-dialog__toolbar').exists()).toBe(true);
    expect(header.get('.image-annotation-dialog__header-trailing').find('[aria-label="Image information"]').exists()).toBe(true);
    expect(header.find('[aria-label="Close image annotation"]').exists()).toBe(false);
    expect(wrapper.find('.claw-dialog__subtitle').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Drag to draw');
    expect(wrapper.text()).not.toContain('Choose a tool');
    expect(wrapper.get('[aria-label="Image information"]').text()).toContain('800×400px');
    expect(wrapper.get('[aria-label="Image information"]').text()).toContain('100%');
    expect(wrapper.find('.image-annotation-dialog__comments-heading').exists()).toBe(false);
    expect(wrapper.get('.image-annotation-dialog__comments-empty').text()).toBe('No annotations yet');
    expect(wrapper.find('.image-annotation-dialog__comment-list').exists()).toBe(false);
    const ovalTool = wrapper.get('[aria-label="Oval"]');
    expect(ovalTool.find('.tabler-icon-circle').exists()).toBe(true);
    expect(ovalTool.attributes('title')).toBeUndefined();
    expect(ovalTool.find('span').exists()).toBe(false);
    expect(ovalTool.element.parentElement?.dataset.content).toBe('Oval (O)');
  });

  it('shows the pixel color under the cursor and copies it with Tab', async () => {
    const wrapper = await mountDialog();
    const canvas = annotationCanvas(wrapper);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    dispatchPointer(canvas, 'pointermove', 200, 100);
    await nextTick();

    expect(wrapper.get('.image-annotation-dialog__inspector-color').text()).toContain('255, 255, 255');
    expect(wrapper.get('.image-annotation-dialog__color-swatch').classes()).toContain(
      'image-annotation-dialog__color-swatch--sampled',
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    await nextTick();
    expect(writeText).toHaveBeenCalledWith('255, 255, 255');

    dispatchPointer(canvas, 'pointerleave', 0, 0);
    await nextTick();
    expect(wrapper.get('.image-annotation-dialog__inspector-color').text()).toContain('—');
  });

  it('draws, comments, accumulates, and emits a rasterized image', async () => {
    const wrapper = await mountDialog();
    const canvas = annotationCanvas(wrapper);

    await wrapper.get('img').trigger('error');
    expect(wrapper.emitted('image-error')).toStrictEqual([[]]);
    await wrapper.setProps({ imageSrc: 'one-pixel-placeholder.png' });
    Object.defineProperties(wrapper.get('img').element, {
      naturalWidth: { configurable: true, value: 1 },
      naturalHeight: { configurable: true, value: 1 },
    });
    await wrapper.get('img').trigger('load');
    expect(wrapper.emitted('image-error')).toStrictEqual([[], []]);

    await wrapper.get('[aria-label="Rectangle"]').trigger('click');
    dispatchPointer(canvas, 'pointerdown', 50, 40);
    dispatchPointer(canvas, 'pointermove', 240, 150);
    dispatchPointer(canvas, 'pointerup', 240, 150);
    await nextTick();
    await nextTick();

    expect(wrapper.find('[aria-label="Image annotation comment"]').exists()).toBe(true);
    await wrapper.get('.annotation-popup__input').setValue('Keep this control aligned.');
    await wrapper.get('form.annotation-popup').trigger('submit');
    await nextTick();

    expect(wrapper.get('.image-annotation-dialog__comments').text()).toContain('Keep this control aligned.');
    expect(wrapper.get('.image-annotation-dialog__comment-number').text()).toBe('1');

    await wrapper.get('[aria-label="Send annotated image with 1 annotations"]').trigger('click');

    expect(context.drawImage).toHaveBeenCalled();
    expect(wrapper.emitted('send')).toStrictEqual([[
      expect.objectContaining({
        dataUrl: 'data:image/png;base64,annotated',
        fileName: 'fixture.png',
        height: 592,
        pixelRatio: 1,
        width: 992,
        annotations: [expect.objectContaining({
          number: 1,
          tool: 'rectangle',
          comment: 'Keep this control aligned.',
        })],
      }),
    ]]);
  });

  it('draws arrows beyond the image and supports measurement shortcuts', async () => {
    const wrapper = await mountDialog();
    const canvas = annotationCanvas(wrapper);

    dispatchPointer(canvas, 'pointerdown', 30, 30);
    context.quadraticCurveTo.mockClear();
    context.moveTo.mockClear();
    dispatchPointer(canvas, 'pointermove', 180, 90);
    expect(context.quadraticCurveTo).toHaveBeenCalled();
    expect(context.quadraticCurveTo).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      60,
      60,
    );
    expect(context.moveTo).toHaveBeenCalledWith(360, 180);

    dispatchPointer(canvas, 'pointerup', 180, 90);
    await nextTick();
    await nextTick();
    expect(wrapper.findComponent({ name: 'ElDialog' }).props('closeOnPressEscape')).toBe(false);
    await wrapper.get('[aria-label="Image annotation comment"]').trigger('keydown', { key: 'Escape' });
    await nextTick();

    expect(wrapper.find('[aria-label="Image annotation comment"]').exists()).toBe(false);
    expect(wrapper.findAll('.image-annotation-dialog__comment-number')).toHaveLength(0);
    expect(wrapper.emitted('close')).toBeUndefined();
    expect(wrapper.findComponent({ name: 'ElDialog' }).props('closeOnPressEscape')).toBe(true);

    await wrapper.get('[aria-label="Oval"]').trigger('click');
    context.bezierCurveTo.mockClear();
    context.ellipse.mockClear();
    dispatchPointer(canvas, 'pointerdown', 40, 45);
    context.ellipse.mockClear();
    dispatchPointer(canvas, 'pointermove', 210, 135);
    expect(context.bezierCurveTo).not.toHaveBeenCalled();
    expect(context.ellipse).toHaveBeenCalledOnce();
    expect(context.ellipse).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      0,
      0,
      Math.PI * 2,
    );

    await wrapper.get('.image-annotation-dialog__body').trigger('keydown', { key: 'h' });
    expect(wrapper.get('[aria-label="Measure horizontal gap"]').attributes('aria-pressed')).toBe('true');

    context.fillText.mockClear();
    dispatchPointer(canvas, 'pointermove', 200, 100);
    expect(context.fillText).toHaveBeenCalledWith('798px', expect.any(Number), expect.any(Number));
  });

  it('reports logical dimensions and gaps in Retina mode', async () => {
    const wrapper = await mountDialog();
    const canvas = annotationCanvas(wrapper);
    const retinaToggle = wrapper.get('[aria-label="Retina mode"]');

    expect(retinaToggle.text()).toBe('@2x');
    expect(retinaToggle.attributes('aria-pressed')).toBe('false');
    await retinaToggle.trigger('click');
    expect(retinaToggle.attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Image information"]').text()).toContain('400×200px');

    await wrapper.get('[aria-label="Measure horizontal gap"]').trigger('click');
    context.fillText.mockClear();
    dispatchPointer(canvas, 'pointermove', 200, 100);
    expect(context.fillText).toHaveBeenCalledWith('399px', expect.any(Number), expect.any(Number));
  });

  it('starts in Retina mode when the image source reports a 2x representation', async () => {
    const wrapper = await mountDialog(800, 400, 2);

    expect(wrapper.get('[aria-label="Retina mode"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Image information"]').text()).toContain('400×200px');

    await wrapper.setProps({ initialPixelRatio: 1 });
    expect(wrapper.get('[aria-label="Retina mode"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('[aria-label="Image information"]').text()).toContain('800×400px');
  });

  it('removes marks and keeps annotation numbers contiguous', async () => {
    const wrapper = await mountDialog();
    const canvas = annotationCanvas(wrapper);

    await drawAndSaveComment(wrapper, canvas, 30, 30, 160, 80);
    await drawAndSaveComment(wrapper, canvas, 100, 100, 280, 180);
    expect(wrapper.find('.image-annotation-dialog__comments-empty').exists()).toBe(false);
    expect(wrapper.findAll('.image-annotation-dialog__comment-number').map((item) => item.text())).toStrictEqual(['1', '2']);

    await wrapper.get('[aria-label="Edit annotation 1"]').trigger('click');
    await wrapper.get('[aria-label="Image annotation comment"]').trigger('keydown', { key: 'Escape' });
    await nextTick();
    expect(wrapper.findAll('.image-annotation-dialog__comment-number')).toHaveLength(2);

    await wrapper.get('[aria-label="Remove annotation 1"]').trigger('click');
    expect(wrapper.findAll('.image-annotation-dialog__comment-number').map((item) => item.text())).toStrictEqual(['1']);
  });

  it('keeps small images at natural size and supports Command zoom shortcuts', async () => {
    const wrapper = await mountDialog(320, 180);
    const stage = wrapper.get<HTMLElement>('.image-annotation-dialog__stage');
    const dialogStyle = wrapper.findComponent({ name: 'ElDialog' }).attributes('style');

    const image = wrapper.get<HTMLElement>('.image-annotation-dialog__image');
    expect(stage.element.style.width).toBe('512px');
    expect(image.element.style.width).toBe('62.5%');
    await wrapper.get('.image-annotation-dialog__body').trigger('keydown', { key: '+', code: 'Equal', metaKey: true });
    expect(stage.element.style.width).toBe('640px');
    expect(wrapper.findComponent({ name: 'ElDialog' }).attributes('style')).toBe(dialogStyle);
    await wrapper.get('.image-annotation-dialog__body').trigger('keydown', { key: '-', code: 'Minus', metaKey: true });
    expect(stage.element.style.width).toBe('512px');
  });

  it('fits oversized images inside the canvas viewport without changing zoom', async () => {
    const wrapper = await mountDialog(1_000, 1_000);
    const workspace = wrapper.get<HTMLElement>('.image-annotation-dialog__workspace').element;
    Object.defineProperties(workspace, {
      clientWidth: { configurable: true, value: 500 },
      clientHeight: { configurable: true, value: 300 },
    });

    await wrapper.get('img').trigger('load');
    await nextTick();
    await nextTick();

    const stage = wrapper.get<HTMLElement>('.image-annotation-dialog__stage').element;
    const image = wrapper.get<HTMLElement>('.image-annotation-dialog__image').element;
    const displayedImageWidth = Number.parseFloat(stage.style.width) * Number.parseFloat(image.style.width) / 100;
    const displayedImageHeight = displayedImageWidth;
    expect(displayedImageWidth).toBeCloseTo(300);
    expect(displayedImageHeight).toBeCloseTo(300);
    expect(wrapper.get('[aria-label="Image information"]').text()).toContain('100%');
  });

  it('frames the source image instead of its virtual margins on load', async () => {
    const wrapper = await mountDialog();
    const workspace = wrapper.get<HTMLElement>('.image-annotation-dialog__workspace').element;
    const stage = wrapper.get<HTMLElement>('.image-annotation-dialog__stage').element;
    Object.defineProperties(workspace, {
      clientWidth: { configurable: true, value: 400 },
      clientHeight: { configurable: true, value: 300 },
      scrollLeft: { configurable: true, value: 0, writable: true },
      scrollTop: { configurable: true, value: 0, writable: true },
    });
    Object.defineProperties(stage, {
      offsetLeft: { configurable: true, value: 0 },
      offsetTop: { configurable: true, value: 0 },
      getBoundingClientRect: {
        configurable: true,
        value: () => ({ width: 592, height: 392 }),
      },
    });

    await wrapper.get('img').trigger('load');
    await nextTick();

    expect(workspace.scrollLeft).toBe(96);
    expect(workspace.scrollTop).toBe(46);
  });

  it('scrolls the virtual canvas while an arrow is dragged past the viewport', async () => {
    const wrapper = await mountDialog();
    const canvas = annotationCanvas(wrapper);
    const workspace = wrapper.get<HTMLElement>('.image-annotation-dialog__workspace').element;
    const scrollBy = vi.fn();
    Object.defineProperties(workspace, {
      getBoundingClientRect: {
        configurable: true,
        value: () => ({ left: 0, right: 400, top: 0, bottom: 300, width: 400, height: 300 }),
      },
      scrollBy: { configurable: true, value: scrollBy },
    });

    dispatchPointer(canvas, 'pointerdown', 200, 150);
    dispatchPointer(canvas, 'pointermove', 430, 150);

    expect(scrollBy).toHaveBeenCalledWith({ left: 28, top: 0, behavior: 'auto' });
  });

  it('handles tool shortcuts without dialog focus and keeps measurement visible at the last hover point', async () => {
    const wrapper = await mountDialog();
    const canvas = annotationCanvas(wrapper);
    dispatchPointer(canvas, 'pointermove', 200, 100);
    context.fillText.mockClear();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v' }));
    await nextTick();

    expect(wrapper.get('[aria-label="Measure vertical gap"]').attributes('aria-pressed')).toBe('true');
    expect(context.fillText).toHaveBeenCalled();
  });

  it('reports an image source that never finishes loading', async () => {
    vi.useFakeTimers();
    const wrapper = trackWrapper(mount(ImageAnnotationDialog, {
      props: {
        visible: true,
        imageSrc: 'stalled-image.png',
      },
      global: {
        stubs: {
          ElTooltip: ElTooltipStub,
          ElDialog: {
            name: 'ElDialog',
            props: ['modelValue', 'closeOnPressEscape'],
            template: '<section v-if="modelValue"><slot name="header" /><slot /><slot name="footer" /></section>',
          },
        },
      },
    }));

    await vi.advanceTimersByTimeAsync(1_200);

    expect(wrapper.emitted('image-error')).toStrictEqual([[]]);
  });

  it('immediately replaces a failed source with its fallback image', async () => {
    const wrapper = trackWrapper(mount(ImageAnnotationDialog, {
      props: {
        visible: true,
        imageSrc: 'missing-image.png',
        fallbackImageSrc: 'fallback-image.png',
      },
      global: {
        stubs: {
          ElTooltip: ElTooltipStub,
          ElDialog: {
            name: 'ElDialog',
            props: ['modelValue', 'closeOnPressEscape'],
            template: '<section v-if="modelValue"><slot name="header" /><slot /><slot name="footer" /></section>',
          },
        },
      },
    }));

    await wrapper.get('img').trigger('error');

    expect(wrapper.get('img').attributes('src')).toBe('fallback-image.png');
    expect(wrapper.emitted('image-error')).toStrictEqual([[]]);
  });
});

async function mountDialog(width = 800, height = 400, initialPixelRatio: 1 | 2 = 1): Promise<VueWrapper> {
  const wrapper = trackWrapper(mount(ImageAnnotationDialog, {
    props: {
      visible: true,
      imageSrc: 'fixture.png',
      fileName: 'fixture.png',
      initialPixelRatio,
    },
    global: {
      stubs: {
        Teleport: true,
        ElTooltip: ElTooltipStub,
        ElDialog: {
          name: 'ElDialog',
          props: ['modelValue', 'closeOnPressEscape', 'width'],
          template: '<section v-if="modelValue"><slot name="header" /><slot /><slot name="footer" /></section>',
        },
      },
    },
  }));
  const image = wrapper.get('img').element;
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: width },
    naturalHeight: { configurable: true, value: height },
  });
  await wrapper.get('img').trigger('load');
  await nextTick();
  return wrapper;
}

function trackWrapper<T extends VueWrapper>(wrapper: T): T {
  mountedWrappers.push(wrapper);
  return wrapper;
}

function annotationCanvas(wrapper: VueWrapper): HTMLCanvasElement {
  const canvas = wrapper.get<HTMLCanvasElement>('.image-annotation-dialog__canvas').element;
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    configurable: true,
    value: () => {
      const width = canvas.width / 2;
      const height = canvas.height / 2;
      return {
        x: 0,
        y: 0,
        top: 0,
        right: width,
        bottom: height,
        left: 0,
        width,
        height,
        toJSON: () => ({}),
      };
    },
  });
  Object.defineProperty(canvas, 'setPointerCapture', { configurable: true, value: vi.fn() });
  Object.defineProperty(canvas, 'releasePointerCapture', { configurable: true, value: vi.fn() });
  return canvas;
}

function dispatchPointer(canvas: HTMLCanvasElement, type: string, clientX: number, clientY: number): void {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  canvas.dispatchEvent(event);
}

async function drawAndSaveComment(
  wrapper: VueWrapper,
  canvas: HTMLCanvasElement,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): Promise<void> {
  dispatchPointer(canvas, 'pointerdown', startX, startY);
  dispatchPointer(canvas, 'pointermove', endX, endY);
  dispatchPointer(canvas, 'pointerup', endX, endY);
  await nextTick();
  await nextTick();
  await wrapper.get('.annotation-popup__input').setValue('Saved annotation');
  await wrapper.get('form.annotation-popup').trigger('submit');
  await nextTick();
}

function solidImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}
