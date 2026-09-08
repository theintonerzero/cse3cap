import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const entry = (file: string) => fileURLToPath(new URL(file, import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Three pages: the app, the CAP-3 component gallery, and CAP-10's
    // throwaway review-queue dev mount (delete that entry once CAP-5's
    // router can mount the screen for real). Without this the production
    // build silently drops the extra .html files and a broken one stops
    // being a build failure.
    rollupOptions: {
      input: {
        main: entry('index.html'),
        gallery: entry('gallery.html'),
        reviewQueueDev: entry('review-queue.html'),
      },
    },
  },
});
