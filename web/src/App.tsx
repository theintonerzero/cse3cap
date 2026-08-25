/**
 * Placeholder.
 *
 * The frontend has not been built. This renders one word so that the
 * toolchain, the CI job and the dev server are all proven to work before
 * anybody writes a screen. Replace it; do not build around it.
 *
 * What goes here is specified in docs/Stack-and-Build-Scope.md 4.3, and
 * how this folder relates to api/ is in docs/Frontend-and-Backend.md.
 *
 * The theme toggle below is temporary: CAP-1's acceptance criteria need a
 * visible, working toggle to prove tokens.css and theme.ts work end to
 * end, but there is no app shell yet to put it in. Move it into the real
 * shell when that ticket lands; do not build more around it here.
 */
import { useState } from 'react';
import { getStoredTheme, setTheme, type Theme } from './theme.ts';

function initialTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  }

  return (
    <main>
      <button onClick={toggleTheme} aria-pressed={theme === 'dark'}>
        {theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      </button>
      <p>test</p>
    </main>
  );
}
