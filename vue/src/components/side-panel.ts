import type { AgentGitDiffSection } from '@workspace/core/contracts';

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

export type SidePanelImageState = SidePanelBaseState & {
  kind: 'image';
  alt: string;
  mimeType?: string;
  path?: string;
  src: string;
};

export type SidePanelGitDiffState = SidePanelBaseState & {
  kind: 'gitDiff';
  target?: import('@workspace/core/contracts').AgentGitDiffTarget;
  summary?: import('@workspace/core/contracts').AgentGitDiffSummary;
  diff: string;
  sections?: AgentGitDiffSection[];
};

export type PlanReviewComment = {
  id: string;
  quote: string;
  body: string;
};
