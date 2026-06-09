export const messages = {
  en: {
    chat: {
      actions: {
        cancel: 'Cancel',
        copied: 'Copied',
        copy: 'Copy',
        delete: 'Delete',
        edit: 'Edit',
        editPrompt: 'Edit prompt',
        label: 'Message actions',
        quote: 'Quote',
        resubmit: 'Resubmit',
        retry: 'Retry',
      },
      compaction: {
        completed: 'Context compacted',
        running: 'Compacting context',
      },
      contextUsage: {
        ariaLabel: 'Context usage',
        title: 'Context window:',
        usedAndLeft: '{used}% used ({left}% left)',
        tokensUsed: '{used} / {window} tokens used',
      },
      commands: {
        title: 'Commands',
      },
      skills: {
        empty: 'No matching skills',
        title: 'Skills',
      },
      files: {
        empty: 'No matching files',
        hint: 'Start typing to search files in this agent folder.',
        title: 'Files',
      },
      planReview: {
        cancel: 'Cancel',
        comment: 'Comment',
        confirm: 'Confirm',
        commentHelp: 'Select text in the plan to add an inline comment.',
        commentLabel: 'Plan comment',
        commentPlaceholder: 'What should change?',
        deleteComment: 'Delete comment',
        editComment: 'Edit comment',
        commentSave: 'Save comment',
        commentCancel: 'Cancel',
        commentsCount: '{count} comment | {count} comments',
        updating: 'Updating plan...',
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
          create: {
            completed: 'Created {target}',
            failed: 'Failed creating {target}',
            running: 'Creating {target}',
          },
          delete: {
            completed: 'Deleted {target}',
            failed: 'Failed deleting {target}',
            running: 'Deleting {target}',
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
          plan: {
            update: {
              completed: 'Updated plan',
              failed: 'Failed updating plan',
              running: 'Updating plan',
            },
            write: {
              completed: 'Wrote plan',
              failed: 'Failed writing plan',
              running: 'Writing plan',
            },
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
            displayMarkdown: {
              completed: 'Displayed {target}',
              failed: 'Failed displaying {target}',
              running: 'Displaying {target}',
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
