/**
 * The demo shell's four people, for the `demo` project's specs (CAP-51).
 *
 * The persona cards sign in with the placeholder tokens playwright.config.ts
 * gives the demo server (demo-jane, demo-noor, demo-sam, demo-lee). FakeApi
 * answers /auth/me with one person whatever the token says, so `shell()`
 * routes /auth/me by the bearer token instead, after FakeApi installs: a
 * later page.route wins. That is what lets a spec pick Noor after Jane and
 * see Noor. Everything else is FakeApi's.
 *
 * Starts signed out: FakeApi.install seeds a supervisor token, and the shell
 * is about the moment before anyone has signed in.
 */
import type { Page } from '@playwright/test';

import type { components } from '../../src/api/schema.ts';
import { FakeApi, type GigDetail } from '../fake-api.ts';

type Me = components['schemas']['Me'];
type Role = GigDetail['my_role'];

const id = (n: string) => `5160${n}-0000-4516-8516-516051605160`;

export const GIG_ID = id('0003');

export const GIG: GigDetail = {
  id: GIG_ID,
  title: 'Develop AI use cases',
  org_name: 'La Trobe University',
  starts_on: '2026-08-03',
  ends_on: '2026-10-26',
  my_role: 'student',
  sprints: [{ id: id('0004'), ordinal: 1, opens_on: '2026-08-03', due_on: '2026-08-16' }],
  framework: { id: id('0002'), fw_key: 'e2e-demo', name: 'E2E rubric', version: 'v1' },
  reflection_summary: { draft: 0, submitted: 0, assessed: 0 },
  participants: [],
};

function person(n: string, display_name: string, role: Role): Me {
  return {
    id: id(n),
    display_name,
    participations: [{ gig_id: GIG_ID, gig_title: GIG.title, role }],
  };
}

export const PEOPLE: Record<string, Me> = {
  'demo-jane': person('0011', 'Jane N', 'student'),
  'demo-noor': person('0012', 'Noor A', 'student'),
  'demo-sam': person('0013', 'Sam O', 'assessor'),
  'demo-lee': person('0014', 'Dr Lee', 'supervisor'),
};

/**
 * Moves within the app, without a reload. A page load re-runs FakeApi's init
 * script, which re-seeds its supervisor token and so signs the picked person
 * out again; react-router follows pushState plus popstate as its own link.
 */
export async function go(page: Page, path: string): Promise<void> {
  await page.evaluate((to) => {
    history.pushState({}, '', to);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

/** Signed out, with FakeApi behind it and /auth/me answering per token. */
export async function shell(page: Page): Promise<FakeApi> {
  const api = new FakeApi([], PEOPLE['demo-jane'], [GIG]);
  await api.install(page);
  await page.addInitScript(() => sessionStorage.clear());
  await page.route('**/api/v1/auth/me', (route) => {
    const token = (route.request().headers()['authorization'] ?? '').replace(
      /^Bearer /,
      '',
    );
    const me = PEOPLE[token];
    return me
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(me),
        })
      : route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'UNAUTHENTICATED', message: 'Bad token.', details: {} },
          }),
        });
  });
  // The diary home asks for the radar; nobody here has scores yet, which the
  // API answers with a 404 (the diary's empty radar).
  await page.route('**/api/v1/me/radar**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'NOT_FOUND', message: 'No scores yet.', details: {} },
      }),
    }),
  );
  return api;
}
