import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import AgentAvatarPicker from '../AgentAvatarPicker.vue';

describe('AgentAvatarPicker', () => {
  it('keeps the legacy agent contract as a thin IdentityPicker wrapper', async () => {
    const wrapper = mount(AgentAvatarPicker, {
      props: {
        name: 'Dina',
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          teleport: true,
          AgentAvatarCropDialog: true,
        },
      },
    });

    expect(wrapper.findComponent({ name: 'IdentityPicker' }).exists()).toBe(true);
    await wrapper.get('[aria-label="Change avatar"]').trigger('click');
    expect(wrapper.find('[aria-label="Custom avatar character"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Use custom avatar"]').exists()).toBe(true);
  });
});
