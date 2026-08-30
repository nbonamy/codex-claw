import { app, protocol } from 'electron';
import started from 'electron-squirrel-startup';
import { startMainApp } from './app-controller';
import { registerLocalMediaScheme } from './local-media';

registerLocalMediaScheme(protocol);

if (started) {
  app.quit();
} else {
  startMainApp();
}
