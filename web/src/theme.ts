/**
 * Theme persistence and application.
 *
 * The choice lives in localStorage so it survives a reload. Nothing here
 * decides the *default* theme: that is CSS, via
 * `@media (prefers-color-scheme: dark)` in tokens.css. This module only
 * handles the case where someone has explicitly overridden it.
 */

const STORAGE_KEY = 'reflection-diary-theme';

export type Theme = 'light' | 'dark';

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark';
}

/** The explicitly stored choice, or null if none was made (or storage is unavailable). */
export function getStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

/** Applies a theme to the document root, or clears it to follow the system default. */
export function applyTheme(theme: Theme | null): void {
  const root = document.documentElement;
  if (theme) {
    root.setAttribute('data-theme', theme);
  } else {
    root.removeAttribute('data-theme');
  }
}

/** Stores and applies an explicit choice. */
export function setTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage blocked (private browsing, quota). The theme still applies
    // for this page load; it just will not survive a reload.
  }
}

/** Call once, before the first render, so there is no flash of the wrong theme. */
export function initTheme(): void {
  applyTheme(getStoredTheme());
}
