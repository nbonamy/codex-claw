const messages = {
  en: {
    'menu.app': 'Codex Claw',
    'menu.browser': 'Browser',
    'menu.checkForUpdates': 'Check for Updates...',
    'menu.checkingForUpdates': 'Checking for Updates...',
    'menu.closeAgent': 'Close Agent',
    'menu.closeTeam': 'Close Team',
    'menu.compressSession': 'Compress Session',
    'menu.duplicateAgent': 'Duplicate Agent',
    'menu.editAgent': 'Edit Agent',
    'menu.file': 'File',
    'menu.goToAgent': 'Go to Agent...',
    'menu.help': 'Help',
    'menu.installUpdate': 'Install Update and Relaunch',
    'menu.newTeam': 'New Team',
    'menu.nextAgent': 'Next Agent',
    'menu.nextTeam': 'Next Team',
    'menu.previousAgent': 'Previous Agent',
    'menu.quit': 'Quit',
    'menu.quitApp': 'Quit Codex Claw',
    'menu.restartAgent': 'Restart Agent',
    'menu.review': 'Review',
    'menu.settings': 'Settings...',
    'menu.view': 'View',
    'menu.whatsNew': 'What’s New',
    'menu.window': 'Window',
    'dialog.agentFolder': 'Select agent folder',
    'dialog.codexExecutable': 'Select Codex executable',
    'dialog.sourceFolder': 'Select source folder',
    'dialog.sourceFolderMessage': 'Select your source folder containing git repositories',
    'dialog.worktreeFolder': 'Choose worktree folder',
    'dialog.worktreeFolderMessage': 'Choose location for the worktree',
    'update.install': 'Install and Relaunch',
    'update.later': 'Later',
    'update.downloadedVersion': 'Codex Claw {version} has been downloaded. Install and relaunch now?',
    'update.downloaded': 'A Codex Claw update has been downloaded. Install and relaunch now?',
    'update.ready': 'Update ready to install',
    'update.ok': 'OK',
    'update.unavailable': 'Update checks are not available',
    'update.checkFailed': 'Unable to check for updates',
    'update.latestDetail': 'You are using the latest version of Codex Claw.',
    'update.latest': 'Codex Claw is up to date',
    'daemon.continueOld': 'Continue with old backend',
    'daemon.restartNow': 'Restart backend now',
    'daemon.restartRequired': 'Codex Claw updated. The background backend must restart to use the latest version. Active agents or automations are running.',
  },
} as const;

export type MainMessageKey = keyof typeof messages.en;

export function mainT(key: MainMessageKey, params?: Record<string, string | number>): string {
  const template: string = messages.en[key];
  if (!params) return template;
  return template.replace(/\{([^}]+)\}/gu, (_match, name: string) => String(params[name] ?? `{${name}}`));
}
