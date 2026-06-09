export type SidePanelState = {
  kind: 'markdown';
  purpose?: 'plan';
  title: string;
  subtitle?: string;
  content: string;
  state: 'idle' | 'loading' | 'error';
  error?: string | null;
};

export type PlanReviewComment = {
  id: string;
  quote: string;
  body: string;
};
