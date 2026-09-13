/**
 * The frame every screen mounts into.
 *
 * Header, navigation, and an <Outlet/> the router fills. The shell has the
 * same four states every screen in this project ships, because GET /auth/me
 * can be any of them:
 *
 *   no_token  TokenGate full screen. Also where a 401 lands
 *   loading   skeletons shaped like the header, not a spinner
 *   error     ErrorNotice with a retry
 *   ready     the app
 *
 * Navigation is derived from participations and nothing else (criterion 3).
 * The same person can be a student on one gig and an assessor on another, so
 * role is per gig and never global. Hiding a nav item is a convenience for
 * the person using it; the 403 from the API is the rule, and every route
 * below stays reachable by typing its URL. That is deliberate: a client-side
 * role check is not a security boundary and must never be mistaken for one.
 * See docs/Frontend-and-Backend.md, "Roles never cross".
 *
 * The theme toggle here came from App.tsx, which said to move it into the
 * real shell when this ticket landed. This is that.
 */
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';

import {
  BottomSheet,
  Button,
  ErrorNotice,
  Skeleton,
  SkeletonGroup,
} from '../components/index.ts';
import { getStoredTheme, setTheme, type Theme } from '../theme.ts';
import { TokenGate } from '../session/TokenGate.tsx';
import { useSession, type SessionUser } from '../session/useSession.ts';
import styles from './AppShell.module.css';

interface NavItem {
  to: string;
  label: string;
}

/**
 * What this user can see, from what the server said they are. ADR #17 maps
 * the educator to the supervisor role, which is why frameworks sit there.
 */
function nav_items_for(me: SessionUser): NavItem[] {
  const roles = new Set(me.participations.map((participation) => participation.role));

  const items: NavItem[] = [];

  if (roles.has('student')) {
    items.push({ to: '/', label: 'Diary' });
  }

  if (roles.has('assessor') || roles.has('supervisor') || roles.has('employer')) {
    items.push({ to: '/review-queue', label: 'Review queue' });
  }

  if (roles.has('supervisor')) {
    items.push({ to: '/frameworks', label: 'Frameworks' });
  }

  return items;
}

function initial_theme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function AppShell() {
  const { state, me, error, retry, sign_out } = useSession();
  const [theme, setThemeState] = useState<Theme>(initial_theme);
  const [switcher_open, setSwitcherOpen] = useState(false);

  function toggle_theme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  }

  if (state === 'no_token') {
    return <TokenGate mode="screen" />;
  }

  if (state === 'loading') {
    return (
      <div className={styles.shell}>
        <header className={styles.header}>
          <SkeletonGroup label="Signing you in">
            <div className={styles.header_skeleton}>
              <Skeleton variant="text" width="40%" />
              <Skeleton variant="text" width="70%" />
            </div>
          </SkeletonGroup>
        </header>
      </div>
    );
  }

  if (state === 'error' && error) {
    return (
      <main className={styles.centred}>
        <ErrorNotice error={error} on_retry={retry} />
        <Button variant="secondary" full_width={false} on_click={sign_out}>
          Use a different token
        </Button>
      </main>
    );
  }

  if (!me) return null;

  const items = nav_items_for(me);
  const role_summary = [...new Set(me.participations.map((p) => p.role))].join(', ');

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <button
            type="button"
            className={styles.who}
            onClick={() => setSwitcherOpen(true)}
            aria-haspopup="dialog"
          >
            <span className={styles.name}>{me.display_name}</span>
            <span className={styles.roles}>{role_summary || 'no gigs'}</span>
          </button>

          <button
            type="button"
            className={styles.theme}
            onClick={toggle_theme}
            aria-pressed={theme === 'dark'}
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>

        <nav className={styles.nav} aria-label="Main">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                isActive ? `${styles.link} ${styles.active}` : styles.link
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>

      <BottomSheet
        open={switcher_open}
        title="Switch user"
        onClose={() => setSwitcherOpen(false)}
      >
        <TokenGate mode="sheet" on_done={() => setSwitcherOpen(false)} />
      </BottomSheet>
    </div>
  );
}
