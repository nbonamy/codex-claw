import { computed, shallowRef } from 'vue';

export type ReorderDropPosition = 'before' | 'after';

export type ReorderDropTarget<TId extends string> = {
  id: TId;
  position: ReorderDropPosition;
};

export type ReorderDrop<TId extends string> = {
  draggedId: TId;
  beforeId: TId | null;
};

export type ListReorderDragOptions<TId extends string> = {
  itemIds: () => readonly TId[];
  onDrop: (drop: ReorderDrop<TId>) => void;
};

export function useListReorderDrag<TId extends string>(options: ListReorderDragOptions<TId>) {
  const draggedId = shallowRef<TId | null>(null);
  const dropTarget = shallowRef<ReorderDropTarget<TId> | null>(null);

  const isDragging = computed(() => draggedId.value !== null);

  function dragItemAttributes(id: TId): Record<string, string | boolean> {
    return {
      draggable: canReorder(),
      'data-reorder-id': id,
    };
  }

  function dropTargetClass(id: TId): Record<string, boolean> {
    return {
      'list-reorder-drag--dragging': draggedId.value === id,
      'list-reorder-drag--drop-before': dropTarget.value?.id === id && dropTarget.value.position === 'before',
      'list-reorder-drag--drop-after': dropTarget.value?.id === id && dropTarget.value.position === 'after',
    };
  }

  function onDragStart(id: TId, event: DragEvent): void {
    if (!canReorder()) {
      event.preventDefault();
      return;
    }

    draggedId.value = id;
    dropTarget.value = null;

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
    }
  }

  function onDragOver(id: TId, event: DragEvent): void {
    if (!draggedId.value || draggedId.value === id) {
      dropTarget.value = null;
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    dropTarget.value = {
      id,
      position: dropPositionForEvent(event),
    };
  }

  function onDragLeave(id: TId, event: DragEvent): void {
    if (dropTarget.value?.id !== id || event.currentTarget !== event.target) {
      return;
    }

    dropTarget.value = null;
  }

  function onDrop(id: TId, event: DragEvent): void {
    event.preventDefault();
    const sourceId = draggedId.value;
    if (!sourceId || sourceId === id) {
      reset();
      return;
    }

    const target = dropTarget.value?.id === id
      ? dropTarget.value
      : { id, position: dropPositionForEvent(event) };
    options.onDrop({
      draggedId: sourceId,
      beforeId: beforeIdFromDrop(sourceId, target),
    });
    reset();
  }

  function onDragEnd(): void {
    reset();
  }

  function reset(): void {
    draggedId.value = null;
    dropTarget.value = null;
  }

  function canReorder(): boolean {
    return options.itemIds().length > 1;
  }

  function beforeIdFromDrop(sourceId: TId, target: ReorderDropTarget<TId>): TId | null {
    const ids = options.itemIds().filter((candidate) => candidate !== sourceId);
    if (target.position === 'before') {
      return target.id;
    }

    const targetIndex = ids.indexOf(target.id);
    return ids[targetIndex + 1] ?? null;
  }

  return {
    dragItemAttributes,
    dropTarget,
    dropTargetClass,
    isDragging,
    onDragEnd,
    onDragLeave,
    onDragOver,
    onDragStart,
    onDrop,
  };
}

function dropPositionForEvent(event: DragEvent): ReorderDropPosition {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return 'after';
  }

  const rect = target.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}
