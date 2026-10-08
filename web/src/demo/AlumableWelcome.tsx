/**
 * The Alumable demo sign-in (CAP-51, ADR #60).
 *
 * It says plainly that it is a demo (8 Oct): the profiles are seeded people,
 * not an Alumable account, and nothing on screen should suggest otherwise to
 * someone who knows the real Alumable sign-in.
 *
 * Demo-only, behind demoMode(). It dresses the diary's own token entry in the
 * Alumable brand: with personas supplied through VITE_DEMO_TOKENS it offers a
 * card per profile that signs in on one click and goes to the Alumable home;
 * with none it falls back to the existing seeded-token paste (TokenGate),
 * under the same Alumable header, so a fresh checkout still works.
 *
 * It never decides a role and never checks a token itself. Signing in is the
 * session's job (sign_in_with), roles still resolve server-side from
 * gig_participants, and the slot a persona names is a label, exactly as
 * session/tokens.ts says.
 */
import { useNavigate } from 'react-router';

import { TokenGate } from '../session/TokenGate.tsx';
import { useSession } from '../session/useSession.ts';
import { demoPersonas, type DemoPersona } from './demoMode.ts';
import logo from './assets/alumable-horizontal.png';
import styles from './AlumableWelcome.module.css';

export function AlumableWelcome() {
  const { sign_in_with } = useSession();
  const navigate = useNavigate();
  const personas = demoPersonas();

  function choose(persona: DemoPersona) {
    sign_in_with(persona.slot, persona.token);
    navigate('/home');
  }

  return (
    <div data-brand="alumable" className={styles.screen}>
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
                  onClick={() => choose(persona)}
                >
                  <span className={styles.personaName}>{persona.name}</span>
                  <span className={styles.personaRole}>{persona.role_hint}</span>
                </button>
              </li>
            ))}
          </ul>
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
