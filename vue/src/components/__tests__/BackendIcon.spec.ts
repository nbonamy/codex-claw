import { mount } from '@vue/test-utils';
import { expect, it } from 'vitest';
import BackendIcon from '../BackendIcon.vue';

it('renders Antigravity identity and switches the shared icon when the provider changes', async () => {
  const wrapper = mount(BackendIcon, { props: { backend: 'antigravity' } });
  const source = wrapper.get('img').attributes('src');
  expect(source).toBeTruthy();
  await wrapper.setProps({ backend: 'claude' });
  expect(wrapper.get('img').attributes('src')).not.toBe(source);
});
