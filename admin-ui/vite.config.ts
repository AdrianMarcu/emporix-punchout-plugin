import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: '../src/admin-ui-dist', emptyOutDir: true },
  base: '/admin-ui/',
});
