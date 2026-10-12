# Product

What the Reflection Diary is for, who it serves, the principles it is built on, and where it
stops. How it is built is in the [README](README.md) and
[`docs/PROJECT-CONTEXT.md`](docs/PROJECT-CONTEXT.md).

## The idea

Students on real gigs reflect on what they did, supervisors give feedback, and then the subject
ends and all of it disappears. The Reflection Diary keeps it. It is a competency reflection and
scoring module for [Alumable](https://alumable.com), an edtech platform that connects
university students with employers through paid gigs and projects.

A student writes a reflection for each sprint of a gig, one competency at a time, with
evidence. They score themselves against a rubric, and a supervisor or assessor scores the same
competencies independently. Both scores are drawn on one radar chart, so the gap between how
a student sees their work and how others see it is the first thing on the screen. The record
belongs to the student, and it lasts beyond the subject, the gig and graduation.

## Who it is for

| Person | Comes for | Gets |
| --- | --- | --- |
| **Student** | To show what they can do, not just what they were graded | A structured way to reflect, an honest picture of their calibration, and a record they keep and can export |
| **Assessor or employer** | To give feedback that counts without writing an essay | A queue of reflections waiting on them, the student's own words beside the rubric, and a quick, defensible counter-score |
| **Supervisor or educator** | To assess against a framework that fits their course | A choice of rubric per gig, and their own copy of one, reworded, without breaking past records |
| **Alumable** | A portfolio grounded in evidence and recognised frameworks | A module that plugs into its platform through two id columns, with the rubric as data |

## Principles

- **The record belongs to the student.** It survives the subject, the gig and the account. The
  database enforces it: a student's reflections can't be deleted along with a gig.
- **Two views, side by side.** A self-score and a counter-score are never merged into one
  number. The gap between them is the point.
- **The rubric is data.** La Trobe's six competencies and SFIA 9 run through the same code. A
  framework anyone has been scored against is never changed in place, because that would
  rewrite what past students were assessed on.
- **A machine may ask, never author.** The optional AI asks questions and finds related
  reflections. It never writes a reflection, suggests a score or drafts a comment, and it is
  marked wherever it appears.
- **Built for the phone first.** Students reflect in the gaps of their day. Every screen works
  at phone width before desktop.

## What it does

- A diary per student: the radar for any gig and sprint, the sprints that need a reflection,
  and every reflection with its status.
- A stepper that walks one competency at a time: narrative, evidence, and a self-score on one
  row of levels. Assessors use the same stepper to counter-score, with a comment required when
  they score lower.
- A review queue across every gig an assessor is on.
- A learning record per student: every gig as one competency-by-sprint table, and the one
  place to export the whole record, to PDF or JSON.
- Framework management: choose a gig's rubric, copy a seeded one and reword it, delete a copy
  until it is assigned.
- Optional AI: a coach that asks about a draft, questions about a calibration gap, similar
  earlier reflections, and search and themes for reviewers.

## What it is not

Considered and left out, on purpose:

- **A login system.** The host platform signs people in.
- **A framework designer.** Rubrics are copied from a seeded base and reworded, never built from
  nothing, and competencies are not added or removed.
- **Re-scoring.** An assessor's counter-score is final.
- **AI that writes.** Nothing an AI produces is stored as a reflection, a score or a comment.
- **Notifications, real-time updates, pagination or multi-tenancy**, which the scale of the
  capstone did not need.

## Where it goes next

Directions the team would take with more time, not commitments:

- A live connection to Alumable's accounts and gigs, through the `external_ref` columns that
  are already in place.
- An erasure and anonymisation procedure ([`PRIVACY.md`](PRIVACY.md)).
- Employer ratings, reflection prompts and reminders, and analytics across semesters.
- Serving evidence files back safely, with type checks and limits.
- Calibration and coverage views for students, from endpoints that are built and not yet shown.
