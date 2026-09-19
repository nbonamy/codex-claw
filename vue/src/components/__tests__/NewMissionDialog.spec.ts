import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import NewMissionDialog from '../NewMissionDialog.vue';
import { createMission } from '@codex-claw/core/missions';
import { createEmptySnapshot } from '@codex-claw/core/snapshot-construction';

describe('NewMissionDialog', () => {
  it('creates an outcome with the selected workflow and retains the form after failures', async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockImplementationOnce(input => Promise.resolve(createMission(createEmptySnapshot(), input)));
    const wrapper = mount(NewMissionDialog, { props: { modelValue: true, createMission: create }, global: { plugins: [ElementPlus] } });
    await flushPromises();
    const button = () => wrapper.findAll('button').find(b => b.text() === 'Create mission')!;
    expect(button().attributes('disabled')).toBeDefined();
    await wrapper.get('#mission-outcome').setValue(' Add billing ');
    await button().trigger('click'); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Offline');
    await button().trigger('click'); await flushPromises();
    expect(create).toHaveBeenLastCalledWith({ outcome: 'Add billing', workflowType: 'shapeAndShipFeature' });
    expect(wrapper.emitted('created')?.[0]?.[0]).toMatch(/^mission-/);
    expect(wrapper.emitted('update:modelValue')).toStrictEqual([[false]]);
  });
});

it('clears a dismissed draft on reopening and prevents closing or duplicate submissions while creating', async () => {
  let finish!: (mission: ReturnType<typeof createMission>) => void;
  const create = vi.fn(() => new Promise<ReturnType<typeof createMission>>(resolve => { finish = resolve; }));
  const wrapper = mount(NewMissionDialog, { props: { modelValue: true, createMission: create }, global: { plugins: [ElementPlus] } });
  await flushPromises();
  await wrapper.get('#mission-outcome').setValue('Discard this');
  await wrapper.findAll('button').find(b => b.text() === 'Cancel')!.trigger('click');
  expect(wrapper.emitted('update:modelValue')).toStrictEqual([[false]]);
  await wrapper.setProps({ modelValue: false });
  await wrapper.setProps({ modelValue: true });
  await flushPromises();
  expect((wrapper.get('#mission-outcome').element as HTMLInputElement).value).toBe('');
  await wrapper.get('#mission-outcome').setValue('Billing');
  await wrapper.get('form').trigger('submit');
  await wrapper.get('form').trigger('submit');
  await wrapper.findComponent({ name: 'FormDialog' }).vm.$emit('update:modelValue', false);
  expect(create).toHaveBeenCalledOnce();
  expect(wrapper.emitted('update:modelValue')).toStrictEqual([[false]]);
  finish(createMission(createEmptySnapshot(), { outcome: 'Billing', workflowType: 'shapeAndShipFeature' }));
  await flushPromises();
  expect(wrapper.emitted('created')).toHaveLength(1);
});
