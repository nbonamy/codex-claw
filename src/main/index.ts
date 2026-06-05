import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { createAgentFromInput, createInitialSnapshot } from './snapshot-service';
import { ipcChannels } from '../shared/ipc';
import type { CreateAgentInput } from '../shared/contracts';

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
const snapshot = createInitialSnapshot();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    title: 'Codex Claw',
    show: false,
    backgroundColor: '#061c2a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

ipcMain.handle(ipcChannels.getSnapshot, () => snapshot);

ipcMain.handle(ipcChannels.createAgent, (_event, input: CreateAgentInput) => {
  const agent = createAgentFromInput(input);
  snapshot.agents.push(agent);
  snapshot.activeAgentId = agent.id;
  return agent;
});

ipcMain.handle(ipcChannels.sendPrompt, (_event, agentId: string, prompt: string) => {
  snapshot.messages.push({
    id: `message-${snapshot.messages.length + 1}`,
    agentId,
    role: 'user',
    status: 'complete',
    createdAt: new Date().toISOString(),
    parts: [{ type: 'text', text: prompt }],
  });
});

void app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
