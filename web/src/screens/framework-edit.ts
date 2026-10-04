/**
 * The edit framework screen's draft, and what a save still owes the server.
 *
 * Copy-then-edit (ADR #16): saving POSTs a copy of the base and then PATCHes
 * the copy, one field at a time, because that is the only shape the contract
 * offers. Nothing here talks to the API; it decides WHICH patches, and the
 * screen sends them.
 *
 * The diff is taken against the COPY, not the base. After each PATCH lands
 * the screen folds it in with apply_edit, so if the fourth of ten fails, a
 * second press of Save sends the remaining six to the same copy rather than
 * making another one.
 *
 * Rows are matched by competency code and level value, never by array index
 * or id: the copy has fresh ids, and (framework_id, code) and
 * (competency_id, level_value) are the unique keys that copy() carries over.
 *
 * Outside the component because it is the part with decisions in it, and
 * because scripts/verify-edit-framework.sh compiles and runs it without a
 * browser. Same reason framework-groups.ts sits beside SelectFramework.
 */
import type { components } from '../api/schema.ts';

export type FrameworkDetail = components['schemas']['FrameworkDetail'];

/** The contract's maxLength for a framework or competency name. */
export const NAME_MAX = 191;

/** The contract's maxLength for a radar axis label. */
export const SHORT_LABEL_MAX = 32;

export interface LevelDraft {
  level_value: number;
  descriptor: string;
}

export interface CompetencyDraft {
  code: string;
  category: string | null;
  name: string;
  /** '' in the field; sent as null. The radar falls back to the name. */
  short_label: string;
  levels: LevelDraft[];
}

export interface FrameworkDraft {
  name: string;
  competencies: CompetencyDraft[];
}

export type Edit =
  | { kind: 'framework'; id: string; body: { name: string } }
  | { kind: 'competency'; id: string; body: { name: string; short_label: string | null } }
  | { kind: 'level'; id: string; body: { descriptor: string } };

/**
 * The name a copy starts with says it is one. ADR #16: "the UI has to make
 * copying obvious rather than surprising".
 */
export function draft_from(base: FrameworkDetail): FrameworkDraft {
  return {
    name: `Copy of ${base.name}`.slice(0, NAME_MAX),
    competencies: [...base.competencies]
      .sort((a, b) => a.position - b.position)
      .map((competency) => ({
        code: competency.code,
        category: competency.category,
        name: competency.name,
        short_label: competency.short_label ?? '',
        levels: [...competency.levels]
          .sort((a, b) => a.level_value - b.level_value)
          .map((level) => ({
            level_value: level.level_value,
            descriptor: level.descriptor,
          })),
      })),
  };
}

export function set_competency(
  draft: FrameworkDraft,
  code: string,
  fields: Partial<Pick<CompetencyDraft, 'name' | 'short_label'>>,
): FrameworkDraft {
  return {
    ...draft,
    competencies: draft.competencies.map((competency) =>
      competency.code === code ? { ...competency, ...fields } : competency,
    ),
  };
}

export function set_level(
  draft: FrameworkDraft,
  code: string,
  level_value: number,
  descriptor: string,
): FrameworkDraft {
  return {
    ...draft,
    competencies: draft.competencies.map((competency) =>
      competency.code !== code
        ? competency
        : {
            ...competency,
            levels: competency.levels.map((level) =>
              level.level_value === level_value ? { ...level, descriptor } : level,
            ),
          },
    ),
  };
}

/**
 * The required fields left blank, named so the screen can say which. The
 * FormRequests are the rule and would answer 400; this only saves the
 * supervisor a round trip to find out. A blank radar label is allowed.
 */
export function missing_text(draft: FrameworkDraft): string[] {
  const missing: string[] = [];
  if (draft.name.trim() === '') missing.push('Name of your copy');

  for (const competency of draft.competencies) {
    if (competency.name.trim() === '') missing.push(`${competency.code}: name`);
    for (const level of competency.levels) {
      if (level.descriptor.trim() === '') {
        missing.push(`${competency.code}: level ${level.level_value}`);
      }
    }
  }
  return missing;
}

/**
 * Every PATCH the draft still needs, in the order the screen shows the
 * fields. Trimmed on the way out, because Laravel trims on the way in: a
 * stray space is not a change and should not cost a request.
 */
export function pending_edits(copy: FrameworkDetail, draft: FrameworkDraft): Edit[] {
  const edits: Edit[] = [];

  const name = draft.name.trim();
  if (name !== copy.name) edits.push({ kind: 'framework', id: copy.id, body: { name } });

  for (const wanted of draft.competencies) {
    const competency = copy.competencies.find((c) => c.code === wanted.code);
    if (!competency) {
      throw new Error(
        `The copy has no competency "${wanted.code}", so it cannot take this draft.`,
      );
    }

    const body = {
      name: wanted.name.trim(),
      short_label: wanted.short_label.trim() === '' ? null : wanted.short_label.trim(),
    };
    if (body.name !== competency.name || body.short_label !== competency.short_label) {
      edits.push({ kind: 'competency', id: competency.id, body });
    }

    for (const wanted_level of wanted.levels) {
      const level = competency.levels.find(
        (l) => l.level_value === wanted_level.level_value,
      );
      if (!level) {
        throw new Error(
          `The copy's "${wanted.code}" has no level ${wanted_level.level_value}, so it cannot take this draft.`,
        );
      }

      const descriptor = wanted_level.descriptor.trim();
      if (descriptor !== level.descriptor) {
        edits.push({ kind: 'level', id: level.id, body: { descriptor } });
      }
    }
  }

  return edits;
}

/**
 * pending_edits for the render, which must not throw: a throw in render is a
 * blank page. null means the copy does not have this draft's shape, which the
 * real API cannot produce (copy() carries every code and level over) but the
 * prism mock's generated response does.
 */
export function owed_by(copy: FrameworkDetail, draft: FrameworkDraft): Edit[] | null {
  try {
    return pending_edits(copy, draft);
  } catch {
    return null;
  }
}

/** The copy as it stands once `edit` has landed. */
export function apply_edit(copy: FrameworkDetail, edit: Edit): FrameworkDetail {
  switch (edit.kind) {
    case 'framework':
      return { ...copy, name: edit.body.name };
    case 'competency':
      return {
        ...copy,
        competencies: copy.competencies.map((c) =>
          c.id === edit.id ? { ...c, ...edit.body } : c,
        ),
      };
    case 'level':
      return {
        ...copy,
        competencies: copy.competencies.map((c) => ({
          ...c,
          levels: c.levels.map((l) => (l.id === edit.id ? { ...l, ...edit.body } : l)),
        })),
      };
  }
}

/** Whether choosing another base would throw away something typed. */
export function is_dirty(base: FrameworkDetail, draft: FrameworkDraft): boolean {
  return JSON.stringify(draft) !== JSON.stringify(draft_from(base));
}
