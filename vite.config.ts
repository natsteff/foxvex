import { defineConfig } from 'vite';
import packageMetadata from './package.json' with { type: 'json' };

const { version } = packageMetadata;
const versionMetadata = JSON.stringify({ version });

export default defineConfig({
  base: './',
  plugins: [{
    name: 'foxvex-version',
    transformIndexHtml: html => html.replaceAll('__FOXVEX_VERSION__', version),
    configureServer(server) {
      server.middlewares.use('/version.json', (_request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        response.end(versionMetadata);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: versionMetadata });
    },
  }],
});
