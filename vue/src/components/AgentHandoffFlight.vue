<template>
  <span
    ref="labelElement"
    class="agent-handoff-flight"
    :class="{
      'agent-handoff-flight--fixed': source,
      'agent-handoff-flight--origin': !source,
      'agent-handoff-flight--travelling': target,
      'agent-handoff-flight--concealed': concealed,
    }"
    :style="positionStyle"
    aria-hidden="true"
    @transitionend="onTransitionEnd"
  >
    <GitForkIcon />
    <strong>{{ branchName }}</strong>
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { GitForkIcon } from '../shared/icons/app-icons';
import {
  snapshotAgentHandoffRect,
  type AgentHandoffOrigin,
  type AgentHandoffRect,
} from './agent-handoff';

interface AgentHandoffFlightExposed {
  origin: () => AgentHandoffOrigin | null;
}

const props = withDefaults(defineProps<{
  branchName: string;
  concealed?: boolean;
  source?: AgentHandoffOrigin | null;
  target?: AgentHandoffRect | null;
}>(), {
  concealed: false,
  source: null,
  target: null,
});

const emit = defineEmits<{
  arrived: [];
}>();

const labelElement = ref<HTMLElement | null>(null);
const positionStyle = computed(() => {
  if (!props.source) return undefined;
  const { frame } = props.source;
  const left = props.target
    ? props.target.left - props.source.contentOffsetLeft
    : frame.left;
  const top = props.target
    ? props.target.top
      + ((props.target.height - props.source.contentHeight) / 2)
      - props.source.contentOffsetTop
    : frame.top;
  return {
    transform: `translate3d(${left}px, ${top}px, 0)`,
  };
});

function origin(): AgentHandoffOrigin | null {
  const element = labelElement.value;
  const content = element?.querySelector<HTMLElement>('strong');
  if (!element || !content) return null;
  const frame = snapshotAgentHandoffRect(element.getBoundingClientRect());
  const contentRect = content.getBoundingClientRect();
  return {
    contentHeight: contentRect.height,
    contentOffsetLeft: contentRect.left - frame.left,
    contentOffsetTop: contentRect.top - frame.top,
    frame,
  };
}

function onTransitionEnd(event: TransitionEvent): void {
  if (props.target && event.propertyName === 'transform') emit('arrived');
}

defineExpose<AgentHandoffFlightExposed>({ origin });
</script>

<style scoped>
.agent-handoff-flight {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 22px;
  box-sizing: border-box;
  padding: 1px var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: var(--color-surface-base);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-regular);
  line-height: var(--line-height-18);
  white-space: nowrap;
}

.agent-handoff-flight strong {
  font-weight: inherit;
}

.agent-handoff-flight svg {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  color: var(--color-warning);
}

.agent-handoff-flight--fixed {
  position: fixed;
  z-index: 2390;
  top: 0;
  left: 0;
  pointer-events: none;
  will-change: transform;
}

.agent-handoff-flight--travelling {
  transition: transform 1.5s cubic-bezier(0.2, 0.75, 0.1, 1);
}

.agent-handoff-flight--concealed {
  visibility: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .agent-handoff-flight--travelling {
    transition-duration: 1ms;
  }
}
</style>
