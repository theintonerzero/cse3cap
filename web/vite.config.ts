import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const entry = (file: string) => fileURLToPath(new URL(file, import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Two pages: the app, and the CAP-3 component gallery. Without this the
    // production build silently drops gallery.html and a broken component
    // stops being a build failure.
    rollupOptions: {
      input: {
        main: entry('index.html'),
        gallery: entry('gallery.html'),
      },
    },
  },
});
