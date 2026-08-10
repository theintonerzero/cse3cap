# Reflection Diary: API specification v2

Base path `/api/v1`. JSON in and out. This is the human-readable contract; `docs/openapi.yaml`
is generated from it and is the machine source of truth for the mock server and both
implementations.

Changes from v1: login endpoint removed (three seeded tokens instead), framework editing
added (copy-then-edit with an in-use guard), educator mapped to the supervisor role, new
error code `FRAMEWORK_IN_USE`.

---

## 1. Conventions

**Field names:** snake_case, matching the database exactly. No mapping layer anywhere.

**IDs:** uuid strings (char 36). **Timestamps:** ISO 8601 UTC, e.g. `2026-08-14T03:20:00Z`.

**Auth:** `Authorization: Bearer <token>` on every request. There is no login endpoint in
the MVP. Three tokens are seeded and documented in the README:

| Token owner | Role(s) | Used for |
|---|---|---|
| Jane (student) | student on both gigs | student flow |
| Sam (assessor) | assessor on gig 1 | assessor flow |
| Dr Lee (supervisor) | supervisor on both gigs | educator flow: framework select/edit/assign, plus counter-scoring |

Educator is not a distinct role. It maps to `supervisor`, which already exists in
`gig_participants`. A supervisor can both manage frameworks and counter-score.

**Roles are never sent by the client.** The server resolves the caller's role per gig from
`gig_participants`.

**Error envelope**, every non-2xx:

```json
{ "error": { "code": "COMMENT_REQUIRED", "message": "Human-readable explanation", "details": {} } }
```

**Error codes:** `VALIDATION_FAILED · CONTEXT_REQUIRED · DUPLICATE_REFLECTION · NOT_DRAFT ·
NOT_SUBMITTED · COMMENT_REQUIRED · LEVEL_NOT_IN_COMPETENCY · EVIDENCE_REQUIRED ·
NARRATIVE_REQUIRED · SELF_SCORE_MISSING · FILE_TYPE_NOT_ACCEPTED · FILE_TOO_LARGE ·
FRAMEWORK_NOT_ASSIGNED · FRAMEWORK_IN_USE · ROLE_FORBIDDEN`

**Status codes:** 400 validation / business rule, 401 no or bad token, 403 wrong role,
404 not found or not yours (indistinguishable on purpose), 409 conflict (duplicate, wrong
state, framework in use).

**Pagination:** none. Result sets are small at MVP scale.

---

## 2. Identity

### GET /auth/me
Who am I, and what am I on each gig. Drives role-aware navigation.
```json
{
  "id": "…", "display_name": "Jane N",
  "participations": [
    { "gig_id": "…", "gig_title": "Develop AI use cases", "role": "student" },
    { "gig_id": "…", "gig_title": "Data migration audit", "role": "student" }
  ]
}
```

*(No login/logout endpoints. If real authentication is added later, `POST /auth/login`
returns `{ token, user }` and nothing else in this contract changes.)*

---

## 3. Gigs & sprints (read-only mirrors)

### GET /gigs
Gigs the caller participates in, any role.
```json
[{
  "id": "…", "title": "…", "org_name": "…",
  "starts_on": "2026-08-03", "ends_on": "2026-10-31",
  "my_role": "student",
  "sprints": [{ "id": "…", "ordinal": 1, "opens_on": "…", "due_on": "…" }],
  "framework": { "id": "…", "fw_key": "latrobe6", "name": "…", "version": "v1" },
  "reflection_summary": { "draft": 1, "submitted": 0, "assessed": 1 }
}]
```

### GET /gigs/{gig_id}
Same shape, single object, plus `participants: [{ id, display_name, role }]`.
404 if the caller isn't a participant.

---

## 4. Frameworks

### GET /frameworks?active=true
```json
[{ "id": "…", "fw_key": "latrobe6", "version": "v1", "name": "…", "is_active": true,
   "created_by": null, "in_use": true }]
```
`created_by` null means a seeded base template; set means someone's copy. `in_use` true
means at least one reflection references it, so it is read-only. The Select-framework
screen groups by `created_by` (Available Templates vs Saved Templates) and uses `in_use`
to show or hide the Edit action.

### GET /frameworks/{framework_id}
The full rubric, nested. Drives the entry stepper, the radar axes, and the editor.
```json
{
  "id": "…", "fw_key": "latrobe6", "version": "v1", "name": "La Trobe six-competency",
  "created_by": null, "in_use": true,
  "comment_required": true, "evidence_required": false,
  "accepted_file_types": ["pdf","png","jpg"], "max_file_bytes": 10485760,
  "scale": { "min": 1, "max": 4 },
  "competencies": [{
    "id": "…", "code": "collaboration", "name": "Collaboration",
    "short_label": "Collab.", "category": null, "position": 3,
    "levels": [{ "id": "…", "level_value": 1, "descriptor": "…" }]
  }]
}
```
`scale` is computed from the level rows (`v_framework_scale`).

