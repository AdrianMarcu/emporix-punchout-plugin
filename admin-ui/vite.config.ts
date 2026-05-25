import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';
import type { Plugin } from 'vite';

function federationWindowShim(scopeName: string): Plugin {
  return {
    name: 'federation-window-shim',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (fileName.includes('remoteEntry') && chunk.type === 'chunk') {
          // remoteEntry.js lands in assets/. With base:'./' the federation plugin
          // generates import paths like './assets/chunk.js', but since remoteEntry.js
          // is already inside assets/, that resolves to assets/assets/chunk.js → 404.
          // Strip the extra 'assets/' so the path is './chunk.js' (same directory).
          chunk.code = chunk.code.replace(/__federation_import\((['"])\.\/assets\//g, '__federation_import($1./');
          // Instrument the exported get/init so we can see if Emporix calls them
          // via dynamic import() rather than via the window['extension'] wrapper.
          chunk.code = chunk.code.replace(
            /const get =\(module\) => \{/,
            "const get =(module) => { console.log('[ext] get() called with:', JSON.stringify(module));"
          );
          chunk.code = chunk.code.replace(
            /const init =\(shareScope\) => \{/,
            "const init =(shareScope) => { console.log('[ext] init() called, keys:', shareScope ? Object.keys(shareScope).join(',') : 'none');"
          );
          chunk.code += `
if (typeof window !== 'undefined') {
  const _get = get;
  const _init = init;
  window[${JSON.stringify(scopeName)}] = {
    get: (module) => {
      console.log('[extension.get] called with:', JSON.stringify(module));
      try {
        const result = _get(module);
        result instanceof Promise
          ? result.then(() => console.log('[extension.get] resolved ok')).catch(e => console.error('[extension.get] rejected:', e))
          : null;
        return result;
      } catch(e) { console.error('[extension.get] threw:', e); throw e; }
    },
    init: (scope) => {
      console.log('[extension.init] called, scope keys:', scope ? Object.keys(scope).join(',') : 'none');
      return _init(scope);
    },
  };
  console.log('[extension] container registered on window');
}
`;
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'extension',
      filename: 'remoteEntry.js',
      exposes: {
        './RemoteComponent': './src/RemoteComponent',
      },
      shared: ['react', 'react-dom'],
    }),
    federationWindowShim('extension'),
  ],
  build: {
    outDir: '../src/admin-ui-dist',
    emptyOutDir: true,
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
  // Use relative base so federation chunk imports resolve against remoteEntry.js's
  // own URL (Railway) rather than the host page's origin (admin.emporix.io).
  base: './',
  server: {
    cors: { origin: 'https://admin.emporix.io', credentials: true },
  },
  preview: {
    cors: { origin: 'https://admin.emporix.io', credentials: true },
  },
});
