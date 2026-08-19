---
name: add-endpoint
description: Add or change an API endpoint in the Laravel backend. Use whenever a route, controller, request validation, policy check, or the OpenAPI contract needs creating or modifying. Covers the full chain including the contract update and the feature test, so an endpoint is never half-added.
---

# Adding an endpoint

An endpoint is not done when it returns data. It is done when the contract, the
authorisation, the validation, the business rule and the test all exist. Work through these
in order.

## 1. Read before writing

- `docs/openapi.yaml`: does something close already exist? Match its shape.
- `docs/API-Specification.md`: the annotated version, with the reasoning.
- `db/01-schema.sql`: never guess a column name.

If the endpoint is already specified in the contract, implement what is there. Do not
improve on it silently. If the spec is wrong, change the spec in the same PR and say so.

## 2. Route

Routes live in `api/routes/api.php` under the `/api/v1` prefix, behind `auth:sanctum`.
Group by resource, not by role.

Verb choice matters here and is not arbitrary:

- `PUT` for the self-score, because it is an upsert. A student changing their mind before
  submitting replaces the row. The unique index on
  `(reflection_entry_id, scorer_user_id, scorer_role)` guarantees one row.
- `POST` for the counter-score, because a second attempt is an error, not a revision.
  Return 409.

## 3. FormRequest for shape only

`php artisan make:request` for anything with a body. It validates types, presence and
format. It does **not** hold business rules or authorisation.

Field names are snake_case, matching the database exactly. There is no mapping layer.

## 4. Policy for authorisation

Never read a role from the request. Roles resolve server side from `gig_participants` for
the gig in question, via `RoleResolver::for(User, Gig)`.

The permission matrix in `docs/API-Specification.md` section 11 is the specification. Every
row of it is a policy method. If your endpoint is not covered by a row, the matrix needs a
line before the endpoint does.

Return 404 rather than 403 when the caller should not know the resource exists. Wrong role
on a resource they can legitimately see is 403.

## 5. Service class for the business rule

If the endpoint carries a rule, it goes in a service class under `api/app/Services`, not in
the controller and not in the FormRequest. Each rule has exactly one implementation:

| Rule | Lives in |
|---|---|
| Submit gate (narrative, self-score, evidence-if-required) | `SubmitGate` |
| Comment required when a counter-score is lower | `Scoring` |
| Level belongs to the entry's competency | `Scoring` |
| Assessed once every entry has a counter-score | `Scoring` |
| Framework immutable once referenced | `FrameworkEditing` |
| One rubric per gig | `FrameworkAssigner` |
| One entry per competency, on create | `ReflectionCreator` |

The same table is in CLAUDE.md. If they disagree, CLAUDE.md wins and this one is the bug.

Before adding a rule, check it does not already exist somewhere. Two implementations of the
same rule is worse than none, because they drift.

## 6. Controller

Orchestrate and serialise. Resolve the model, call the policy, call the service, return a
resource. If a controller is doing arithmetic or building a query with more than a couple of
joins, that work belongs in a service or a view.

Analytics controllers read the SQL views (`v_entry_score`, `v_radar`,
`v_calibration_gap`, `v_coverage_gaps`, `v_framework_scale`) and do not aggregate in PHP.

## 7. Errors

One envelope, always:

```json
{ "error": { "code": "COMMENT_REQUIRED", "message": "...", "details": {} } }
```

Codes are enumerated in the contract. Do not invent a new one without adding it there.
Where a failure concerns specific rows, put the ids in `details`. The submit gate returns
`details.entry_ids` so the frontend can highlight which competencies are incomplete.

Status codes: 400 validation or rule failure, 401 bad token, 403 wrong role, 404 not found
or not yours, 409 conflict.

## 8. Update the contract

`docs/openapi.yaml`, in the same change. The frontend mocks against it, and TypeScript types
are generated from it, so a contract that lags behind the implementation silently breaks the
other lane.

## 9. Feature test

One test per rule, not per line of code. For a scoring endpoint that means: the happy path,
the wrong role, the wrong state, and each distinct error code the endpoint can return.
Around four tests. Skip coverage theatre.

## Before you say it is done

- Contract updated in this change?
- Rule implemented exactly once?
- Policy covers every role in the matrix row?
- Test covers each error code?
