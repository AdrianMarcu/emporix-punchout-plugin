import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';
import type { Plugin } from 'vite';

function federationFixes(scopeName: string): Plugin {
  return {
    name: 'federation-fixes',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (fileName.includes('remoteEntry') && chunk.type === 'chunk') {
          // 1. remoteEntry.js lands in assets/. With base:'./' the federation plugin
          //    generates './assets/chunk.js', but resolving that from within assets/
          //    gives assets/assets/chunk.js → 404. Strip the extra 'assets/' prefix.
          chunk.code = chunk.code.replace(
            /__federation_import\((['"])\.\/assets\//g,
            '__federation_import($1./'
          );

          // 2. Vite federation's .then() returns () => module.default when all
          //    exports are "meta" keys. Emporix's webpack lazy() does factory().default
          //    to get the component, so it gets undefined. Always return the full
          //    module object so factory().default = RemoteComponent.
          chunk.code = chunk.code.replace(
            /Object\.keys\(module\)\.every\(item => exportSet\.has\(item\)\) \? \(\) => module\.default : \(\) => module/g,
            '() => module'
          );

          // 3. Emporix may also load the container via window[scopeName]. Set it as
          //    a side-effect so both access patterns work.
          chunk.code += `\nif (typeof window !== 'undefined') window[${JSON.stringify(scopeName)}] = { get, init };\n`;
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
      // No shared modules: keep React self-contained.
      // Sharing with Emporix's webpack host caused two React instances —
      // Emporix's React rendered the component while our hooks called our
      // bundled React's dispatcher (null) → useState crash.
      // The RemoteComponent itself handles the isolation via createRoot.
      shared: {},
    }),
    federationFixes('extension'),
  ],
  build: {
    outDir: '../src/admin-ui-dist',
    emptyOutDir: true,
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
  // Relative base so federation chunk imports resolve against remoteEntry.js's
  // own URL (Railway) rather than the host page's origin (admin.emporix.io).
  base: './',
  server: {
    cors: { origin: 'https://admin.emporix.io', credentials: true },
  },
  preview: {
    cors: { origin: 'https://admin.emporix.io', credentials: true },
  },
});
