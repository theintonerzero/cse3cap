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
 * below stays reachable by typing its URL, except the framework screens and
 * the review queue, which routes.tsx explains. That is deliberate: a client-side role check is
 * not a security boundary and must never be mistaken for one.
 * See docs/Frontend-and-Backend.md, "Roles never cross".
 *
 * The theme toggle here came from App.tsx, which said to move it into the
 * real shell when this ticket landed. This is that. Since CAP-38 R4 it and
 * Switch user live in the ⋮ menu, and the name is plain text.
 *
 * CAP-38 R3: the bar names the section (sections.ts) and its back arrow
 * goes up one fixed level. On a top screen there is no level above inside
 * the diary, so back asks before leaving for the switch-user screen, which
 * stands in for the host app here. The nav pills show only when there are
 * two or more destinations: one pill is just the page you are on. A
 * reviewer's bar has none; Frameworks is reached from the review queue
 * (round 3 D2).
 */
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import {
  BottomSheet,
  Button,
  ErrorNotice,
  Menu,
  Skeleton,
  SkeletonGroup,
} from '../components/index.ts';
import { getStoredTheme, setTheme, type Theme } from '../theme.ts';
import { TokenGate } from '../session/TokenGate.tsx';
import { AlumableWelcome } from '../demo/AlumableWelcome.tsx';
import { demoMode } from '../demo/demoMode.ts';
import { useSession } from '../session/useSession.ts';
import styles from './AppShell.module.css';
import { diary_href } from './diary-return.ts';
import { nav_items_for } from './nav.ts';
import { section_for } from './sections.ts';

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
  const location = useLocation();
  // Same rules as routes.tsx's SupervisorOnly and ReviewerOnly, so the bar
  // never names a screen the router is about to replace with NotFound.
  const supervises = me?.participations.some((p) => p.role === 'supervisor') ?? false;
  const reviews =
    me?.participations.some((p) =>
      ['assessor', 'supervisor', 'employer'].includes(p.role),
    ) ?? false;
  const section = section_for(location.pathname, supervises, reviews);

  function toggle_theme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  }

  const navigate = useNavigate();
  // Whose URL is on screen (round 3 B1). The first person in a tab keeps the
  // address they arrived at, so a shared link still opens where it points
  // (ADR #27). A different person after them starts on their own default
  // screen, the way a first sign-in on "/" does: Home routes each person.
  // The shell stays mounted behind the token screen, so this outlives Leave
  // and a 401, and the same person signing back in is not a change of user.
  const [url_owner, setUrlOwner] = useState<string | null>(null);
  const at_home = location.pathname === '/' && location.search === '';
  // Taken during render rather than in an effect, so a first sign-in costs no
  // extra render. A new person takes over only once "/" has arrived: the
  // router applies a navigation in a transition, after urgent state, so
  // taking over sooner would draw the old address for them for one render.
  if (me && url_owner !== me.id && (url_owner === null || at_home)) {
    setUrlOwner(me.id);
  }
  const handing_over = me !== null && url_owner !== null && url_owner !== me.id;

  useEffect(() => {
    if (handing_over && !at_home) navigate('/', { replace: true });
  }, [handing_over, at_home, navigate]);

  if (state === 'no_token') {
    // CAP-51: in the demo shell, the no-token entry is the demo profile picker
    // rather than the raw token gate (ADR #60). The product path is unchanged.
    return demoMode() ? <AlumableWelcome /> : <TokenGate mode="screen" />;
  }

  // The skeleton stays up through a hand-over, so the previous person's
  // page never mounts for the next one, not even for a frame.
  if (state === 'loading' || handing_over) {
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
  // No pills in the reviewer's bar (round 3 D2): a supervisor reaches
  // Frameworks from the review queue, and its back arrow returns there.
  // Everything else about the nav is as it was.
  const show_nav = items.length >= 2 && items.some((item) => item.to === '/');
  // On the diary itself its own URL is the newest scope; storage is only
  // written after the diary renders, so it lags one filter behind there.
  const diary_to = location.pathname === '/' ? `/${location.search}` : diary_href(me.id);
  const role_summary = [...new Set(me.participations.map((p) => p.role))].join(', ');
  // CAP-51 follow-up: in the demo shell, a reviewer who opened a gig from My
  // Gigs has no diary home to go back to ("/" would send them on to the queue
  // under a "Back to Reflection Diary" label), so the gig goes back to My Gigs.
  const parent =
    demoMode() && section.parent?.to === '/' && !items.some((item) => item.to === '/')
      ? { to: '/home', title: 'My Gigs' }
      : section.parent;

  return (
    <div className={styles.shell} data-section={section.tint ?? undefined}>
      <header className={styles.header}>
        <div className={show_nav ? styles.bar : `${styles.bar} ${styles.single_row}`}>
          <div className={styles.back_slot}>
            {parent ? (
              <Link
                to={parent.to === '/' ? diary_href(me.id) : parent.to}
                className={styles.back}
                aria-label={`Back to ${parent.title}`}
              >
                <BackIcon />
              </Link>
            ) : demoMode() ? (
              // CAP-51: in the demo shell the diary is a section of Alumable,
              // so leaving a top screen (the diary home, the review queue)
              // goes back to My Gigs rather than out to the profile picker.
              // ADR #60.
              <Link to="/home" className={styles.back} aria-label="Back to My Gigs">
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
            <div className={styles.who}>
              <span className={styles.name}>{me.display_name}</span>
              <span className={styles.roles}>{role_summary || 'no gigs'}</span>
            </div>
            <Menu
              label="More options"
              items={[
                {
                  kind: 'item',
                  // CAP-51: in the demo shell the header says "Switch profile",
                  // so the menu says it too: one button, one name (Patrick,
                  // 8 Oct). It goes to the profile picker, whose cards name
                  // each person. The slot sheet cannot: Jane and Noor share
                  // the student slot.
                  label: demoMode() ? 'Switch profile' : 'Switch user',
                  on_select: demoMode()
                    ? () => {
                        leave();
                        navigate('/welcome');
                      }
                    : () => setSwitcherOpen(true),
                },
                {
                  kind: 'checkbox',
                  label: 'Dark mode',
                  checked: theme === 'dark',
                  on_select: toggle_theme,
                },
              ]}
            />
          </div>

          {show_nav && (
            <nav className={styles.nav} aria-label="Main">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to === '/' ? diary_to : item.to}
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
