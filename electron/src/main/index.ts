import { app } from 'electron';
import started from 'electron-squirrel-startup';
import { startMainApp } from './app-controller';

if (started) {
  app.quit();
} else {
  startMainApp();
}
