/**
 * CAP-51: every piece of text the Alumable shell draws meets WCAG AA, in the
 * light theme and the dark one.
 *
 * scripts/check-contrast.mjs checks token pairs in tokens.css's :root and
 * dark blocks. It cannot see the shell: the [data-brand='alumable'] block
 * overrides tokens on an element, not on :root, and the shell draws the
 * diary's own components (Card, ProgressBar) whose colours flip with the
 * theme while the brand's do not. So this measures what the browser actually
 * renders: each element's computed text colour against the first opaque
 * background behind it. 4.5:1 for normal text, 3:1 for large; disabled
 * controls are exempt (WCAG 1.4.3).
 *
 * Self-contained ids prefixed '5156' so they collide with no other spec's.
 */
import { test, expect, type Page } from '@playwright/test';

import type { components } from '../../src/api/schema.ts';
import { FakeApi, type GigDetail } from '../fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `5156${n}-0000-4515-8515-515151515151`;

function gig(
  n: string,
  title: string,
  role: GigDetail['my_role'],
  assessed: number,
): GigDetail {
  return {
    id: id(n),
    title,
    org_name: 'Alumable',
    starts_on: '2026-08-03',
    ends_on: '2026-10-26',
    my_role: role,
    sprints: [
      { id: id(`${n}9`), ordinal: 1, opens_on: '2026-08-03', due_on: '2026-08-16' },
    ],
    framework: { id: id('0002'), fw_key: 'e2e-demo', name: 'E2E rubric', version: 'v1' },
    reflection_summary: { draft: 0, submitted: assessed ? 1 : 0, assessed },
    participants: [],
  };
}

// A student on one gig and a supervisor on another, plus a brand-new gig, so
// one page shows every piece of text the home can draw: role pills, the
// progress label, "No reflections yet" and the reviewer shortcuts.
const GIGS = [
  gig('0003', 'Develop AI use cases', 'student', 2),
  gig('0004', 'Data migration audit', 'supervisor', 1),
  gig('0005', 'New gig', 'student', 0),
];
const ME: Me = {
  id: id('0001'),
  display_name: 'Jane N',
  participations: GIGS.map((g) => ({ gig_id: g.id, gig_title: g.title, role: g.my_role })),
};

interface Failure {
  text: string;
  ratio: number;
  needs: number;
  fg: string;
  bg: string;
}

/** Every text-bearing element under [data-brand] that fails AA. */
async function failures(page: Page): Promise<Failure[]> {
  return page.evaluate(() => {
    const rgba = (s: string) => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = '1'] = m[1].split(/[,\s/]+/).filter(Boolean);
      return { r: +r, g: +g, b: +b, a: +a };
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const c = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const background = (el: Element) => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const bg = rgba(getComputedStyle(node).backgroundColor);
        if (bg && bg.a > 0) return bg;
      }
      return (
        rgba(getComputedStyle(document.body).backgroundColor) ?? {
          r: 255,
          g: 255,
          b: 255,
          a: 1,
        }
      );
    };

    const out: Failure[] = [];
    for (const root of document.querySelectorAll('[data-brand]')) {
      for (const el of root.querySelectorAll<HTMLElement>('*')) {
        const own = [...el.childNodes].some(
          (n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== '',
        );
        if (!own || el.closest(':disabled, [aria-disabled="true"], [aria-hidden="true"]'))
          continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        const style = getComputedStyle(el);
        const fg = rgba(style.color)!;
        const bg = background(el);
        const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
        const ratio = (hi + 0.05) / (lo + 0.05);
        const size = parseFloat(style.fontSize);
        const bold = parseInt(style.fontWeight, 10) >= 700;
        const needs = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
        if (ratio < needs) {
          out.push({
            text: el.textContent!.trim().slice(0, 40),
            ratio: Math.round(ratio * 100) / 100,
            needs,
            fg: style.color,
            bg: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
          });
        }
      }
    }
    return out;
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test('My Gigs text meets AA', async ({ page }) => {
      await new FakeApi([], ME, GIGS).install(page);
      await page.goto('/home');
      await expect(page.getByRole('link', { name: /New gig/ })).toBeVisible();

      expect(await failures(page)).toEqual([]);
    });

    test('the Alumable sign-in text meets AA', async ({ page }) => {
      await new FakeApi([], ME, GIGS).install(page);
      await page.addInitScript(() => sessionStorage.clear());
      await page.goto('/welcome');
      await expect(
        page.getByRole('heading', { name: 'Sign in with Alumable' }),
      ).toBeVisible();

      expect(await failures(page)).toEqual([]);
    });
  });
}
