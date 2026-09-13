/**
 * Every screen in docs/Stack-and-Build-Scope.md 4.3 has a route here, each
 * rendering a placeholder until its own ticket lands (criterion 1).
 *
 * Nested per ADR #27 so gig-then-sprint-then-entry stays linkable and
 * back-button-correct: an assessor working a queue moves in and out of
 * entries constantly and shares "look at this one" with a supervisor.
 * Data loaders are deliberately NOT used (ADR #27) -- fetching lives in the
 * typed API client and each screen owns its own.
 *
 * Two of the twelve screens are not here. The history sheet (CAP-14) and the
 * export sheet (CAP-18) are described in 4.3 as sheets, and BottomSheet
 * exists for exactly that: they open over the diary rather than navigating
 * away from it. If either decides it wants a linkable URL, it is one line in
 * this file.
 *
 * Every route is reachable by URL regardless of what the nav shows. That is
 * on purpose. Hiding a nav item is a convenience; the 403 is the rule.
 */
import { Route, Routes } from 'react-router';

import { AppShell } from './AppShell.tsx';
import { Placeholder } from './Placeholder.tsx';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Placeholder screen="Diary" ticket="CAP-7" />} />

        <Route
          path="gigs/:gig_id"
          element={<Placeholder screen="Gig detail" ticket="CAP-8" />}
        />

        <Route
          path="entries/:entry_id"
          element={<Placeholder screen="Entry stepper" ticket="CAP-11" />}
        />

        <Route
          path="reflections/:reflection_id/submitted"
          element={<Placeholder screen="Submitted" ticket="CAP-12" />}
        />

        {/*
         * CAP-10 is BUILT. web/src/screens/ReviewQueue.tsx takes no props,
         * fetches through the typed client and never touches the token, so
         * mounting it for real is exactly this:
         *
         *   import { ReviewQueue } from '../screens/ReviewQueue.tsx';
         *   <Route path="review-queue" element={<ReviewQueue />} />
         *
         * That swap, plus deleting web/review-queue.html and
         * web/src/review-queue-dev.tsx and dropping the reviewQueueDev entry
         * from web/vite.config.ts, is the whole of CAP-10's follow-up. It is
         * deliberately left undone here: CAP-5 is CAP-5, and those files are
         * Tony's to remove.
         */}
        <Route
          path="review-queue"
          element={<Placeholder screen="Review queue" ticket="CAP-10 follow-up" />}
        />

        <Route
          path="review-queue/entries/:entry_id"
          element={<Placeholder screen="Assessor stepper" ticket="CAP-13" />}
        />

        <Route
          path="frameworks"
          element={<Placeholder screen="Select framework" ticket="CAP-15" />}
        />

        <Route
          path="frameworks/:framework_id/edit"
          element={<Placeholder screen="Edit framework" ticket="CAP-16" />}
        />

        <Route path="*" element={<Placeholder screen="Not found" ticket="No ticket" />} />
      </Route>
    </Routes>
  );
}
