/**
 * ADR #64: with the sidecar off or unreachable, the stepper is exactly the
 * product without AI. The status is asked once, and nothing else of /ai/v1.
 */
import { ASSESSED, DRAFT, expect, test } from './ai-fixtures.ts';
import type { FakeApi } from './fake-api.ts';

const SETUPS: [string, (api: FakeApi) => void][] = [
  ['off (404 AI_DISABLED)', () => {}],
  ['unreachable', (api) => api.ai_fail('GET /status', { kind: 'network' })],
];

for (const [name, setup] of SETUPS) {
  test(`AI ${name}: no AI element, and only the status was asked`, async ({
    page,
    api,
  }) => {
    setup(api);
    await page.goto(`/reflections/${DRAFT}`);
    await expect(page.getByText('Competency 1 of 2')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: 'Ask me questions' })).toHaveCount(0);
    await expect(page.getByText(/From your earlier sprints/)).toHaveCount(0);
    expect(api.ai_calls.map((c) => c.route)).toEqual(['GET /status']);
  });
}

for (const [name, setup] of SETUPS) {
  test(`AI ${name}: an assessed reflection has no calibration coach`, async ({
    page,
    api,
  }) => {
    setup(api);
    await page.goto(`/reflections/${ASSESSED}`);
    await expect(page.getByText('Competency 1 of 2')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByRole('button', { name: 'Think about the difference' }),
    ).toHaveCount(0);
    expect(api.ai_calls.map((c) => c.route)).toEqual(['GET /status']);
  });
}
