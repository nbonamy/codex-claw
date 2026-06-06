export const messages = {
  en: {
    chat: {
      tool: {
        fallback: {
          completed: 'Ran {name}',
          running: 'Running {name}',
        },
        command: {
          edit: {
            completed: 'Edited {target}',
            failed: 'Failed editing {target}',
            running: 'Editing {target}',
          },
          explore: {
            completed: 'Explored',
            failed: 'Failed exploring',
            running: 'Exploring',
          },
          list: {
            completed: 'Listed {target}',
            failed: 'Failed listing {target}',
            running: 'Listing {target}',
          },
          read: {
            completed: 'Read {target}',
            failed: 'Failed reading {target}',
            running: 'Reading {target}',
          },
          run: {
            completed: 'Ran {target}',
            failed: 'Failed running {target}',
            running: 'Running {target}',
          },
          search: {
            completed: 'Searched {target}',
            failed: 'Failed searching {target}',
            running: 'Searching {target}',
          },
        },
      },
    },
  },
} as const;

export type MessageSchema = typeof messages.en;
