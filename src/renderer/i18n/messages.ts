export const messages = {
  en: {
    chat: {
      contextUsage: {
        ariaLabel: 'Context usage',
        title: 'Context window:',
        usedAndLeft: '{used}% used ({left}% left)',
        tokensUsed: '{used} / {window} tokens used',
      },
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
        mcp: {
          codexClaw: {
            broadcastMessage: {
              completed: 'Broadcast message',
              failed: 'Failed broadcasting message',
              running: 'Broadcasting message',
            },
            checkMessages: {
              completed: 'Checked messages',
              failed: 'Failed checking messages',
              running: 'Checking messages',
            },
            listAgents: {
              completed: 'Listed agents',
              failed: 'Failed listing agents',
              running: 'Listing agents',
            },
            registerAgent: {
              completed: 'Registered agent',
              failed: 'Failed registering agent',
              running: 'Registering agent',
            },
            sendMessage: {
              completed: 'Sent message to {target}',
              failed: 'Failed sending message to {target}',
              running: 'Sending message to {target}',
            },
            setStatus: {
              cleared: 'Cleared status',
              completed: 'Updated status',
              failed: 'Failed updating status',
              running: 'Updating status',
            },
          },
        },
      },
    },
  },
} as const;

export type MessageSchema = typeof messages.en;
