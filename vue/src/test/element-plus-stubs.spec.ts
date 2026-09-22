import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
  ElDropdownItemStub,
  ElDropdownMenuStub,
  ElDropdownStub,
} from './element-plus-stubs';

describe('Element Plus test controls', () => {
  it('closes a dropdown after an item command', async () => {
    const command = vi.fn();
    const visibleChange = vi.fn();
    const Harness = defineComponent({
      components: {
        ElDropdown: ElDropdownStub,
        ElDropdownItem: ElDropdownItemStub,
        ElDropdownMenu: ElDropdownMenuStub,
      },
      setup: () => ({ command, visibleChange }),
      template: `
        <ElDropdown @command="command" @visible-change="visibleChange">
          <button type="button">Actions</button>
          <template #dropdown>
            <ElDropdownMenu>
              <ElDropdownItem command="edit">Edit</ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>
      `,
    });
    const wrapper = mount(Harness);

    await wrapper.get('button').trigger('click');
    expect(wrapper.find('[role="menu"]').exists()).toBe(true);

    await wrapper.get('[role="menuitem"]').trigger('click');

    expect(command).toHaveBeenCalledExactlyOnceWith('edit');
    expect(visibleChange.mock.calls).toStrictEqual([[true], [false]]);
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
  });
});
