export type ComposerSearchField<T> = {
  values: (item: T) => Array<string | null | undefined>;
};

type RankedComposerSearchItem<T> = {
  fieldIndex: number;
  item: T;
  order: number;
  score: number;
};

export function filterComposerSearchItems<T>(
  items: T[],
  query: string,
  fields: ComposerSearchField<T>[],
  maxResults = -1,
): T[] {
  const value = query.trim().toLowerCase();
  if (!value) {
    return limitItems(items, maxResults);
  }

  const matches = items
    .map((item, order): RankedComposerSearchItem<T> | null => {
      const match = bestFieldMatch(item, value, fields);
      return match ? { item, order, ...match } : null;
    })
    .filter((entry): entry is RankedComposerSearchItem<T> => Boolean(entry))
    .sort((left, right) => (
      left.fieldIndex - right.fieldIndex ||
      right.score - left.score ||
      left.order - right.order
    ));

  return limitItems(matches.map((entry) => entry.item), maxResults);
}

function bestFieldMatch<T>(
  item: T,
  value: string,
  fields: ComposerSearchField<T>[],
): Pick<RankedComposerSearchItem<T>, 'fieldIndex' | 'score'> | null {
  let bestMatch: Pick<RankedComposerSearchItem<T>, 'fieldIndex' | 'score'> | null = null;

  fields.forEach((field, fieldIndex) => {
    const score = Math.max(0, ...field.values(item).map((fieldValue) => searchScore(value, fieldValue ?? '')));
    if (score <= 0) {
      return;
    }

    if (!bestMatch || fieldIndex < bestMatch.fieldIndex || (fieldIndex === bestMatch.fieldIndex && score > bestMatch.score)) {
      bestMatch = { fieldIndex, score };
    }
  });

  return bestMatch;
}

function searchScore(pattern: string, target: string): number {
  const normalizedTarget = target.toLowerCase();
  if (!normalizedTarget) {
    return 0;
  }

  if (!normalizedTarget.includes(pattern)) {
    return 0;
  }

  if (normalizedTarget === pattern) {
    return 30_000;
  }

  if (normalizedTarget.startsWith(pattern)) {
    return 20_000;
  }

  return 10_000 - normalizedTarget.indexOf(pattern);
}

function limitItems<T>(items: T[], maxResults: number): T[] {
  return maxResults >= 0 ? items.slice(0, maxResults) : items;
}