### POST /frameworks: create a copy (supervisor only)
```json
{ "based_on_framework_id": "…", "name": "Alumable Sprint 1 Gig template" }
```
Server deep-copies every competency and level of the base into a new framework row:
new id, `version` = "v1" of the copy, `created_by` = caller, `in_use` = false. The base
is untouched. Returns 201 with the full nested framework.

**Copy-then-edit is the only editing model.** There is no way to mutate a framework that
reflections reference, because doing so would silently change what past students were
scored against. The version snapshot on every reflection depends on frameworks being
immutable once used.

### PATCH /frameworks/{framework_id}: supervisor, own copy, not in use
Rename or adjust policy: any of `name`, `comment_required`, `evidence_required`,
`accepted_file_types`, `max_file_bytes`.
If any reflection references the framework → **409 FRAMEWORK_IN_USE**.
If `created_by` isn't the caller (seeded bases included) → 403.

### PATCH /competencies/{competency_id}: same guards
`{ "name": "…", "short_label": "…" }`. Rename only in MVP scope. Adding or removing
competencies and changing level counts is out of scope (see Stack-and-Build-Scope §5).

### PATCH /levels/{level_id}: same guards
`{ "descriptor": "…" }`. Reword a level descriptor.

### POST /framework-assignments: supervisor or employer
`{ "framework_id": "…", "gig_id": "…" }` → 201. 409 `DUPLICATE` if already assigned.
Assigning is what eventually flips a framework's `in_use` (the first reflection created
under it does).

---

## 5. Reflections

### GET /reflections?gig_id=&sprint_id=&status=
Caller's own reflections. Summary shape with `entries_scored / entries_total`.

### POST /reflections
```json
{ "gig_id": "…", "sprint_id": "…" }
```
Server behaviour:
1. Caller must be a **student** on the gig (403 `ROLE_FORBIDDEN`)
2. At least one of gig_id / sprint_id (400 `CONTEXT_REQUIRED`); gig derived from sprint if
   omitted, **set at creation, never updated**
3. Framework resolved from the gig's assignment (400 `FRAMEWORK_NOT_ASSIGNED`);
   `framework_version` snapshotted onto the row
4. **One `reflection_entries` row created eagerly per competency** in the framework
5. Duplicate context → 409 `DUPLICATE_REFLECTION`

Returns 201 with full detail.

### GET /reflections/{reflection_id}
Full detail, the screen payload for student and assessor views:
```json
{
  "id": "…", "status": "draft", "gig_id": "…", "sprint_id": "…",
  "framework_id": "…", "framework_version": "v1", "submitted_at": null,
  "owner": { "id": "…", "display_name": "…" },
  "entries": [{
    "id": "…", "competency_id": "…", "competency_code": "collaboration",
    "narrative": "…",
    "evidence": [{ "id": "…", "kind": "link", "label": "…", "uri": "…", "size_bytes": null }],
    "scores": [
      { "id": "…", "scorer_role": "self", "level_id": "…", "level_value": 3,
        "comment": null, "scorer": { "id": "…", "display_name": "…" }, "scored_at": "…" }
    ]
  }]
}
```
Access: the owner, or a gig participant with role assessor/supervisor/employer. Others 404.

### POST /reflections/{reflection_id}/submit
Owner, draft only (409 `NOT_DRAFT`). The gate, driven by framework policy:
- every entry has non-empty narrative → 400 `NARRATIVE_REQUIRED` + `details.entry_ids`
- every entry has a self score → 400 `SELF_SCORE_MISSING`
- if `evidence_required`: every entry has ≥1 evidence → 400 `EVIDENCE_REQUIRED`
Sets `submitted`, stamps `submitted_at`, writes `reflection_submitted` event.

### DELETE /reflections/{reflection_id}
Draft only, owner only. Submitted and assessed records cannot be deleted through the API.

---

## 6. Entries & evidence

### PATCH /entries/{entry_id}
`{ "narrative": "…" }`. Owner, draft only. The autosave endpoint; frontend debounces.

