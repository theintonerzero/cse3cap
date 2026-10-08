/**
 * Every screen in docs/Stack-and-Build-Scope.md 4.3 has a route here, and
 * every one is built. An unknown address renders NotFound.
 *
 * Nested per ADR #27 so gig-then-sprint-then-entry stays linkable and
 * back-button-correct: an assessor working a queue moves in and out of
 * entries constantly and shares "look at this one" with a supervisor.
 * Data loaders are deliberately NOT used (ADR #27) -- fetching lives in the
 * typed API client and each screen owns its own.
 *
 * Two of the ten screens are not here. The history sheet (CAP-14) and the
 * export sheet (CAP-18) are described in 4.3 as sheets, and BottomSheet
 * exists for exactly that: they open over the diary rather than navigating
 * away from it. If either decides it wants a linkable URL, it is one line in
 * this file.
 *
 * Every route is reachable by URL regardless of what the nav shows. That is
 * on purpose. Hiding a nav item is a convenience; the 403 is the rule.
 *
 * There are two exceptions, both only for display. The framework screens
 * are the supervisor's (ADR #17, ADR #48): every action on them, copying a
 * rubric and assigning one, is refused by the server for anyone else. So
 * someone who supervises no gig gets NotFound there instead of a screen
 * made of buttons that 403. The review queue is the reviewers' (ADR #55):
 * someone who reviews nothing gets NotFound there rather than an empty
 * queue whose only way out is Leave. The server still decides; these decide
 * only what is drawn.
 */
import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';

import { AlumableChrome } from '../demo/AlumableChrome.tsx';
import { AlumableHome } from '../demo/AlumableHome.tsx';
import { AlumableWelcome } from '../demo/AlumableWelcome.tsx';
import { demoMode } from '../demo/demoMode.ts';
import { DiaryHome } from '../screens/DiaryHome.tsx';
import { EditFramework } from '../screens/EditFramework.tsx';
import { EntryStepper } from '../screens/EntryStepper.tsx';
import { GigDetail } from '../screens/GigDetail.tsx';
import { AppShell } from './AppShell.tsx';
import { ReviewQueue } from '../screens/ReviewQueue.tsx';
import { SelectFramework } from '../screens/SelectFramework.tsx';
import { Submitted } from '../screens/Submitted.tsx';
import { useSession } from '../session/useSession.ts';
import { NotFound } from './NotFound.tsx';

/**
 * Where "/" lands. The diary is the student's own record, so someone who
 * is not a student on any gig but reviews on one (an assessor, supervisor
 * or employer) is sent to their review queue rather than an empty diary.
 * Anyone who is a student anywhere keeps the diary. Only the landing page
 * changes: the diary stays reachable by URL, and the server still decides
 * what anyone may see.
 */
function Home() {
  const { me } = useSession();
  const roles = new Set(me?.participations.map((participation) => participation.role));
  if (!roles.has('student') && roles.size > 0) {
    return <Navigate to="/review-queue" replace />;
  }
  return <DiaryHome />;
}

/**
 * The framework screens, for someone who supervises at least one gig, which
 * is the same test the nav uses for its Frameworks link. Anyone else gets
 * NotFound, and the screen never mounts, so its requests are never sent.
 */
function SupervisorOnly({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const supervises = me?.participations.some(
    (participation) => participation.role === 'supervisor',
  );
  return supervises ? children : <NotFound />;
}

/**
 * The review queue and its scoring screen, for someone who assesses,
 * supervises or employs on at least one gig: the nav's Review queue test.
 * Anyone else gets NotFound, the failsafe for a typed or stale address
 * (ADR #55). Switching user never lands here; the shell sends each
 * person to their own start.
 */
function ReviewerOnly({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const reviews = me?.participations.some((participation) =>
    ['assessor', 'supervisor', 'employer'].includes(participation.role),
  );
  return reviews ? children : <NotFound />;
}

export function AppRoutes() {
  return (
    <Routes>
      {/*
       * CAP-51: the Alumable demo surround, top-level so it carries its own
       * Alumable chrome rather than the diary's AppShell. Registered only in
       * demo mode; in production these paths fall through to NotFound, so the
       * product has no extra routes. ADR #60.
       */}
      {demoMode() && <Route path="welcome" element={<AlumableWelcome />} />}
      {demoMode() && (
        <Route
          path="home"
          element={
            <AlumableChrome>
              <AlumableHome />
            </AlumableChrome>
          }
        />
      )}

      <Route element={<AppShell />}>
        {/*
         * "/" is the diary home in the demo shell too (CAP-51 follow-up). It
         * used to redirect to /home, which left the diary home and its radar
         * unreachable in the demo. Now My Gigs opens it from its Reflection
         * Diary card, and its back-arrow returns to My Gigs (AppShell).
         */}
        <Route index element={<Home />} />

        <Route path="gigs/:gig_id" element={<GigDetail />} />

        {/*
         * By reflection, not by entry: GET /reflections carries no entry
         * ids, so a row could not address an entry without a request per
         * row, and the stepper is one reflection with N competency steps
         * anyway ("Competency 3 of 6"). The entries/:entry_id placeholder
         * that once sat beside this was retired once CAP-11 chose this one.
         */}
        <Route path="reflections/:reflection_id" element={<EntryStepper />} />

        <Route path="reflections/:reflection_id/submitted" element={<Submitted />} />

        <Route
          path="review-queue"
          element={
            <ReviewerOnly>
              <ReviewQueue />
            </ReviewerOnly>
          }
        />

        {/*
         * CAP-13: the entry stepper in its second mode. By reflection, not
         * by entry, for the same reason as reflections/:reflection_id above:
         * GET /review-queue carries reflection_id and nothing finer.
         */}
        <Route
          path="review-queue/reflections/:reflection_id"
          element={
            <ReviewerOnly>
              <EntryStepper mode="assessor" />
            </ReviewerOnly>
          }
        />

        <Route
          path="frameworks"
          element={
            <SupervisorOnly>
              <SelectFramework />
            </SupervisorOnly>
          }
        />

        <Route
          path="frameworks/:framework_id/edit"
          element={
            <SupervisorOnly>
              <EditFramework />
            </SupervisorOnly>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
