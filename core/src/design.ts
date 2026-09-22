import type { BackendConversationRef } from './contracts';

export const designDiagramKinds = ['mermaid', 'svg', 'image'] as const;

export const designSuggestionLimits = {
  title: 80,
  description: 120,
} as const;

export type DesignDiagramKind = typeof designDiagramKinds[number];

export type DesignSuggestion = {
  id: string;
  title: string;
  description: string;
  diagramId?: string;
};

export type DesignTextDiagramContent = {
  kind: 'mermaid' | 'svg';
  source: string;
};

export type DesignImageDiagramContent = {
  kind: 'image';
  assetPath: string;
  mimeType: 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp';
  alt: string;
};

export type DesignDiagramContent = DesignTextDiagramContent | DesignImageDiagramContent;

export type DesignDiagram = {
  id: string;
  title: string;
  content: DesignDiagramContent;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type DesignSession = {
  id: string;
  conversationRef: BackendConversationRef | null;
  suggestions: DesignSuggestion[];
  diagrams: DesignDiagram[];
  selectedDiagramId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StartDesignInput = {
  prompt?: string;
};

export type GenerateDesignSuggestionInput = {
  suggestionId: string;
};

export type SelectDesignDiagramInput = {
  diagramId: string;
};

export type DesignDiagramAsset = {
  diagramId: string;
  mimeType: DesignImageDiagramContent['mimeType'];
  dataUrl: string;
};

export function isDesignSession(value: unknown): value is DesignSession {
  if (!record(value)) return false;
  return typeof value.id === 'string'
    && (value.conversationRef === null || isConversationRef(value.conversationRef))
    && Array.isArray(value.suggestions)
    && value.suggestions.length <= 4
    && value.suggestions.every(isDesignSuggestion)
    && Array.isArray(value.diagrams)
    && value.diagrams.length <= 50
    && value.diagrams.every(isDesignDiagram)
    && (value.selectedDiagramId === null || typeof value.selectedDiagramId === 'string')
    && (value.selectedDiagramId === null || value.diagrams.some(diagram => diagram.id === value.selectedDiagramId))
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string';
}

export function cloneDesignSession(session: DesignSession): DesignSession {
  return {
    ...session,
    conversationRef: session.conversationRef ? { ...session.conversationRef } : null,
    suggestions: session.suggestions.map(suggestion => ({ ...suggestion })),
    diagrams: session.diagrams.map(diagram => ({
      ...diagram,
      content: { ...diagram.content },
    })),
  };
}

function isDesignSuggestion(value: unknown): value is DesignSuggestion {
  return record(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.description === 'string'
    && (value.diagramId === undefined || typeof value.diagramId === 'string');
}

function isDesignDiagram(value: unknown): value is DesignDiagram {
  return record(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && isDesignDiagramContent(value.content)
    && Number.isInteger(value.revision)
    && (value.revision as number) > 0
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string';
}

function isDesignDiagramContent(value: unknown): value is DesignDiagramContent {
  if (!record(value)) return false;
  if (value.kind === 'mermaid' || value.kind === 'svg') {
    return typeof value.source === 'string';
  }
  return value.kind === 'image'
    && typeof value.assetPath === 'string'
    && ['image/gif', 'image/jpeg', 'image/png', 'image/webp'].includes(value.mimeType as string)
    && typeof value.alt === 'string';
}

function isConversationRef(value: unknown): value is BackendConversationRef {
  if (!record(value)) return false;
  return (value.backend === 'codex' && typeof value.threadId === 'string')
    || (value.backend === 'claude' && typeof value.folder === 'string' && typeof value.sessionId === 'string');
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
