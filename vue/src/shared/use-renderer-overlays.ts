import { onBeforeUnmount, onMounted, readonly, ref } from 'vue';

// Native browser views sit above renderer DOM regardless of CSS z-index.
// Observe shared overlay surfaces, including teleported Element Plus poppers.
const selector = '[role="menu"]:not(.app-menu--embedded), [role="dialog"], [role="listbox"], [role="tooltip"], .el-popper';
const visible = ref(false);
let consumers = 0;
let observer: MutationObserver | undefined;

function isVisible(element: Element): boolean {
  for (let current: Element | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (current.hasAttribute('hidden') || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  }
  return true;
}

function sync(): void {
  visible.value = Array.from(document.querySelectorAll(selector)).some(isVisible);
}

export function useRendererOverlays() {
  onMounted(() => {
    if (consumers++ === 0) {
      observer = new MutationObserver(sync);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'role'],
      });
      sync();
    }
  });
  onBeforeUnmount(() => {
    if (--consumers === 0) {
      observer?.disconnect();
      observer = undefined;
      visible.value = false;
    }
  });
  return readonly(visible);
}
