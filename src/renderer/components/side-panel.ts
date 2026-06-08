export type SidePanelState = {
  kind: 'markdown';
  title: string;
  subtitle?: string;
  content: string;
  state: 'idle' | 'loading' | 'error';
  error?: string | null;
};
