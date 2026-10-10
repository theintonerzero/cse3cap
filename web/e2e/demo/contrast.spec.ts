/**
 * CAP-51: the demo picker wears the diary's own look (ADR #61).
 *
 * Patrick, 8 Oct: keep the picker, drop the orange. It uses the diary's
 * tokens and the section-tint gradient the diary home uses, so it follows the
 * theme like every other screen, and its text meets WCAG AA in both themes:
 * each element's computed colour against the first opaque background behind
 * it, 4.5:1 for normal text and 3:1 for large.
 */
import { test, expect, type Page } from '@playwright/test';

import { shell } from './people.ts';

async function failures(page: Page) {
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
    const background = (el: Element | null) => {
      for (let node = el; node; node = node.parentElement) {
        const c = rgba(getComputedStyle(node).backgroundColor);
        if (c && c.a === 1) return c;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const out: { text: string; ratio: number }[] = [];
    for (const el of document.querySelectorAll('main *, header *')) {
      const own = [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim(),
      );
      if (!own) continue;
      const style = getComputedStyle(el);
      const fg = rgba(style.color);
      if (!fg) continue;
      const bg = background(el);
      const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      const ratio = (hi + 0.05) / (lo + 0.05);
      const size = parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      const needs = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      if (ratio < needs) out.push({ text: el.textContent!.trim().slice(0, 40), ratio });
    }
    return out;
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test('the picker text meets AA', async ({ page }) => {
      await shell(page);
      await page.goto('/');
      await expect(
        page.getByRole('heading', { name: 'Reflection Diary demo' }),
      ).toBeVisible();
      expect(await failures(page)).toEqual([]);
    });
  });
}

test('the picker uses the diary gradient, not the Alumable brand palette', async ({
  page,
}) => {
  await shell(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Reflection Diary demo' })).toBeVisible();

  await expect(page.locator('[data-brand]')).toHaveCount(0);
  const image = await page
    .getByRole('heading', { name: 'Reflection Diary demo' })
    .evaluate((el) => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const value = getComputedStyle(node).backgroundImage;
        if (value && value !== 'none') return value;
      }
      return 'none';
    });
  expect(image).toContain('linear-gradient');
});

test('the picker is dark under a dark system theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await shell(page);
  await page.goto('/');
  const heading = page.getByRole('heading', { name: 'Reflection Diary demo' });
  await expect(heading).toBeVisible();
  // Light text means a dark page behind it.
  const color = await heading.evaluate((el) => getComputedStyle(el).color);
  const [r, g, b] = color.match(/\d+/g)!.map(Number);
  expect(r + g + b).toBeGreaterThan(600);
});
