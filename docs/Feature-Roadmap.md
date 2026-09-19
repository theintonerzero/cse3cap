# Feature roadmap

**Status:** Draft for the team to review, then for discussion with David at Alumable.
**Date:** 2026-09-19 · **Owner:** Tony To · **Raised at:** mid-week meeting, 16 September

The team agreed to bring David a list of possible features and ask what matters to
Alumable, rather than guess. This is that list. Every item says whether it can be built
now, what it would need, and what it would cost, so the conversation is about priorities
rather than feasibility.

It is not a commitment. Nothing here gets built until the MVP's own tickets are done: the
entry stepper (CAP-11), the submitted screen (CAP-12) and the assessor stepper (CAP-13)
come first, because without them the core loop cannot be demonstrated.

---

## Where the MVP is

**Working today, against real data:**

- A student's diary: every gig and sprint, a radar chart comparing their self-score with
  their assessor's, and a list of reflections by status.
- A gig page with its timeline and the student's progress per sprint, with deadlines worded
  as "due in 3 days" or "not open yet".
- An assessor's review queue: the submitted work still waiting on their score.
- A supervisor choosing which rubric a gig is scored against.
- Exporting the whole record as a PDF or JSON file, with the radar drawn in.
- Swapping the rubric: the La Trobe rubric and SFIA 9 both run through the same screens
  with no code change.

**Being built this sprint:** writing a reflection (student), counter-scoring one
(assessor), the submitted confirmation, the history timeline, and editing a copied rubric.

**Behind all of it:** the full API, 142 automated tests, a permission check on every
action, and two security reviews.

---

## How to read the rest

| Tier | Meaning |
| --- | --- |
| **A. Ready to build** | The data already exists. Frontend work only, no new decisions |
| **B. Needs a decision** | Needs a schema change, new infrastructure, or something only Alumable can provide |
| **C. Deliberately left out** | Considered and cut, with the reason and what bringing it back would take |

Effort is a rough estimate for one person with the current tooling: **S** is a day or
less, **M** is two to four days.

---

## A. Ready to build

### A1. A progress and insights screen · M

**What the student gets.** Three views that answer the questions a reflection diary exists
for:

- **Progress.** How each competency's self-score and assessor score moved sprint by
  sprint. Is this skill improving?
- **Calibration.** Where the student rates themselves higher or lower than their assessor,
  competency by competency. Where is my self-assessment off?
- **Coverage.** Competencies on their rubric they have never been scored on. What have I
  not shown yet?

**Why it is cheap.** The backend is finished and tested. `GET /me/progress`,
`GET /me/calibration` and `GET /me/coverage` exist, read database views built for exactly
this, and are covered by the test suite. No screen calls them yet. The charting library is
already in the project, and the demo data was shaped so these views say something
(ReflectionSeeder gives one student a steady improvement, one a large over-confidence gap,
and one a near-perfect match).

**What it needs.** One screen with the usual four states (loaded, loading, empty, error),
reached from the diary.

### A2. Deadline and review nudges · S

**What the user gets.** In-app nudges where they already look:

- On the diary: "Sprint 2 closes in 3 days and your reflection is not started."
- For an assessor: a count of reflections waiting on their score, on the navigation.

**Why it is cheap.** Nothing is stored. The sprint dates exist, the gig page already
works out "due in 3 days" in a tested module (`web/src/screens/gig-timing.ts`), and the
review queue already knows what is waiting. The project's scope allows reminders worked
out from existing data and excludes stored notifications, and this is the first kind.

**What it does not do.** No email and no push. Those are B2.

---

## B. Needs a decision

### B1. Reflection prompts · M, plus a decision

**What the student gets.** A short guiding question under each competency, for example
"Describe a moment this sprint where you had to change your approach", so a blank text
box is less daunting.

**What it needs.** Somewhere to keep the prompts. The obvious place is a field on each
competency, written by the supervisor alongside the level descriptors and carried along
when a rubric is copied. That is a schema change, a contract change and an ADR.