### POST /entries/{entry_id}/evidence
Link: JSON `{ "kind": "link", "label": "…", "uri": "…" }`.
File: multipart (`file`, `label`) → stored to the server filesystem via the filesystem
abstraction; kind file/image from MIME. Validated against the framework's
`accepted_file_types` (400 `FILE_TYPE_NOT_ACCEPTED`) and `max_file_bytes`
(400 `FILE_TOO_LARGE`). Draft only. Returns 201.

### DELETE /evidence/{evidence_id}
Owner, draft only, 204.

---

## 7. Scoring

### PUT /entries/{entry_id}/scores/self
`{ "level_id": "…" }`. Student, own draft. **PUT = upsert**: changing your mind before
submit replaces the score. Server check: level belongs to the entry's competency
(400 `LEVEL_NOT_IN_COMPETENCY`). This check lives here and in the endpoint below,
nowhere else.

### POST /entries/{entry_id}/scores
`{ "level_id": "…", "comment": "…" }`. Assessor/supervisor/employer on the gig.
1. Reflection must be `submitted` (409 `NOT_SUBMITTED`)
2. Level-in-competency check as above
3. **Counter-score below the student's self score → comment mandatory**
   (400 `COMMENT_REQUIRED`); also mandatory when the framework's `comment_required` is on
4. One score per scorer per entry → 409 on repeat (no re-scoring in MVP)
Side effect: when every entry has ≥1 counter-score, status flips to `assessed`, event
written.

### GET /review-queue
For assessor/supervisor/employer: submitted reflections awaiting the caller's score.
```json
[{ "reflection_id": "…", "gig_title": "…", "sprint_ordinal": 2,
   "owner_display_name": "…", "submitted_at": "…",
   "entries_total": 6, "entries_i_scored": 2 }]
```

---

## 8. Analytics (thin wrappers over the SQL views)

### GET /me/radar?gig_id=&sprint_id=
Scope mirrors the UI: no params = whole record (latest per competency); gig only = latest
within gig; gig+sprint = that sprint's true self-vs-assessor.
```json
{
  "scope": { "gig_id": null, "sprint_id": null },
  "framework": { "fw_key": "latrobe6", "scale_max": 4 },
  "axes": [{ "code": "collaboration", "short_label": "Collab.", "position": 3,
             "self": 3, "assessor": 2 }]
}
```
`assessor` null where no counter-score exists; frontend hides the second polygon when all
are null. Backed by `v_radar`.

### GET /me/progress?gig_id={required}
`{ "competencies": [{ "code": "…", "short_label": "…",
   "series": [{ "sprint_ordinal": 1, "self": 3, "assessor": 2 }] }] }`

### GET /me/calibration?gig_id=
From `v_calibration_gap`: `[{ "competency_code": "…", "self_level": 3,
"assessor_level": 2, "gap": 1 }]`. A positive gap means the student rated themselves higher.

### GET /me/coverage?framework_id={required}
From `v_coverage_gaps`: `[{ "competency_code": "…", "name": "…" }]`. Competencies that have
never been evidenced.

---

## 9. Export

### POST /exports
`{ "format": "pdf" | "json", "reflection_id": null }` (null = whole record) →
**202** `{ "id": "…", "status": "pending" }`. Queued job; the `exports` row is the job
record. JSON ships first; PDF follows (see plan risks).

### GET /exports/{export_id}
`{ "id": "…", "format": "json", "status": "complete",
   "summary": { "sprints": 3, "scores": 30, "files": 2 },
   "requested_at": "…", "completed_at": "…", "download_uri": "…" }`
Frontend polls after the 202.

### GET /exports
Export history.

### GET /exports/{export_id}/download
The file itself, owner only.

---

## 10. History

### GET /reflections/{reflection_id}/events
`[{ "event_type": "reflection_submitted", "actor_display_name": "…",
"occurred_at": "…", "metadata": {} }]`
Notifications are derived (review queue + status changes), never stored.

---

## 11. Permission matrix (resolved per gig via gig_participants)

| | student | assessor | supervisor (= educator) | employer |
|---|---|---|---|---|
| create/edit/submit/delete own reflection, self-score, evidence | ✓ | - | - | - |
| view a reflection | own | on their gigs | on their gigs | on their gigs |
| counter-score, review queue | - | ✓ | ✓ | ✓ |
| create / edit frameworks (own copies, not in use) | - | - | ✓ | - |
| assign framework to gig | - | - | ✓ | ✓ |
| analytics + export | own record | own record | own record | own record |

## 12. Status lifecycle

`draft` →(owner submits, gate passes)→ `submitted` →(all entries counter-scored)→
`assessed`. Never backwards. Draft is the only editable state. Frameworks: editable while
`created_by` = you and `in_use` = false; permanently read-only after first use.
