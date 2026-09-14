import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import CockpitAgentsView from '../CockpitAgentsView.vue';
import CockpitView from '../CockpitView.vue';

const cockpitViewSource = readFileSync(resolve(process.cwd(), 'src/components/CockpitView.vue'), 'utf8');

describe('CockpitView', () => {
  it('shows all agents grouped by team by default', () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(CockpitView, {
      props: { agents: snapshot.agents, teams: snapshot.teams, viewMode: 'teams' },
      global: { plugins: [ElementPlus] },
    });

    expect(wrapper.get('h1').text()).toBe('Agents');
    expect(wrapper.get('.agent-cockpit__header span').text()).toBe(String(snapshot.agents.length));
    expect(wrapper.findComponent(CockpitAgentsView).props('mode')).toBe('teams');
  });

  it('switches the overview to recent activity without leaving the Cockpit', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(CockpitView, {
      props: { agents: snapshot.agents, teams: snapshot.teams, viewMode: 'teams' },
      global: { plugins: [ElementPlus] },
    });

    await wrapper.findAll('[role="tab"]')[1]?.trigger('click');

    expect(wrapper.emitted('update-view-mode')).toStrictEqual([['recent']]);
    expect(wrapper.findComponent(CockpitAgentsView).props('mode')).toBe('teams');

    await wrapper.setProps({ viewMode: 'recent' });
    expect(wrapper.findComponent(CockpitAgentsView).props('mode')).toBe('recent');
  });

  it('uses the standard compact app-bar height', () => {
    expect(cockpitViewSource).toContain('height: var(--workbench-appbar-height);');
    expect(cockpitViewSource).toContain('padding: 0 var(--space-20);');
    expect(cockpitViewSource).toContain('.agent-cockpit__mode :deep(.el-tabs__active-bar)');
    expect(cockpitViewSource).toContain('.agent-cockpit__mode :deep(.el-tabs__nav-wrap::after)');
    expect(cockpitViewSource).toContain('.agent-cockpit__mode :deep(.el-tabs__item:focus-visible)');
  });
});
