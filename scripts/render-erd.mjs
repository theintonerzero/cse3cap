// Renders docs/erd.mmd, with the legend below, to docs/erd.png (CAP-27).
//
//   ./run erd
//
// Run from web/ (./run does that), because Playwright is web/'s dependency and
// nothing here adds a new one. Mermaid itself is loaded from a pinned CDN
// version at render time, so this needs the network. The legend lists what
// crow's foot notation cannot show; it is kept here, next to the renderer,
// so the PNG and the README's copy are written from one place.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = require('@playwright/test');

const root = path.resolve(process.cwd(), '..');
// Mermaid's ER parser rejects %% comment lines here, so the source keeps its
// comments for people and the renderer drops them.
const source = fs
  .readFileSync(path.join(root, 'docs/erd.mmd'), 'utf8')
  .split('\n')
  .filter((line) => !line.trim().startsWith('%%'))
  .join('\n')
  .trim();
const out = path.join(root, 'docs/erd.png');
const MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';

const LEGEND = [
  "A score's level must belong to the entry's competency. Scoring enforces it, because the database cannot (api/app/Services/Scoring.php).",
  'One reflection per student per context: unique on (user_id, gig_key, sprint_key). gig_key and sprint_key are VIRTUAL generated columns that turn a null id into a sentinel UUID (ADR #11, ADR #19), so a duplicate is MySQL 1062, answered as 409 DUPLICATE_REFLECTION.',
  'A reflection needs a gig or a sprint, or both (ck_refl_context). The check reads gig_key and sprint_key, because MySQL refuses a CHECK on a column with ON DELETE SET NULL (ADR #19).',
  'framework_version is copied when the reflection is created, so a later rubric copy never changes what it was scored against.',
  'A framework referenced by any reflection is read-only for good: 409 FRAMEWORK_IN_USE (api/app/Services/FrameworkEditing.php). Editing is copy then edit (ADR #16).',
  'A reflection gets one entry per competency when it is created (api/app/Services/ReflectionCreator.php).',
  'Status only moves draft, then submitted, then assessed. Assessed is set when every entry has a counter-score (Scoring).',
  'A counter-score is final: one per entry, scorer and role (ak_scores), and a repeat is 409 ALREADY_SCORED.',
  'Roles are per gig. Someone with two roles on one gig resolves to one, student first (ADR #47).',
  'RESTRICT on a reflection\'s user and gig, a score\'s scorer and level, and an entry\'s competency: the record belongs to the student and is never deleted from under them (docs/Retention-and-Erasure.md).',
  'Ids are CHAR(36) UUIDs. Times are DATETIME(6) in UTC, never TIMESTAMP.',
];

const escape = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  body { margin: 0; padding: 24px; background: #ffffff; color: #1f2933;
         font: 14px/1.45 system-ui, -apple-system, Segoe UI, sans-serif; width: 1800px; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  h2 { font-size: 16px; margin: 20px 0 8px; }
  ol { margin: 0; padding-left: 22px; columns: 2; column-gap: 40px; }
  li { margin: 0 0 6px; break-inside: avoid; }
  .note { color: #52606d; margin: 4px 0 0; }
</style>
<script src="${MERMAID}"></script></head>
<body>
  <h1>Reflection Diary: entity relationship diagram</h1>
  <pre class="mermaid">${escape(source)}</pre>
  <h2>What the diagram cannot show</h2>
  <ol>${LEGEND.map((line) => `<li>${escape(line)}</li>`).join('')}</ol>
  <p class="note">Rendered from docs/erd.mmd by ./run erd. db/01-schema.sql is the truth: where they disagree, the schema wins.</p>
  <script>
    mermaid.initialize({ startOnLoad: false, theme: 'neutral', er: { useMaxWidth: false } });
    mermaid.run().then(() => { document.body.dataset.ready = 'yes'; },
                       (error) => { document.body.dataset.ready = 'failed'; document.body.dataset.error = (error && (error.message || error.str)) || JSON.stringify(error); });
  </script>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1850, height: 1200 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 30000 });
  const state = await page.evaluate(() => [document.body.dataset.ready, document.body.dataset.error]);
  if (state[0] !== 'yes') throw new Error(`mermaid failed: ${state[1]}`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`wrote ${path.relative(root, out)}`);
} finally {
  await browser.close();
}
