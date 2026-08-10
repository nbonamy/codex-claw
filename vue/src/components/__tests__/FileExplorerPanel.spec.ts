import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import FileExplorerPanel from '../FileExplorerPanel.vue';

describe('FileExplorerPanel', () => {
  const files = [
    { name: 'README.md', path: 'README.md' },
    { name: 'main.ts', path: 'src/main.ts' },
    { name: 'button.ts', path: 'src/components/button.ts' },
  ];

  it('lists folders before files, browses nested folders, searches paths, and previews files', async () => {
    const wrapper = mount(FileExplorerPanel, { props: { files } });
    expect(wrapper.findAll('.file-explorer__item').map((item) => item.text())).toStrictEqual(['src', 'README.md']);
    expect(wrapper.text()).toContain('src');
    expect(wrapper.text()).not.toContain('main.ts');

    await wrapper.find('.file-explorer__folder').trigger('click');
    expect(wrapper.text()).toContain('main.ts');
    expect(wrapper.findAll('.file-explorer__item').map((item) => item.text())).toStrictEqual([
      'src', 'components', 'main.ts', 'README.md',
    ]);
    await wrapper.find('button[title="Preview src/main.ts"]').trigger('click');
    expect(wrapper.emitted('preview')).toStrictEqual([['src/main.ts']]);
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Add to prompt');

    await wrapper.find('input[type="search"]').setValue('button');
    expect(wrapper.text()).toContain('button.ts');
    expect(wrapper.text()).not.toContain('README.md');
    expect(wrapper.findAll('.file-explorer__item').map((item) => item.text())).toStrictEqual([
      'src', 'components', 'button.ts',
    ]);
  });

  it('renders loading, empty, and error states', () => {
    expect(mount(FileExplorerPanel, { props: { files: [], loading: true } }).text()).toContain('Loading files');
    expect(mount(FileExplorerPanel, { props: { files: [] } }).text()).toContain('No files');
    expect(mount(FileExplorerPanel, { props: { files: [], error: 'Unavailable' } }).text()).toContain('Unavailable');
  });
});
