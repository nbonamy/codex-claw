import { app, protocol } from 'electron';
import { product } from '@workspace/core/product';
import started from 'electron-squirrel-startup';
import { startMainApp } from './app-controller';
import { registerLocalMediaScheme } from './local-media';

app.setName(product.name);
registerLocalMediaScheme(protocol);

if (started) {
  app.quit();
} else {
  startMainApp();
}
