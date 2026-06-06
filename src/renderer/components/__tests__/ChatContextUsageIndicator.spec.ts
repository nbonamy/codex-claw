import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ChatContextUsageIndicator from '../ChatContextUsageIndicator.vue';
import { i18n } from '../../i18n';

describe('ChatContextUsageIndicator', () => {
  it('renders a context occupation circle with token detail', () => {
    const wrapper = mount(ChatContextUsageIndicator, {
      props: {
        contextUsage: {
          totalTokens: 397_740,
          inputTokens: 320_000,
          cachedInputTokens: 80_000,
          outputTokens: 72_000,
          reasoningOutputTokens: 24_000,
          lastTotalTokens: 64_600,
          modelContextWindow: 258_400,
          usedPercent: 25,
        },
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.find('.chat-context-usage').exists()).toBe(true);
    expect(wrapper.attributes('aria-label')).toBe('Context usage');
    expect(wrapper.attributes('title')).toBeUndefined();
    expect(wrapper.get('.chat-context-usage__popover').text()).toBe('Context window:25% used (75% left)65k / 258k tokens used');
    expect(wrapper.attributes('style')).toContain('--chat-context-usage-percent: 25%');
  });

  it('caps the tooltip numerator when the latest context reaches the window', () => {
    const wrapper = mount(ChatContextUsageIndicator, {
      props: {
        contextUsage: {
          totalTokens: 397_740,
          inputTokens: 320_000,
          cachedInputTokens: 80_000,
          outputTokens: 72_000,
          reasoningOutputTokens: 24_000,
          lastTotalTokens: 397_740,
          modelContextWindow: 258_400,
          usedPercent: 100,
        },
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.get('.chat-context-usage__popover').text()).toBe('Context window:100% used (0% left)258k / 258k tokens used');
  });

  it('stays hidden until a context utilization percent is available', () => {
    const wrapper = mount(ChatContextUsageIndicator, {
      props: {
        contextUsage: {
          totalTokens: 50_000,
          inputTokens: 40_000,
          cachedInputTokens: 10_000,
          outputTokens: 8_000,
          reasoningOutputTokens: 2_000,
          lastTotalTokens: 3_000,
          modelContextWindow: null,
          usedPercent: null,
        },
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.html()).toBe('<!--v-if-->');
  });
});
