---
name: add-policy
description: Add or modify authorisation logic in the Laravel backend. Use for any policy, gate, permission check, or role resolution. Encodes the per-gig role model, the 403 versus 404 rule, and the rule that roles are never accepted from the client.
---

# Adding a policy

Authorisation lives in policies. Not in controllers, not in FormRequests, not in the
frontend.

## Roles are per gig, never global

The same person can be a student on one gig and an assessor on another. There is no role
column on `users`. Role resolves from `gig_participants` for the specific gig in question,
via one helper:

```php
roleFor(User $user, Gig $gig): ?string   // student|assessor|supervisor|employer|null
```

Null means not a participant, which is a 404, not a 403 — the caller should not learn the
resource exists.

**Never accept a role from the request.** Not from a header, not from the body, not from a
query parameter. A client-supplied role is a client-supplied permission.

## The matrix is the specification

`docs/API-Specification.md` section 11 has the permission matrix. Every row is a policy
method. If your endpoint is not covered by a row, add the row first, then the policy.

| Capability | student | assessor | supervisor | employer |
|---|---|---|---|---|
| create/edit/submit/delete own reflection, self-score, evidence | own | — | — | — |
| view a reflection | own | their gigs | their gigs | their gigs |
| counter-score, review queue | — | yes | yes | yes |
| create/edit frameworks (own copies, not in use) | — | — | yes | — |
| assign framework to gig | — | — | yes | yes |
| analytics and export | own | own | own | own |

Supervisor covers the educator screens. There is no separate educator role.

## 403 or 404

**404** when the caller should not know the resource exists — someone else's reflection, a
gig they do not participate in. Not found and not yours are deliberately indistinguishable.

**403** when they can legitimately see the resource but not perform this action — a student
trying to counter-score their own reflection.

## State is part of authorisation

Several rules combine role and state. A policy that only checks role will pass a request
that should fail:

- Editing anything on a reflection requires `status = draft`. Submitted and assessed are
  read only.
- Counter-scoring requires `status = submitted`. There is no scoring a draft.
- Editing a framework requires it to be owned by the caller **and** not referenced by any
  reflection. In-use frameworks are permanently read only.
- Deleting a reflection is draft only. Submitted and assessed records cannot be deleted
  through the API at all, which is part of the ownership promise.

## Testing

One test per row of the matrix that touches your resource. Test the denial, not just the
permission — a policy that returns true for everyone passes every happy-path test.

Cover: correct role succeeds, wrong role fails, non-participant gets 404, right role but
wrong state fails.
