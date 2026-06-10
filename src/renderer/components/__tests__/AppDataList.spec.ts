import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppDataList from '../AppDataList.vue';

describe('AppDataList', () => {
  it('renders a section header, custom cells, and row actions', () => {
    const wrapper = mount(AppDataList, {
      props: {
        title: 'Current',
        columns: [{
          id: 'name',
          label: 'Name',
          width: 'minmax(0, 1fr)',
        }, {
          id: 'schedule',
          label: 'Schedule',
          width: 'max-content',
          align: 'end',
        }],
        rows: [{
          id: 'loop-bugs',
          name: 'GitHub bugs',
          schedule: 'Every few minutes',
        }],
      },
      slots: {
        headerActions: '<button type="button">New Loop</button>',
        'cell-name': '<template #default="{ row }"><strong>{{ row.name }}</strong></template>',
        actions: '<template #default="{ row }"><button type="button" :aria-label="`Edit ${row.id}`">Edit</button></template>',
      },
    });

    expect(wrapper.text()).toContain('Current');
    expect(wrapper.text()).toContain('New Loop');
    expect(wrapper.text()).toContain('GitHub bugs');
    expect(wrapper.text()).toContain('Every few minutes');
    expect(wrapper.find('[aria-label="Edit loop-bugs"]').exists()).toBe(true);
  });
});
