/**
 * A fake of the API, for browser checks (ADR #42).
 *
 * It serves the endpoints the framework screens call, records every request,
 * and fails on purpose when a test asks it to. It deliberately does NOT
 * re-implement the backend's rules -- who may edit, when a framework is in
 * use. Those have one home each (CLAUDE.md) and are tested there, in
 * api/tests/Feature/FrameworkMutationTest.php. A test that needs a refusal
 * asks for it with fail(), naming the status and code the contract declares.
 *
 * What it does reproduce is the shape of a copy, because the screen depends
 * on it: POST /frameworks returns every competency and level of the base with
 * fresh ids and the same codes and level values, as FrameworkEditing::copy
 * does. FrameworkMutationTest's "copies a base template in full" is the
 * backend's side of that promise.
 *
 * Every payload is typed against the generated schema.ts, so a contract
 * change that breaks these fixtures breaks the build rather than the test.
 */
import type { Page, Route } from '@playwright/test';

import type { components } from '../src/api/schema.ts';

export type FrameworkDetail = components['schemas']['FrameworkDetail'];
type Framework = components['schemas']['Framework'];
type Competency = components['schemas']['Competency'];
type CompetencySummary = components['schemas']['CompetencySummary'];
type Level = components['schemas']['Level'];
type Me = components['schemas']['Me'];
type ErrorCode = components['schemas']['Error']['error']['code'];

/** One request as the page sent it. Paths are relative to /api/v1. */
export interface Call {
  method: string;
  path: string;
  /** "PATCH /levels/:id" -- the path with its ids generalised. */
  route: string;
  body: unknown;
}

export type Fault =
  | { kind: 'error'; status: number; code: ErrorCode; message: string }
  /** The request never arrives: the client's ApiError with status 0. */
  | { kind: 'network' };

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

export class FakeApi {
  /** Everything the page asked for, in order. */
  readonly calls: Call[] = [];
  /** Requests nothing here serves. Every test asserts this stays empty. */
  readonly unexpected: string[] = [];

  private readonly frameworks: FrameworkDetail[];
  private readonly me: Me;
  private readonly faults = new Map<string, Fault[]>();
  private readonly holds = new Map<string, Promise<void>>();
  private minted = 0;

  constructor(frameworks: FrameworkDetail[], me: Me) {
    this.frameworks = structuredClone(frameworks);
    this.me = me;
  }

  /** The next `times` requests to `route` fail with `fault`, then it behaves. */
  fail(route: string, fault: Fault, times = 1): void {
    this.faults.set(route, [
      ...(this.faults.get(route) ?? []),
      ...Array(times).fill(fault),
    ]);
  }

  /** Holds every response on `route` until the returned function is called. */
  hold(route: string): () => void {
    let release = () => {};
    this.holds.set(route, new Promise<void>((resolve) => (release = resolve)));
    return () => {
      this.holds.delete(route);
      release();
    };
  }

  /** The writes, in order: what a save actually sent. */
  writes(): Call[] {
    return this.calls.filter((call) => call.method !== 'GET');
  }

  /** Every copy POST /frameworks has made, oldest first. */
  copies(): FrameworkDetail[] {
    return this.frameworks.filter((f) => f.fw_key.startsWith('e2e-copy-'));
  }

  /**
   * Signs the page in with a placeholder, not a credential: the session
   * reads a slot from sessionStorage, and the fake answers /auth/me without
   * looking at the header.
   */
  async install(page: Page): Promise<void> {
    await page.addInitScript(() => {
      sessionStorage.setItem(
        'reflection-diary-tokens',
        JSON.stringify({ student: null, assessor: null, supervisor: 'e2e-not-a-token' }),
      );
      sessionStorage.setItem('reflection-diary-active-slot', 'supervisor');
    });
    await page.route('**/api/v1/**', (route) => this.handle(route));
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api\/v1/, '');
    const method = request.method();
    const raw = request.postData();
    const body: unknown = raw ? JSON.parse(raw) : null;
    const key = `${method} ${path.replace(UUID, ':id')}`;

