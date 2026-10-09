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

import type { components as aiComponents } from '../src/api/ai-schema.ts';
import type { components, paths } from '../src/api/schema.ts';

export type FrameworkDetail = components['schemas']['FrameworkDetail'];
export type GigDetail = components['schemas']['GigDetail'];
export type ReflectionSummary = components['schemas']['ReflectionSummary'];
export type ReflectionDetail = components['schemas']['ReflectionDetail'];
export type ReflectionEvent =
  paths['/reflections/{reflection_id}/events']['get']['responses']['200']['content']['application/json'][number];
type Framework = components['schemas']['Framework'];
type Competency = components['schemas']['Competency'];
type CompetencySummary = components['schemas']['CompetencySummary'];
type Level = components['schemas']['Level'];
type Me = components['schemas']['Me'];
type Export = components['schemas']['Export'];
type ErrorCode = components['schemas']['Error']['error']['code'];

/** One request as the page sent it. Paths are relative to /api/v1. */
export interface Call {
  method: string;
  path: string;
  /** "PATCH /levels/:id" -- the path with its ids generalised. */
  route: string;
  body: unknown;
}

type AiErrorCode = aiComponents['schemas']['Error']['error']['code'];

/** A refusal from the AI sidecar, injected per route like Fault (ADR #42). */
export type AiFault =
  | {
      kind: 'error';
      status: number;
      code: AiErrorCode;
      message: string;
      details?: Record<string, unknown>;
    }
  | { kind: 'network' };

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
  private readonly gigs: GigDetail[];
  private readonly reflections: (ReflectionSummary | ReflectionDetail)[];
  private readonly events: Record<string, ReflectionEvent[]>;
  private readonly faults = new Map<string, Fault[]>();
  private readonly holds = new Map<string, Promise<void>>();
  /** Exports asked for in this test, by id (CAP-56). */
  private readonly exports = new Map<string, Export>();
  private minted = 0;

  // The AI sidecar (ADR #64). Off by default, as a deployment without it is:
  // /ai/v1/status answers 404 AI_DISABLED and no AI element renders.
  /** Every /ai/v1 request, in order. Kept apart so the product's guards are unchanged. */
  readonly ai_calls: Call[] = [];
  private ai_features: string[] | null = null;
  private readonly ai_replies = new Map<string, unknown>();
  private readonly ai_faults = new Map<string, AiFault[]>();
  private readonly ai_holds = new Map<string, Promise<void>>();

  constructor(
    frameworks: FrameworkDetail[],
    me: Me,
    gigs: GigDetail[] = [],
    reflections: (ReflectionSummary | ReflectionDetail)[] = [],
    events: Record<string, ReflectionEvent[]> = {},
  ) {
    this.frameworks = structuredClone(frameworks);
    this.me = me;
    this.gigs = structuredClone(gigs);
    this.reflections = structuredClone(reflections);
    this.events = structuredClone(events);
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

  /** Switches the sidecar on with these features (null: off). */
  ai_status(features: string[] | null): void {
    this.ai_features = features;
  }

  /** The body a sidecar route answers with, e.g. 'POST /reflections/:id/entries/:id/coach'. */
  ai_reply(route: string, body: unknown): void {
    this.ai_replies.set(route, body);
  }

  /** The next `times` requests to a sidecar route fail with `fault`. */
  ai_fail(route: string, fault: AiFault, times = 1): void {
    this.ai_faults.set(route, [
      ...(this.ai_faults.get(route) ?? []),
      ...Array(times).fill(fault),
    ]);
  }

  /** Holds every response on a sidecar route until the returned function is called. */
  ai_hold(route: string): () => void {
    let release = () => {};
    this.ai_holds.set(route, new Promise<void>((resolve) => (release = resolve)));
    return () => {
      this.ai_holds.delete(route);
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
   * A reflection that appears server-side mid-test, as if started in another
   * tab. The page only sees it on its next GET.
   */
  add_reflection(reflection: ReflectionSummary | ReflectionDetail): void {
    this.reflections.push(structuredClone(reflection));
  }

  /**
   * A gig takes this framework as its rubric server-side, mid-test, as if a
   * supervisor assigned it in another tab. The page only sees it on its next
   * GET. Staged data, not a rule: the refusal a delete meets after this is
   * injected with fail(), and FrameworkDeletionTest holds the rule itself.
   */
  assign(framework_id: string): void {
    const framework = this.frameworks.find((f) => f.id === framework_id);
    if (!framework) throw new Error(`The fake has no framework ${framework_id}.`);
    framework.assigned = true;
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
    await page.route('**/ai/v1/**', (route) => this.handle_ai(route));
  }

  private async handle_ai(route: Route): Promise<void> {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/ai\/v1/, '');
    const method = request.method();
    const key = `${method} ${path.replace(UUID, ':id')}`;
    this.ai_calls.push({ method, path, route: key, body: null });

    const held = this.ai_holds.get(key);
    if (held) await held;

    const fault = this.ai_faults.get(key)?.shift();
    if (fault?.kind === 'network') return route.abort('failed');
    if (fault) {
      return reply(route, fault.status, {
        error: { code: fault.code, message: fault.message, details: fault.details ?? {} },
      });
    }

    if (this.ai_features === null) {
      return reply(route, 404, {
        error: {
          code: 'AI_DISABLED',
          message: 'AI features are switched off.',
          details: {},
        },
      });
    }
    if (key === 'GET /status') return reply(route, 200, { features: this.ai_features });
    if (this.ai_replies.has(key)) return reply(route, 200, this.ai_replies.get(key));

    this.unexpected.push(`AI ${key}`);
    return reply(route, 404, {
      error: {
        code: 'NOT_FOUND',
        message: 'The fake serves no such AI route.',
        details: {},
      },
    });
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

    // The list DiaryHome calls on mount (HO-6, shots Task 2): every gig the
    // fake's `me` participates in, in the list shape (Gig), not the detail
    // shape (GigDetail) GET /gigs/:id returns -- same relationship as
    // summary() below stripping FrameworkDetail down to Framework.
    if (key === 'GET /gigs') {
      return reply(
        route,
        200,
        this.gigs.map(({ participants: _participants, ...gig }) => gig),
      );
    }

    if (key === 'GET /gigs/:id') {
      const gig = this.gigs.find((g) => g.id === id);
      return gig
        ? reply(route, 200, gig)
        : reply(route, 404, envelope('NOT_FOUND', 'No such gig, or it is not yours.'));
    }

    // CAP-21 (shots): Review Queue's own `loaded` shot is real-sourced
    // (manifest.ts has no fixture for a populated queue), so this fake
    // always answers empty -- enough to produce review-queue-empty, and a
    // base for review-queue-error and review-queue-loading, both of which
    // intercept above via fault()/hold() before this line is ever reached.
    if (key === 'GET /review-queue') return reply(route, 200, []);

    // CAP-56: an export, in the shape ExportController returns. It is built
    // at once (the backend's sync queue does the same, ADR #30); whether a
    // caller may export, and building the file, are the backend's, tested in
    // api/tests. A test that needs a failed build asks for it with fail().
    if (key === 'POST /exports') {
      const { format, reflection_id = null } = body as {
        format: 'json' | 'pdf';
        reflection_id?: string | null;
      };
      const made = export_of(format, reflection_id);
      this.exports.set(made.id, made);
      return reply(route, 202, made);
    }

    if (key === 'GET /exports/:id') {
      const found = this.exports.get(id);
      return found
        ? reply(route, 200, found)
        : reply(route, 404, envelope('NOT_FOUND', 'No such resource, or it is not yours.'));
    }

    if (key === 'GET /exports/:id/download') {
      const found = this.exports.get(id);
      if (!found)
        return reply(
          route,
          404,
          envelope('NOT_FOUND', 'No such resource, or it is not yours.'),
        );
      return route.fulfill({
        status: 200,
        contentType: found.format === 'pdf' ? 'application/pdf' : 'application/json',
        headers: {
          'Content-Disposition': `attachment; filename=reflection-diary-${found.id}.${found.format}`,
        },
        body: found.format === 'pdf' ? '%PDF-1.4\n%fake\n' : '{}',
      });
    }

    if (key === 'GET /reflections') {
      // ReflectionController::index only applies the gig_id filter when the
      // query param is actually present (`->when($request->query('gig_id'),
      // ...)`); with none, it returns every reflection the caller may see,
      // not just the ones whose own gig_id happens to be null. Diary Home
      // calls this with no gig_id at all, for exactly that "everything I
      // own" list (HO-6, shots Task 2) -- discovered because no earlier spec
      // called this route without one.
      const gig_id = new URL(request.url()).searchParams.get('gig_id');
      const rows = gig_id
        ? this.reflections.filter((r) => r.gig_id === gig_id)
        : this.reflections;
      return reply(route, 200, rows.map(summary_of));
    }

    if (key === 'GET /reflections/:id/events') {
      if (!this.reflections.some((r) => r.id === id)) {
        return reply(
          route,
          404,
          envelope('NOT_FOUND', 'No such resource, or it is not yours.'),
        );
      }
      return reply(route, 200, this.events[id] ?? []);
    }

    if (key === 'GET /reflections/:id') {
      const reflection = this.reflections.find((r) => r.id === id);
      return reflection
        ? reply(route, 200, reflection)
        : reply(route, 404, envelope('NOT_FOUND', 'No such resource, or it is not yours.'));
    }

    if (key === 'POST /reflections') {
      // The shape ReflectionCreator::create returns: a draft with one empty
      // entry per competency of the gig's rubric. Who may start one, and
      // the duplicate refusal, are the backend's (GigPolicy, the unique
      // index); a test that needs a refusal asks for it with fail().
      const { sprint_id } = body as { sprint_id: string };
      const gig = this.gigs.find((g) => g.sprints.some((s) => s.id === sprint_id));
      const framework = this.frameworks.find((f) => f.id === gig?.framework?.id);
      if (!gig || !framework) {
        return reply(
          route,
          404,
          envelope('NOT_FOUND', 'No such resource, or it is not yours.'),
        );
      }
      const sprint = gig.sprints.find((s) => s.id === sprint_id)!;
      const reflection_id = this.mint();
      const now = '2026-10-03T10:00:00.000000Z';
      const draft: ReflectionDetail = {
        id: reflection_id,
        status: 'draft',
        gig_id: gig.id,
        sprint_id,
        sprint_ordinal: sprint.ordinal,
        framework_id: framework.id,
        framework_version: framework.version,
        submitted_at: null,
        created_at: now,
        updated_at: now,
        owner: { id: this.me.id, display_name: this.me.display_name },
        entries: framework.competencies.map((competency) => ({
          id: this.mint(),
          competency_id: competency.id,
          competency_code: competency.code,
          competency_name: competency.name,
          short_label: competency.short_label,
          position: competency.position,
          narrative: null,
          evidence: [],
          scores: [],
        })),
      };
      this.reflections.push(draft);
      return reply(route, 201, draft);
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

    // Round 3 E2: the Frameworks sheet assigns. Shape only, no rule: the
    // one-rubric-per-gig 409 is injected with fail() where a spec wants it.
    if (key === 'POST /framework-assignments') {
      const { gig_id, framework_id } = body as { gig_id: string; framework_id: string };
      return reply(route, 201, {
        id: this.mint(),
        gig_id,
        framework_id,
        assigned_by: this.me.id,
        assigned_at: '2026-10-05T00:00:00.000000Z',
      });
    }

    if (key === 'PATCH /frameworks/:id') {
      const framework = this.frameworks.find((f) => f.id === id);
      if (!framework) return reply(route, 404, envelope('NOT_FOUND', 'Not found.'));
      Object.assign(framework, body);
      return reply(route, 200, framework);
    }

    // CAP-50: shape only. Who may delete and the never-assigned rule are
    // FrameworkPolicy's and FrameworkEditing's; a spec that wants the 403 or
    // the 409 asks for it with fail().
    if (key === 'DELETE /frameworks/:id') {
      const at = this.frameworks.findIndex((f) => f.id === id);
      if (at === -1) return reply(route, 404, envelope('NOT_FOUND', 'Not found.'));
      this.frameworks.splice(at, 1);
      return route.fulfill({ status: 204 });
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
      assigned: false,
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

/** A list row is the summary: the detail's owner and entries are not in it. */
let exports_made = 0;

/** A finished export, as ExportController returns it once BuildExport ran. */
function export_of(format: Export['format'], reflection_id: string | null): Export {
  exports_made += 1;
  const id = `eeee${String(exports_made).padStart(4, '0')}-0000-4eee-8eee-eeeeeeeeeeee`;
  return {
    id,
    format,
    status: 'complete',
    reflection_id,
    summary: { reflections: 1, sprints: 1, scores: 6, files: 0 },
    requested_at: '2026-10-09T01:00:00Z',
    completed_at: '2026-10-09T01:00:01Z',
    uri: `exports/e2e/${id}.${format}`,
  };
}

function summary_of(reflection: ReflectionSummary | ReflectionDetail): ReflectionSummary {
  const { owner: _owner, entries: _entries, ...rest } = reflection as ReflectionDetail;
  return rest;
}

function summary(detail: FrameworkDetail): Framework {
  const { id, fw_key, version, name, created_by, in_use, assigned } = detail;
  return { id, fw_key, version, name, is_active: true, created_by, in_use, assigned };
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
