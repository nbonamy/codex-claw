import { expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ElInput, ElSelect, ElOption, ElInputNumber } from 'element-plus';
import type { AutomationSchedule } from '@workspace/core/contracts';
import AutomationScheduleEditor from '../AutomationScheduleEditor.vue';

const daily = { rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0', timeZone: 'America/Chicago' };
function editor(modelValue: AutomationSchedule = daily) {
  const wrapper = mount(AutomationScheduleEditor, { attachTo: document.body, props: { modelValue,
    'onUpdate:modelValue': value => { void wrapper.setProps({ modelValue: value }); } },
    global: { components: { ElInput, ElSelect, ElOption, ElInputNumber } } });
  return wrapper;
}
async function choose(wrapper: ReturnType<typeof editor>, label: string, text: string) {
  const control = wrapper.get(`[aria-label="${label}"]`);
  await control.trigger('click'); await flushPromises();
  const list = document.getElementById(control.attributes('aria-controls')!);
  const row = [...list!.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(row => row.textContent === text);
  expect(row, text).toBeDefined(); row!.click(); await flushPromises();
}
it('edits daily, weekday and weekly schedules through calendar controls', async () => {
  const wrapper = editor();
  const rows = wrapper.findAll('.settings-row');
  expect(rows.map(row => row.get('strong').text())).toEqual(['Repeat', 'Time']);
  expect(wrapper.find('[aria-label="Timezone"]').exists()).toBe(false);
  expect(getComputedStyle(rows[0]!.element).display).toBe('grid');
  expect(getComputedStyle(rows[0]!.get('.settings-row__control').element).justifySelf).toBe('end');
  expect(wrapper.text()).toContain('Next run:');
  expect(wrapper.find('[aria-label="Day"]').exists()).toBe(false);
  await choose(wrapper, 'Repeat', 'Weekdays');
  expect(wrapper.props('modelValue')).toEqual({ ...daily, rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=8;BYMINUTE=0;BYSECOND=0' });
  await choose(wrapper, 'Repeat', 'Weekly');
  await choose(wrapper, 'Day', 'Monday'); // deselect initial Monday
  await choose(wrapper, 'Day', 'Wednesday');
  expect(wrapper.props('modelValue')).toEqual({ ...daily, rrule: 'FREQ=WEEKLY;BYDAY=WE;BYHOUR=8;BYMINUTE=0;BYSECOND=0' });
  await choose(wrapper, 'Day', 'Friday');
  const weekly = { ...daily, rrule: 'FREQ=WEEKLY;BYDAY=WE,FR;BYHOUR=8;BYMINUTE=0;BYSECOND=0' };
  expect(wrapper.props('modelValue')).toEqual(weekly);
  wrapper.unmount();
  const reopened = editor(weekly);
  await flushPromises();
  expect(reopened.get('[aria-label="Repeat"]').element.closest('.el-select')?.textContent).toContain('Weekly');
  await choose(reopened, 'Day', 'Monday');
  expect(reopened.props('modelValue')).toEqual({ ...daily, rrule: 'FREQ=WEEKLY;BYDAY=WE,FR,MO;BYHOUR=8;BYMINUTE=0;BYSECOND=0' });
  await choose(reopened, 'Repeat', 'Daily');
  await choose(reopened, 'Repeat', 'Weekly');
  expect(reopened.props('modelValue')).toEqual({ ...daily, rrule: 'FREQ=WEEKLY;BYDAY=WE,FR,MO;BYHOUR=8;BYMINUTE=0;BYSECOND=0' });
});
it('supports every-N custom periods and elapsed intervals', async () => {
  const wrapper = editor();
  await choose(wrapper, 'Repeat', 'Custom');
  await choose(wrapper, 'Frequency', 'Monthly');
  await wrapper.get('[aria-label="Every"]').setValue('2');
  await wrapper.get('[aria-label="Day of month"]').setValue('15');
  await flushPromises();
  expect(wrapper.props('modelValue')).toEqual({ ...daily, rrule: 'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15;BYHOUR=8;BYMINUTE=0;BYSECOND=0' });
  await choose(wrapper, 'Repeat', 'Interval');
  expect(wrapper.props('modelValue')).toEqual({ intervalMinutes: 60 });
  expect(wrapper.find('[aria-label="Timezone"]').exists()).toBe(false);
});
it('preserves an advanced rule on open and reports invalid edits instead of simplifying it', async () => {
  const schedule = { ...daily, rrule: 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;BYHOUR=8;BYMINUTE=0;BYSECOND=0' };
  const wrapper = editor(schedule);
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  expect((wrapper.get('[aria-label="Recurrence rule"]').element as HTMLTextAreaElement).value).toBe(schedule.rrule);
  await wrapper.get('[aria-label="Recurrence rule"]').setValue('FREQ=DAILY;BYHOUR=99');
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain('valid schedule');
});

it('automatically uses the user timezone when changing an interval to a calendar schedule', async () => {
  const wrapper = editor({ intervalMinutes: 60 });
  await choose(wrapper, 'Repeat', 'Daily');
  expect(wrapper.props('modelValue')).toEqual({
    rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  expect(wrapper.find('[aria-label="Timezone"]').exists()).toBe(false);
});
