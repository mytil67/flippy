import { defineConfig } from 'vite';
import flights from './api/vols.js';
import details from './api/trajet.js';
import trace from './api/trace.js';
import follow from './api/suivi.js';
import collection from './api/collection.js';
import account from './api/account.js';
import aircraftPhoto from './api/aircraft-photo.js';

function attachApi(server) {
  server.middlewares.use('/api/vols', flights);
  server.middlewares.use('/api/trajet', details);
  server.middlewares.use('/api/trace', trace);
  server.middlewares.use('/api/suivi', follow);
  server.middlewares.use('/api/collection', collection);
  server.middlewares.use('/api/account', account);
  server.middlewares.use('/api/aircraft-photo', aircraftPhoto);
}

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  plugins: [{
    name: 'flippy-local-api',
    configureServer: attachApi,
    configurePreviewServer: attachApi
  }]
});
