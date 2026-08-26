#!/usr/bin/env node
/**
 * ./run check step (CAP-1). Computes WCAG AA contrast ratios for the
 * text-on-background pairs tokens.css defines, in both themes, and
 * fails if any pair is below its threshold.
 *
 * Parses tokens.css directly rather than loading it in a browser: the
 * three blocks (:root, the dark media query, [data-theme="dark"]) are
 * plain --name: value; declarations, which a small regex handles
 * without a real CSS parser dependency.
 *
 * Usage: node scripts/check-contrast.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = path.join(__dirname, '..', 'web', 'src', 'tokens.css');

// The pairs this product actually renders. Add a row here whenever a
// screen puts one token's text on another token's background; the four
// states rule means every screen does this early, so this list grows
// with the build rather than being written once.
const PAIRS = [
  ['--color-text', '--color-bg', 'normal'],
  ['--color-text', '--color-surface', 'normal'],
  ['--color-text', '--color-accent-peach', 'normal'],
  ['--color-text', '--color-accent-mint', 'normal'],
  ['--color-text', '--color-accent-cream', 'normal'],
  ['--color-text', '--color-accent-coral', 'normal'],
  ['--color-text', '--color-accent-pink', 'normal'],
  ['--color-text', '--color-accent-lavender', 'normal'],
  ['--color-text-muted', '--color-bg', 'normal'],
  ['--color-text-muted', '--color-surface', 'normal'],
  ['--color-text-inverse', '--color-primary', 'normal'],
  // CAP-3 Badge: every status is a tinted fill with a --color-text label.
  ['--color-text', '--color-surface-alt', 'normal'],
  ['--color-text', '--color-danger-bg', 'normal'],
  ['--color-text', '--color-success-bg', 'normal'],
  ['--color-danger', '--color-bg', 'normal'],
  ['--color-danger', '--color-surface', 'normal'],
  ['--color-success', '--color-bg', 'normal'],
  ['--color-success', '--color-surface', 'normal'],
  ['--color-primary', '--color-bg', 'large'],
];

const THRESHOLD = { normal: 4.5, large: 3.0 };

function extractBlock(css, selectorPattern) {
  const match = selectorPattern.exec(css);
  if (!match) return {};
  const body = match[1];
  const vars = {};
  for (const decl of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    vars[`--${decl[1]}`] = decl[2].trim();
  }
  return vars;
}

function parseTokens(css) {
  const light = extractBlock(css, /:root\s*{([^}]*)}/s);
  const darkMedia = extractBlock(
    css,
    /@media\s*\(prefers-color-scheme:\s*dark\)\s*{\s*:root:not\(\[data-theme=['"]light['"]\]\)\s*{([^}]*)}/s,
  );
  const darkAttr = extractBlock(css, /:root\[data-theme=['"]dark['"]\]\s*{([^}]*)}/s);
  return {
    light,
    dark: { ...light, ...darkMedia, ...darkAttr },
  };
}

function hexToRgb(hex) {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  if (h.length === 8) {
    h = h.slice(0, 6); // ignore alpha; contrast against a translucent
    // colour depends on what's beneath it, which this script cannot know
  }
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function channelLuminance(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance({ r, g, b }) {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexToRgb(hexA));
  const lB = relativeLuminance(hexToRgb(hexB));
  const [lighter, darker] = lA > lB ? [lA, lB] : [lB, lA];
  return (lighter + 0.05) / (darker + 0.05);
}

function main() {
  const css = readFileSync(TOKENS_PATH, 'utf8');
  const { light, dark } = parseTokens(css);

  let fail = false;

  for (const [themeName, vars] of [
    ['light', light],
    ['dark', dark],
  ]) {
    for (const [fg, bg, size] of PAIRS) {
      if (!(fg in vars) || !(bg in vars)) {
        console.error(`${themeName}: ${fg} on ${bg} -- token missing`);
        fail = true;
        continue;
      }
      const ratio = contrastRatio(vars[fg], vars[bg]);
      const threshold = THRESHOLD[size];
      const ok = ratio >= threshold;
      const label = `${themeName}: ${fg} on ${bg} (${size}) -- ${ratio.toFixed(2)}:1, needs ${threshold}:1`;
      if (!ok) {
        console.error(`FAIL  ${label}`);
        fail = true;
      } else {
        console.log(`ok    ${label}`);
      }
    }
  }

  if (fail) {
    console.error('\nWCAG AA contrast check failed. Adjust the token values in web/src/tokens.css.');
    process.exit(1);
  }
  console.log('\nEvery pair meets WCAG AA in both themes.');
}

main();
