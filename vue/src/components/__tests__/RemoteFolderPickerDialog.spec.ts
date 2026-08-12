import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import RemoteFolderPickerDialog from '../RemoteFolderPickerDialog.vue';

describe('RemoteFolderPickerDialog', () => {
  it('uses shared footer variants and selects the loaded folder', async () => {
    const listSourceFolders = vi.fn().mockResolvedValue({
      path: '/srv/repos',
      parentPath: '/srv',
      entries: [],
    });
    const wrapper = mount(RemoteFolderPickerDialog, {
      props: {
        initialPath: '/srv/repos',
        listSourceFolders,
        remoteConnectionId: 'connection-1',
        visible: false,
      },
      global: {
        stubs: {
          ElButton: { template: '<button><slot /></button>' },
          ElDialog: {
            props: ['modelValue'],
            template: '<section v-if="modelValue" class="remote-folder-picker-dialog"><slot /><slot name="footer" /></section>',
          },
        },
      },
    });
    await wrapper.setProps({ visible: true });
    await flushPromises();

    expect(wrapper.findAll('.claw-dialog__footer .claw-button').map((button) => button.classes())).toStrictEqual([
      ['claw-button', 'claw-button--tertiary'],
      ['claw-button', 'claw-button--primary'],
    ]);
    expect(listSourceFolders).toHaveBeenCalledWith({
      path: '/srv/repos',
      remoteConnectionId: 'connection-1',
    });

    await wrapper.get('.claw-button--primary').trigger('click');
    expect(wrapper.emitted('select')).toStrictEqual([['/srv/repos']]);
    expect(wrapper.emitted('close')).toStrictEqual([[]]);
  });
});
