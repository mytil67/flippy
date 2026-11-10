import { defineConfig } from 'vite';
import flights from './api/vols.js';
import details from './api/trajet.js';
import trace from './api/trace.js';

function attachApi(server) {
  server.middlewares.use('/api/vols', flights);
  server.middlewares.use('/api/trajet', details);
  server.middlewares.use('/api/trace', trace);
}

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  plugins: [{
    name: 'flippy-local-api',
    configureServer: attachApi,
    configurePreviewServer: attachApi
  }]
});
