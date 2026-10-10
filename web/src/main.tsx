import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import '@fontsource-variable/inter';
import './index.css';
import { initRevealFocusedField } from './reveal-focused-field.ts';
import { initTheme } from './theme.ts';

initTheme();
initRevealFocusedField();

const root = document.getElementById('root');

if (!root) {
  throw new Error('index.html is missing #root');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