**The line we would hold.** The prompts are written by people. Generating them with AI was
considered and cut (see C1). The product's principle is that a machine can scaffold a
reflection but never author it, and a fixed question keeps to that.

**Question for David:** are prompts useful to Alumable's students, and who should write
them: the university, the employer, or Alumable?

### B2. Email or push reminders · M to L

**What the user gets.** A2's nudges, delivered when the app is closed.

**What it needs.** Mail delivery, a scheduler, and an opt-out, none of which the MVP has.
Stored notifications are outside the MVP's scope by decision.

**Question for David:** does Alumable already send notifications to its users? If so, the
diary should hand its reminders to that channel rather than build a second one.

### B3. SFIA's real skill-to-level ranges · S once the data exists

**What changes.** In real SFIA each skill is valid only over part of the seven levels. The
schema already supports this, but the seed gives every SFIA skill all seven, because the
mapping has to come from Alumable. The framework-swap verification
(`docs/Framework-Swap-Verification.md`) records this gap.

One consequence goes beyond the data. The radar currently scales every axis to the whole
rubric's range, so a skill valid only at levels 5 to 7, scored at 5, would plot at five
sevenths of the way out and look mediocre. Real ranges would need the radar to scale per
skill. That is a design decision as well as a data one.

**Question for David:** can Alumable supply the SFIA skill-to-level mapping it uses?

### B4. Sharing a record with an employer · M, plus a decision

**What the student gets.** A read-only link to their record or one reflection, to send to
a prospective employer, instead of emailing a PDF.

**What it needs.** Share links that expire and can be revoked, a decision about what an
outsider may see, and a security review. The export already covers the use case today, so
this is about convenience and control.

**Question for David:** would students share this way, or is the PDF enough?

---

## C. Deliberately left out

| Feature | Why it is out | What bringing it back would take |
| --- | --- | --- |
| **AI suggestions:** tagging which competencies a reflection shows, generating prompts, semantic search | Cut by team decision (ADR #10) to keep the MVP on the client's stack and within the semester. It also sits uneasily with a record meant to be the student's own words | A vector store, model hosting (a local model would do for a demo), and a clear rule that AI suggests and never writes. A later phase, after integration with Alumable |
| **Real login, or sign-in with Alumable accounts** | The MVP uses three seeded demo tokens (ADR #15) so the team could build the product rather than an auth system | Integration with Alumable's identity. The server-side authentication is already token-based, so this replaces how tokens are issued, not the permission model |
| **Building a rubric from scratch, or adding and removing competencies** | Rubrics are copied from a seeded base and edited (ADR #16). A rubric referenced by any reflection is permanently read-only, so past scores keep their meaning | An editor for structure as well as wording, and rules for versioning a changed rubric |
| **Changing a score after it is given** | An assessor's score is final by design, so the record cannot be quietly rewritten | A revision history on scores, and a decision about what a student sees when one changes |
| **Pagination, multi-tenancy, real-time updates** | Not needed at this size. Every list is small | Worth revisiting only at production scale, after integration |

---

## Questions for David

1. Of **A1 (progress and insights)** and **A2 (nudges)**, which matters more to Alumable's
   users? We can likely build one this semester after the core screens are finished.
2. **Reflection prompts (B1):** useful, and who should write them?
3. **Notifications (B2):** does Alumable have a channel the diary should use?
4. **SFIA ranges (B3):** can Alumable supply the skill-to-level mapping?
5. **Sharing (B4):** would students share a link, or is the export enough?
6. **Integration:** when this moves into Alumable's platform, what should we have ready
   for the handover: API documentation, the permission model, deployment notes?

## What the team does next

If the team agrees, the Tier A items become optional tickets that anyone with capacity can
pick up once CAP-11 and CAP-13 are merged. Tier B items wait for David's answers. Tier C
stays out unless the client asks and a superseding ADR is written.
