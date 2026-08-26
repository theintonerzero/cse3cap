/**
 * Entry point for the component gallery, mirroring main.tsx.
 *
 * A second Vite entry rather than a route: there is no router until CAP-5,
 * and a second .html file cannot collide with the app shell when it lands.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import Gallery from './gallery/Gallery.tsx';
import './index.css';
import { initTheme } from './theme.ts';

initTheme();

const root = document.getElementById('root');

if (!root) {
  throw new Error('gallery.html is missing #root');
}

createRoot(root).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);
