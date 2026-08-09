export const messages = {
  en: {
    auth: {
      title: 'Welcome to Codex Claw',
      description: 'Sign in with ChatGPT to get started.',
      continue: 'Continue with ChatGPT',
      waiting: 'Waiting for sign in…',
      cancel: 'Cancel sign-in',
    },
    chat: {
      subagents: {
        label: 'Subagents',
        triggerActive: 'Subagents ({count} active)',
        activeCount: '{count} active',
        totalCount: '{count} total',
        unnamed: 'Subagent',
        detailsLabel: 'Subagent details',
        conversationLabel: 'Subagent conversation',
        loadingConversation: 'Loading conversation…',
        emptyConversation: 'No conversation activity yet',
        loadError: 'Unable to load subagent conversation',
        status: {
          pendingInit: 'Starting',
          running: 'Running',
          interrupted: 'Interrupted',
          completed: 'Completed',
          errored: 'Error',
          shutdown: 'Closed',
          notFound: 'Unavailable',
        },
      },
      attachments: {
        annotate: 'Annotate {name}',
        editAnnotations: 'Edit annotations for {name} ({count})',
      },
      collaboration: {
        messageFrom: 'Message from {name}',
        messagesFrom: 'Messages from {names}',
      },
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
        clear: 'Clear',
        clearCommentsBody: 'All comments on this plan will be removed.',
        clearCommentsConfirm: 'Clear comments',
        clearCommentsTitle: 'Clear all comments?',
        confirm: 'Confirm',
        commentHelp: 'Select text in the plan to add an inline comment.',
        commentAbout: 'about',
        commentLabel: 'Plan comment',
        commentPlaceholder: 'What should change?',
        deleteComment: 'Delete comment',
        editComment: 'Edit comment',
        commentSave: 'Save comment',
        commentCancel: 'Cancel',
        commentsCount: '{count} comment | {count} comments',
        keepComments: 'Keep comments',
        sendComments: 'Send {count} comment | Send {count} comments',
        updating: 'Updating plan...',
      },
      planProgress: {
        close: 'Close task list',
        title: 'Task list',
        status: {
          pending: 'Pending',
          inProgress: 'In progress',
          completed: 'Completed',
        },
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
            completed: 'Explored {target}',
            failed: 'Failed exploring {target}',
            running: 'Exploring {target}',
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
            browserClick: {
              completed: 'Clicked page',
              failed: 'Failed clicking page',
              running: 'Clicking page',
            },
            browserConsoleLogs: {
              completed: 'Read browser console',
              failed: 'Failed reading browser console',
              running: 'Reading browser console',
            },
            browserGetDom: {
              completed: 'Inspected page',
              failed: 'Failed inspecting page',
              running: 'Inspecting page',
            },
            browserOpen: {
              completed: 'Opened {target}',
              failed: 'Failed opening {target}',
              running: 'Opening {target}',
            },
            browserScreenshot: {
              completed: 'Captured page screenshot',
              failed: 'Failed capturing page screenshot',
              running: 'Capturing page screenshot',
            },
            browserScroll: {
              completed: 'Scrolled page',
              failed: 'Failed scrolling page',
              running: 'Scrolling page',
            },
            browserType: {
              completed: 'Entered text on page',
              failed: 'Failed entering text on page',
              running: 'Entering text on page',
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
            computerUseClick: {
              completed: 'Clicked {target}',
              failed: 'Failed clicking {target}',
              running: 'Clicking {target}',
            },
            computerUseFindApps: {
              completed: 'Found {target}',
              failed: 'Failed finding {target}',
              running: 'Finding {target}',
            },
            computerUseFocusApp: {
              completed: 'Focused {target}',
              failed: 'Failed focusing {target}',
              running: 'Focusing {target}',
            },
            computerUseGetAppState: {
              completed: 'Inspected {target}',
              failed: 'Failed inspecting {target}',
              running: 'Inspecting {target}',
            },
            computerUseLaunchApp: {
              completed: 'Launched {target}',
              failed: 'Failed launching {target}',
              running: 'Launching {target}',
            },
            computerUseListApps: {
              completed: 'Listed {target}',
              failed: 'Failed listing {target}',
              running: 'Listing {target}',
            },
            computerUseRequestAccessibility: {
              completed: 'Requested macOS Accessibility access for Computer Use',
              failed: 'Failed requesting macOS Accessibility access for Computer Use',
              running: 'Requesting macOS Accessibility access for Computer Use',
            },
            computerUseRequestScreenRecording: {
              completed: 'Requested macOS Screen Recording access for Computer Use',
              failed: 'Failed requesting macOS Screen Recording access for Computer Use',
              running: 'Requesting macOS Screen Recording access for Computer Use',
            },
            computerUseScroll: {
              completed: 'Scrolled {target}',
              failed: 'Failed scrolling {target}',
              running: 'Scrolling {target}',
            },
            computerUseScreenshot: {
              completed: 'Captured {target}',
              failed: 'Failed capturing {target}',
              running: 'Capturing {target}',
            },
            computerUseSetValue: {
              completed: 'Updated {target}',
              failed: 'Failed updating {target}',
              running: 'Updating {target}',
            },
            computerUseStatus: {
              completed: 'Checked Computer Use permissions and availability',
              failed: 'Failed checking Computer Use permissions and availability',
              running: 'Checking Computer Use permissions and availability',
            },
            computerUseStop: {
              completed: 'Stopped the local Computer Use session',
              failed: 'Failed stopping the local Computer Use session',
              running: 'Stopping the local Computer Use session',
            },
            computerUseTypeText: {
              completed: 'Entered text in {target}',
              failed: 'Failed entering text in {target}',
              running: 'Entering text in {target}',
            },
            createAgent: {
              completed: 'Created agent {target}',
              failed: 'Failed creating agent {target}',
              running: 'Creating agent {target}',
            },
            createWorktree: {
              completed: 'Created worktree {target}',
              failed: 'Failed creating worktree {target}',
              running: 'Creating worktree {target}',
            },
            listAgents: {
              completed: 'Listed agents',
              failed: 'Failed listing agents',
              running: 'Listing agents',
            },
            listRepos: {
              completed: 'Listed repositories',
              failed: 'Failed listing repositories',
              running: 'Listing repositories',
            },
            listWorktrees: {
              completed: 'Listed worktrees for {target}',
              failed: 'Failed listing worktrees for {target}',
              running: 'Listing worktrees for {target}',
            },
            markWorkItemCompleted: {
              completed: 'Marked work item complete',
              failed: 'Failed marking work item complete',
              running: 'Marking work item complete',
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
