/**
 * The demo sign-in (CAP-51, ADR #61).
 *
 * Demo-only, behind demoMode(). AppShell renders it in place of the token
 * gate when nobody is signed in. With personas supplied through
 * VITE_DEMO_TOKENS on a laptop, or from the live demo's /demo/personas.json
 * (CAP-54), it offers a card per named person that signs in on one click;
 * with none it falls back to the seeded-token paste (TokenGate) under the same
 * heading. It says plainly that it is a demo: the people are seeded, not an
 * Alumable account.
 *
 * It never navigates. Signing in leaves the app where the product's own gate
 * would: AppShell keeps the address for a first sign-in and sends a different
 * person to "/" (its hand-over), and "/" routes by role. It never decides a
 * role or checks a token either: that is the session's and the server's job.
 *
 * It wears the diary's own look (Patrick, 8 Oct): the section tint fading into
 * the page, as the diary home and review queue have, and the diary's tokens,
 * so it follows the theme like every other screen. Only the logo is Alumable's.
 */
import { useEffect, useState } from 'react';

import { Skeleton, SkeletonGroup } from '../components/index.ts';
import { TokenGate } from '../session/TokenGate.tsx';
import { useSession } from '../session/useSession.ts';
import { type DemoPersona, demoLive, loadDemoPersonas } from './demoMode.ts';
import logo from './assets/alumable-horizontal.png';
import styles from './AlumableWelcome.module.css';

export function AlumableWelcome() {
  const { sign_in_with, last_sign_in_rejected } = useSession();
  // null while the live demo's file loads. On a laptop the list is ready at
  // once, so the skeleton never shows there.
  const [personas, setPersonas] = useState<DemoPersona[] | null>(null);

  useEffect(() => {
    let current = true;
    void loadDemoPersonas().then((loaded) => {
      if (current) setPersonas(loaded);
    });
    return () => {
      current = false;
    };
  }, []);

  if (personas === null) {
    return (
      <div className={styles.screen}>
        <header className={styles.header}>
          <img src={logo} alt="Alumable logo" className={styles.logo} />
        </header>
        <main className={styles.panel} data-testid="personas-loading">
          <SkeletonGroup label="Loading the demo profiles">
            <Skeleton variant="block" height="var(--space-64)" />
            <Skeleton variant="block" height="var(--space-64)" />
            <Skeleton variant="block" height="var(--space-64)" />
          </SkeletonGroup>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <img src={logo} alt="Alumable logo" className={styles.logo} />
      </header>

      {personas.length > 0 ? (
        <main className={styles.panel}>
          <h1 className={styles.heading}>Reflection Diary demo</h1>
          <p className={styles.intro}>
            Pick a profile to continue. These are demo profiles on seeded data, not a real
            Alumable sign-in.
          </p>
          <ul className={styles.personas}>
            {personas.map((persona) => (
              <li key={persona.id}>
                <button
                  type="button"
                  className={styles.persona}
                  onClick={() => sign_in_with(persona.slot, persona.token)}
                >
                  <span className={styles.personaName}>{persona.name}</span>
                  <span className={styles.personaRole}>{persona.role_hint}</span>
                </button>
              </li>
            ))}
          </ul>
          {/* A revoked token or a reseeded database on the day: say so, rather
              than the click quietly returning here (the paste gate says the
              same). The session sets this on a 401 from /auth/me. */}
          {last_sign_in_rejected && (
            <p className={styles.rejected} role="alert">
              {demoLive()
                ? 'That profile could not sign in: the demo may have been reset. Reload the page to get fresh profiles.'
                : 'That profile could not sign in: its token was rejected. Check the tokens in web/.env.development.local.'}
            </p>
          )}
        </main>
      ) : (
        <TokenGate
          mode="screen"
          heading="Reflection Diary demo"
          intro="No profiles are set up on this computer. Paste a seeded token to continue."
        />
      )}
    </div>
  );
}
