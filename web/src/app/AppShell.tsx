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
 *
 * CAP-38 R3: the bar names the section (sections.ts) and its back arrow
 * goes up one fixed level. On a top screen there is no level above inside
 * the diary, so back asks before leaving for the switch-user screen, which
 * stands in for the host app here. The nav pills show only when there are
 * two or more destinations: one pill is just the page you are on.
 */
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';

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
import { section_for } from './sections.ts';

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
  const { state, me, error, retry, sign_out, leave } = useSession();
  const [theme, setThemeState] = useState<Theme>(initial_theme);
  const [switcher_open, setSwitcherOpen] = useState(false);
  const [leave_open, setLeaveOpen] = useState(false);
  const section = section_for(useLocation().pathname);

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
        <div className={styles.bar}>
          <div className={styles.back_slot}>
            {section.parent ? (
              <Link
                to={section.parent.to}
                className={styles.back}
                aria-label={`Back to ${section.parent.title}`}
              >
                <BackIcon />
              </Link>
            ) : (
              <button
                type="button"
                className={styles.back}
                aria-label="Leave the Reflection Diary"
                aria-haspopup="dialog"
                onClick={() => setLeaveOpen(true)}
              >
                <BackIcon />
              </button>
            )}
          </div>

          {/* The section's name. The diary home's only h1; elsewhere plain
              text, because those screens still carry their own h1. */}
          {section.title_is_h1 ? (
            <h1 className={styles.title}>{section.title}</h1>
          ) : (
            <span className={styles.title}>{section.title}</span>
          )}

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

          {items.length >= 2 && (
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
          )}
        </div>
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

      <BottomSheet
        open={leave_open}
        title="Leave the Reflection Diary?"
        onClose={() => setLeaveOpen(false)}
      >
        <p className={styles.leave_body}>This takes you back to the switch user screen.</p>
        <div className={styles.leave_actions}>
          {/* leave, not sign_out: every slot is kept, the one in use too,
              so the token screen lists it and coming back is one tap. The
              sheet closes first: the shell stays mounted behind the token
              screen, and an open flag would reopen it on the next sign-in. */}
          <Button
            on_click={() => {
              setLeaveOpen(false);
              leave();
            }}
          >
            Leave
          </Button>
          <Button variant="secondary" on_click={() => setLeaveOpen(false)}>
            Stay
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

/** A chevron, drawn rather than typed so it centres in its tap target. */
function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1.5rem" height="1.5rem" aria-hidden="true">
      <path
        d="M15 5l-7 7 7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
