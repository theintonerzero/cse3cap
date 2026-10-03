# Demo script

The client demo, written so someone who has never seen the Reflection Diary can give it
(CAP-30). About fifteen minutes. It follows one student's reflection from writing to
assessment, then shows that the rubric is data.

It runs against the seeded demo data. `docs/Runbook.md` covers starting the app, reseeding
and issuing tokens; do those first.

## Before you start

- [ ] `./run dev` is running and `http://localhost:5173` loads.
- [ ] You have the three seeded tokens: Jane N, Sam O and Dr Lee.
- [ ] Jane's third La Trobe sprint is empty. `./run smoke` writes there, so check with the
      query in [the smoke trap](Runbook.md#the-smoke-trap). If it is full, delete it or the
      writing step below has nowhere to go.
- [ ] A browser window wide enough to show the radar next to the list, and a second tab if
      you want to keep Jane open while you are Sam.
- [ ] A fallback if the network refuses port 3306: the same build against `./run mock`
      shows every screen, with canned data that does not persist.

On first load the app asks for a token. Paste each one into its slot: **Student** for
Jane, **Assessor** for Sam, **Supervisor** for Dr Lee. Pick Jane's to start. Switch later
by clicking the name at the top left, which opens **Switch user**.

## 1. The record a student keeps (Jane, 3 minutes)

The point to make: the record belongs to the student and survives the subject.

1. **Diary** (`/`). Jane's radar plots her self-scores against her assessor's across the La
   Trobe gig's six competencies. Two polygons, and the gap between them is the
   conversation.
2. Change the scope from the whole record to a single sprint. The caption changes with it:
   the whole record shows the latest score per competency, and a single sprint shows a
   true self against assessor comparison for that sprint.
3. Jane is on two gigs with two different rubrics. Switch to **Data migration audit**: SFIA
   9, a seven-point scale and six different skills, drawn by the same chart.
4. **Export your record**. The whole record downloads as JSON. That is the guarantee the
   record is hers, not the platform's.

## 2. Writing a reflection (Jane, 4 minutes)

1. Open the **La Trobe** gig. The sprints are listed with their due dates; sprints 1 and 2
   are assessed. **History** shows every submission and assessment, dated.
2. Sprint 3 has no reflection yet, so its row offers **Start reflection**. Press it: the draft
   is created and opens in the stepper, which goes one competency at a time.
3. For the first competency: write two sentences of narrative, add evidence with **Add a
   link** (any `https://` address), and choose a self-score. Each level shows its
   descriptor, so the student is scoring against words rather than a number.
4. Do the same for the rest. Saving happens as you go.
5. Press **Submit**. If anything the rubric requires is missing, the screen names the
   competencies at fault instead of failing generically. On success the confirmation names
   the assessor who has been told.

## 3. Assessing it (Sam, 4 minutes)

The point to make: the assessor scores the same entries, and a lower score has to be
explained.

1. Switch to Sam. His **Review queue** lists what is waiting, including Jane's reflection
   from step 2. Tom's sprint 2 shows as part-scored, 2 of 6.
2. Open Jane's. Her narrative and evidence are read-only; her self-score is shown next to
   the assessor's choice.
3. Score one competency below Jane's self-score and try to save without a comment. It is
   refused: a lower counter-score needs a comment. Add one.
4. Score the rest and press **Save all scores**. With every entry counter-scored, the
   reflection becomes assessed by itself.
5. Point out that Sam sees only the La Trobe gig. He is not on the SFIA gig, so it does
   not exist for him. Roles are worked out per gig on the server, not sent by the browser.

Switch back to Jane: her radar now includes sprint 3.

## 4. The rubric is data (Dr Lee, 3 minutes)

The point to make: a new competency framework needs no code change.

1. Switch to Dr Lee and open **Frameworks**. La Trobe's six competencies and SFIA 9 sit
   side by side.
2. Both are in use, so both are read-only. Changing a rubric that students have already
   been scored against would rewrite their past.
3. **Copy and edit a rubric** from La Trobe: rename the copy and reword a level
   descriptor. Copies are editable until a reflection references them.
4. **Assign to a gig** shows that a gig holds one rubric at a time.

`docs/Framework-Swap-Verification.md` is the evidence behind this section if the client
asks for it.

## Questions to expect

| Question | Short answer |
| --- | --- |
| Where do users sign in? | Not yet. Three seeded tokens stand in for Alumable's login (ADR #15). Real sign-in would come from Alumable's platform through the `external_ref` columns |
| Can an assessor change a score later? | No. A submitted counter-score is final, by design |
| What happens when a student graduates? | The record stays theirs, and export is the guarantee (`docs/Retention-and-Erasure.md`) |
| Can we add our own framework? | Yes, by copying a seeded one and rewording it. Adding or removing competencies was cut from scope |
| Is it live on the internet? | Not yet. CAP-26 is the demo deployment |

## After the demo

Delete Jane's sprint 3 reflection if the next demo needs the writing step again
(`docs/Runbook.md`, the smoke trap). Nothing else changes the seeded data.