    this.calls.push({ method, path, route: key, body });

    const held = this.holds.get(key);
    if (held) await held;

    const fault = this.faults.get(key)?.shift();
    if (fault?.kind === 'network') return route.abort('failed');
    if (fault) return reply(route, fault.status, envelope(fault.code, fault.message));

    const id = path.match(UUID)?.[0] ?? '';

    if (key === 'GET /auth/me') return reply(route, 200, this.me);
    if (key === 'GET /frameworks') return reply(route, 200, this.frameworks.map(summary));

    if (key === 'GET /frameworks/:id') {
      const framework = this.frameworks.find((f) => f.id === id);
      return framework
        ? reply(route, 200, framework)
        : reply(route, 404, envelope('NOT_FOUND', 'That framework does not exist.'));
    }

    if (key === 'POST /frameworks') {
      const { based_on_framework_id, name } = body as {
        based_on_framework_id: string;
        name: string;
      };
      const base = this.frameworks.find((f) => f.id === based_on_framework_id);
      if (!base) return reply(route, 400, envelope('VALIDATION_FAILED', 'No such base.'));

      const copy = this.copy(base, name);
      this.frameworks.push(copy);
      return reply(route, 201, copy);
    }

    if (key === 'PATCH /frameworks/:id') {
      const framework = this.frameworks.find((f) => f.id === id);
      if (!framework) return reply(route, 404, envelope('NOT_FOUND', 'Not found.'));
      Object.assign(framework, body);
      return reply(route, 200, framework);
    }

    if (key === 'PATCH /competencies/:id') {
      for (const framework of this.frameworks) {
        const competency = framework.competencies.find((c) => c.id === id);
        if (!competency) continue;
        Object.assign(competency, body);
        const { levels: _levels, ...rest } = competency;
        const summary: CompetencySummary = { ...rest, framework_id: framework.id };
        return reply(route, 200, summary);
      }
      return reply(route, 404, envelope('NOT_FOUND', 'Not found.'));
    }

    if (key === 'PATCH /levels/:id') {
      for (const framework of this.frameworks) {
        for (const competency of framework.competencies) {
          const level = competency.levels.find((l) => l.id === id);
          if (!level) continue;
          Object.assign(level, body);
          const saved: Level & { competency_id: string } = {
            ...level,
            competency_id: competency.id,
          };
          return reply(route, 200, saved);
        }
      }
      return reply(route, 404, envelope('NOT_FOUND', 'Not found.'));
    }

    this.unexpected.push(key);
    return reply(route, 404, envelope('NOT_FOUND', `The fake does not serve ${key}.`));
  }

  /** FrameworkEditing::copy's shape: same codes and level values, fresh ids. */
  private copy(base: FrameworkDetail, name: string): FrameworkDetail {
    const copy_id = this.mint();
    return {
      ...structuredClone(base),
      id: copy_id,
      fw_key: `e2e-copy-${this.minted}`,
      version: 'v1',
      name: name.trim(),
      created_by: this.me.id,
      in_use: false,
      competencies: base.competencies.map((competency): Competency => ({
        ...structuredClone(competency),
        id: this.mint(),
        levels: competency.levels.map((level) => ({ ...level, id: this.mint() })),
      })),
    };
  }

  /** Ids that read as the fake's, and still match the UUID pattern. */
  private mint(): string {
    this.minted += 1;
    return `e2e00000-0000-4000-8000-${this.minted.toString(16).padStart(12, '0')}`;
  }
}

function summary(detail: FrameworkDetail): Framework {
  const { id, fw_key, version, name, created_by, in_use } = detail;
  return { id, fw_key, version, name, is_active: true, created_by, in_use };
}

function envelope(code: ErrorCode, message: string): components['schemas']['Error'] {
  return { error: { code, message, details: {} } };
}

function reply(route: Route, status: number, payload: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}
