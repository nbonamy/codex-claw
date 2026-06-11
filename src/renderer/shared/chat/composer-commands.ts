import type { BackendCommandSummary } from '../../../shared/contracts';
import { filterComposerSearchItems } from './composer-search';

export type ActiveCommandSlash = {
  end: number;
  query: string;
  start: number;
};

export function findActiveCommandSlash(value: string, caretPosition: number): ActiveCommandSlash | null {
  const safeCaret = Math.max(0, Math.min(caretPosition, value.length));
  const beforeCaret = value.slice(0, safeCaret);
  const start = beforeCaret.lastIndexOf('/');
  if (start < 0) {
    return null;
  }

  const previous = start > 0 ? beforeCaret[start - 1] : '';
  if (previous && /[\w.%+-]/.test(previous)) {
    return null;
  }

  const query = beforeCaret.slice(start + 1);
  if (/[\s/$]/.test(query)) {
    return null;
  }

  return {
    end: safeCaret,
    query,
    start,
  };
}

export function filterComposerCommands(commands: BackendCommandSummary[], query: string, maxResults = -1): BackendCommandSummary[] {
  return filterComposerSearchItems(commands, query, [
    { values: (command) => [command.id] },
    { values: (command) => [command.name, command.displayName, command.slashName] },
    { values: (command) => [command.description] },
  ], maxResults);
}

export function commandDisplayName(command: BackendCommandSummary): string {
  return command.displayName || command.name;
}

export function commandDescription(command: BackendCommandSummary): string {
  return command.description || '';
}
