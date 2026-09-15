/**
 * Every screen in docs/Stack-and-Build-Scope.md 4.3 has a route here, each
 * rendering a placeholder until its own ticket lands. Two are no longer
 * placeholders: the diary home (CAP-7) and the gig detail screen (CAP-8).
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

import { DiaryHome } from '../screens/DiaryHome.tsx';
import { GigDetail } from '../screens/GigDetail.tsx';
import { AppShell } from './AppShell.tsx';
import { ReviewQueue } from '../screens/ReviewQueue.tsx';
import { Placeholder } from './Placeholder.tsx';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DiaryHome />} />

        <Route path="gigs/:gig_id" element={<GigDetail />} />

        <Route
          path="entries/:entry_id"
          element={<Placeholder screen="Entry stepper" ticket="CAP-11" />}
        />

        {/*
         * The diary home links here rather than to entries/:entry_id:
         * GET /reflections carries no entry ids, so a row could not
         * address an entry without a request per row, and CAP-11's
         * stepper is one reflection with N competency steps anyway
         * ("Competency 3 of 6"). CAP-11 owns both routes and is free to
         * keep one, the other, or both.
         */}
        <Route
          path="reflections/:reflection_id"
          element={<Placeholder screen="Entry stepper" ticket="CAP-11" />}
        />

        <Route
          path="reflections/:reflection_id/submitted"
          element={<Placeholder screen="Submitted" ticket="CAP-12" />}
        />

        <Route path="review-queue" element={<ReviewQueue />} />

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
