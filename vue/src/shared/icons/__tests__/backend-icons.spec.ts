import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ClaudeCodeBackendIcon, CodexBackendIcon } from '../backend-icons';

describe('backend icons', () => {
  it.each([
    ['Codex', CodexBackendIcon],
    ['Claude Code', ClaudeCodeBackendIcon],
  ])('renders the %s backend mark as an accessible-size-agnostic SVG', (_name, component) => {
    const wrapper = mount(component);

    expect(wrapper.element.tagName).toBe('svg');
    expect(wrapper.get('path').attributes('fill') ?? wrapper.element.getAttribute('fill')).toBe('currentColor');
  });
});
