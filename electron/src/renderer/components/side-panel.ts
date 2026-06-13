export type SidePanelBaseState = {
  title: string;
  subtitle?: string;
  state: 'idle' | 'loading' | 'error';
  error?: string | null;
};

export type SidePanelMarkdownState = SidePanelBaseState & {
  kind: 'markdown';
  purpose?: 'plan';
  content: string;
};

export type SidePanelSourceState = SidePanelBaseState & {
  kind: 'source';
  content: string;
  language?: string | null;
};

export type SidePanelGitDiffState = SidePanelBaseState & {
  kind: 'gitDiff';
  diff: string;
};

export type SidePanelState = SidePanelMarkdownState | SidePanelSourceState | SidePanelGitDiffState;

export type PlanReviewComment = {
  id: string;
  quote: string;
  body: string;
};
