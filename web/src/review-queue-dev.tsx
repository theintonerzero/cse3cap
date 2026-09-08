/**
 * Throwaway dev-only mount for CAP-10, mirroring `gallery.tsx`'s reason
 * for existing: there is no router or token context until CAP-5, and a
 * second .html file cannot collide with the app shell when it lands.
 *
 * Unlike the gallery, this one is NOT meant to stay: delete this file,
 * `review-queue.html`, and its `vite.config.ts` entry once CAP-5's real
 * shell can mount `<ReviewQueue />` for real. Nothing in the product
 * links here.
 *
 * Open at http://localhost:5173/review-queue.html. `VITE_API_TOKEN` in
 * `web/.env` seeds the token; the field below lets it be swapped for a
 * different seeded user (Sam, Jane, ...) without restarting the server.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { getAuthToken, setAuthToken } from './api/client.ts';
import './index.css';
import { ReviewQueue } from './screens/ReviewQueue.tsx';
import { initTheme } from './theme.ts';

initTheme();

export function Dev() {
  const [token, setToken] = useState(getAuthToken() ?? '');
  const [mountKey, setMountKey] = useState(0);

  function applyToken(event: React.FormEvent) {
    event.preventDefault();
    setAuthToken(token || null);
    setMountKey((key) => key + 1); // remounts ReviewQueue so it refetches
  }

  return (
    <div style={{ padding: '1rem' }}>
      <form onSubmit={applyToken} style={{ marginBottom: '1rem' }}>
        <label>
          Bearer token (dev only):{' '}
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            size={40}
            placeholder="paste a seeded user's token"
          />
        </label>
        <button type="submit">Use token</button>
      </form>
      <ReviewQueue key={mountKey} />
    </div>
  );
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('review-queue.html is missing #root');
}

createRoot(root).render(
  <StrictMode>
    <Dev />
  </StrictMode>,
);
