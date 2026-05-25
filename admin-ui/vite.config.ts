import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';
import type { Plugin } from 'vite';

/**
 * Emporix dashboard uses webpack module federation which expects the remote to set
 * window['punchout'] = { get, init } as a side effect when the script loads.
 * Vite plugin federation outputs an ES module with `export { get, init }` but
 * never sets the window global. This plugin appends the assignment after the build.
 */
function federationWindowShim(scopeName: string): Plugin {
  return {
    name: 'federation-window-shim',
    apply: 'build',
    generateBundle(_, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (fileName.includes('remoteEntry') && chunk.type === 'chunk') {
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
