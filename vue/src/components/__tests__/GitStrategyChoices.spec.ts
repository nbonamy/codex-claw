import { mount } from '@vue/test-utils';
import { expect, it } from 'vitest';
import GitStrategyChoices from '../GitStrategyChoices.vue';

it.each([
  ['pull', ['Git configuration', 'Merge', 'Rebase', 'Fast-forward only'], 'git-config', 'rebase'],
  ['update', ['Merge', 'Rebase'], 'merge', 'rebase'],
  ['integration', ['Merge commit', 'Squash and merge', 'Rebase and fast-forward', 'Fast-forward only'], 'merge', 'ff-only'],
] as const)('offers visible icon choices for %s and changes only the selected strategy', async (kind, labels, initial, next) => {
  const wrapper = mount(GitStrategyChoices, { props: { kind, modelValue: initial, label: 'Strategy' } });
  const group = wrapper.get('[role="radiogroup"][aria-label="Strategy"]');
  expect(group.findAll('input[type="radio"]').map(input => input.attributes('aria-label'))).toStrictEqual([...labels]);
  for (const option of group.findAll('label')) {
    expect(option.find('svg[aria-hidden="true"]').exists()).toBe(true);
    const input = option.get<HTMLInputElement>('input');
    expect(input.element.checked).toBe(input.element.value === initial);
    expect(option.get('span[id]').attributes('id')).toBe(input.attributes('aria-describedby'));
    expect(option.get('span[id]').text()).not.toBe('');
  }
  expect(wrapper.find('[role="combobox"]').exists()).toBe(false);
  await group.get(`input[value="${next}"]`).setValue(true);
  expect(wrapper.emitted('update:modelValue')).toStrictEqual([[next]]);
  await wrapper.setProps({ modelValue: next });
  expect(group.get<HTMLInputElement>(`input[value="${next}"]`).element.checked).toBe(true);
  expect(group.get<HTMLInputElement>(`input[value="${initial}"]`).element.checked).toBe(false);
  wrapper.unmount();
});
