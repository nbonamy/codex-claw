/** Client presentation references; document bytes are owned by the backend. */
export type DocumentWorkspaceTab = {
  id: string;
  title: string;
  path?: string;
  documentId?: string;
  /** Set only by a successful backend Save As. */
  savedPath?: string;
};

export type DocumentWorkspace = {
  tabs: DocumentWorkspaceTab[];
  activeTab: string | null;
  open: boolean;
  width: number;
  filesPaneOpen: boolean;
  filesPaneWidth: number;
};
export type DocumentWorkspaces = Record<string, DocumentWorkspace>;

/** Deltas cannot remove a tab delivered concurrently by another request. */
export type DocumentWorkspaceChange = {
  upsert?: DocumentWorkspaceTab[];
  close?: string[];
  activeTab?: string | null;
  open?: boolean;
  width?: number;
  filesPaneOpen?: boolean;
  filesPaneWidth?: number;
};
export type DocumentReadResult = { content: string; error?: string };
export type DocumentSaveInput = { tabId: string; path: string; overwrite?: boolean };

export function emptyDocumentWorkspace(): DocumentWorkspace {
  return { tabs: [], activeTab: null, open: false, width: 420, filesPaneOpen: false, filesPaneWidth: 280 };
}
