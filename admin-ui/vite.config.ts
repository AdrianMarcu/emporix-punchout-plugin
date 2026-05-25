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
