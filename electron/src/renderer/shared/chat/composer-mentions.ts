export type ActiveComposerMention = {
  end: number;
  query: string;
  start: number;
  trigger: '@';
};

export function findActiveFileMention(value: string, caretPosition: number): ActiveComposerMention | null {
  const safeCaret = Math.max(0, Math.min(caretPosition, value.length));
  const beforeCaret = value.slice(0, safeCaret);
  const start = beforeCaret.lastIndexOf('@');
  if (start < 0) {
    return null;
  }

  const previous = start > 0 ? beforeCaret[start - 1] : '';
  if (previous && /[\w.%+-]/.test(previous)) {
    return null;
  }

  const query = beforeCaret.slice(start + 1);
  if (/[\s@$/]/.test(query)) {
    return null;
  }

  return {
    end: safeCaret,
    query,
    start,
    trigger: '@',
  };
}
