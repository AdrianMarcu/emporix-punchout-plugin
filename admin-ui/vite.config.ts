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
          // Fix: strip the extra assets/ so federation imports resolve correctly
          chunk.code = chunk.code.replace(/__federation_import\((['"])\.\/assets\//g, '__federation_import($1./');
          // Webpack module federation host expects factory() to return the MODULE OBJECT
          // {default: Component}, not just the component function. Vite federation's
          // generated .then() returns module.default when all keys are in exportSet,
          // but webpack's lazy() wrapper then does factory().default = undefined.
          // Always return the full module so factory().default = RemoteComponent.
          chunk.code = chunk.code.replace(
            /Object\.keys\(module\)\.every\(item => exportSet\.has\(item\)\) \? \(\) => module\.default : \(\) => module/g,
            '() => module'
          );
          // Instrument init
          chunk.code = chunk.code.replace(
            'const init =(shareScope) => {',
            "const init =(shareScope) => { console.log('[ext] init() called, keys:', shareScope ? Object.keys(shareScope).join(',') : 'none');"
          );
          // Instrument get: log call + whether the returned promise resolves or rejects
          chunk.code = chunk.code.replace(
            'return moduleMap[module]();',
            `console.log('[ext] get() called with:', JSON.stringify(module));
        const _p = moduleMap[module]();
        _p.then(f => { try { console.log('[ext] get() resolved, factory()=>', typeof f()); } catch(e) { console.error('[ext] factory() threw:', e); } }).catch(e => console.error('[ext] get() REJECTED:', e));
        return _p;`
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
      // No shared modules: use a single self-contained bundled React.
      // Sharing React with Emporix's host causes two React instances — the expose
      // file gets host React via importShared, but App.tsx uses the bundled copy,
      // which React detects as mismatched instances and refuses to render hooks.
      shared: {},
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
