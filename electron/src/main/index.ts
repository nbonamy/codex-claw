import { app } from 'electron';
import started from 'electron-squirrel-startup';
import { startMainApp } from './app-controller';
import { fixPath } from './utils';

if (started) {
  app.quit();
} else {
  fixPath().then(() => {
    startMainApp();
  });
}
