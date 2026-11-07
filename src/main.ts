// Node shims required by mdx-m3-viewer (and similar CJS libs) in the browser
const g = globalThis as any;
if (!g.process) {
  g.process = { env: { NODE_ENV: 'development' }, browser: true };
}

import {bootstrapApplication} from '@angular/platform-browser';
import {App} from './app/app';
import {appConfig} from './app/app.config';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
