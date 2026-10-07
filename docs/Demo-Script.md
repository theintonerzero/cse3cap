# Demo script

The client demo, written so someone who has never seen the Reflection Diary can give it
(CAP-30). About fifteen minutes. It follows one student's reflection from writing to
assessment, then shows that the rubric is data.

It runs against the seeded demo data. `docs/Runbook.md` covers starting the app, reseeding
and issuing tokens; do those first.

## Before you start

- [ ] `./run dev` is running and `http://localhost:5173` loads.
- [ ] You have four tokens: Jane N, Sam O and Dr Lee from the seeder, and Noor A from the
      one-liner in [Issue a token](Runbook.md#issue-a-token). Jane shows a finished record, Noor writes a
      new reflection, Sam assesses it, and Dr Lee shows the rubric.
- [ ] Noor has an empty sprint on the La Trobe gig. On 7 October only her sprint 3 was
      empty (sprints 1 and 2 hold drafts), so the writing step can run once more: keep it
      for the real demo and rehearse as Priya R or Tom H. Every run uses one up for good,
      because a submitted reflection cannot be deleted through the app. Check before the
      demo:

      ```sql
      SELECT s.ordinal, r.status FROM sprints s JOIN gigs g ON g.id = s.gig_id
        LEFT JOIN reflections r ON r.sprint_id = s.id
          AND r.user_id = (SELECT id FROM users WHERE display_name = 'Noor A')
        WHERE g.title = 'Develop AI use cases' ORDER BY s.ordinal;
      ```

      If both are used, Priya R and Tom H each have sprint 3 empty on the same gig: issue one
      of them a token the same way. Jane's own sprints are all full, so she can no longer
      be the one who writes.
- [ ] A browser window wide enough to show the radar next to the list, and a second tab if
      you want to keep Jane open while you are Sam.
- [ ] A fallback if the network refuses port 3306: the same build against `./run mock`
      shows every screen, with canned data that does not persist.

On first load the app asks for a token. Paste each one into its slot: **Student** for
Jane, **Assessor** for Sam, **Supervisor** for Dr Lee. Pick Jane's to start. Switch later
by clicking the name at the top left, which opens **Switch user**. Tokens are kept per tab,
so Noor gets a second tab of her own in step 2.

## 1. The record a student keeps (Jane, 3 minutes)

The point to make: the record belongs to the student and survives the subject.

1. **Diary** (`/`). Jane is on two gigs, so the diary opens on "All gigs" and asks her to
   pick one: each gig is scored against its own rubric, and one radar can't draw both. Pick
   **Develop AI use cases**. Her radar plots her self-scores against her assessor's across
   La Trobe's six competencies. Two polygons, and the gap between them is the conversation.
2. Pick a sprint chip. Under "All sprints" each competency shows its latest score, from
   whichever sprint scored it last. A single sprint is a true self against assessor
   comparison for that sprint. The card doesn't say which, the picker and the chip do
   (ADR #58), so say it out loud here.
3. Switch the picker to her other gig, **Data migration audit**: SFIA 9, a seven-point scale
   and six different skills, drawn by the same chart.
4. **Export record**, the floating button at the bottom right. The whole record downloads
   as JSON. That is the guarantee the record is hers, not the platform's.

## 2. Writing a reflection (Noor, 4 minutes)

Open a second tab at `http://localhost:5173` and paste Noor's token into **Student**. She is
Jane's classmate on the La Trobe gig, part-way through the course.

1. Open the **La Trobe** gig. The sprints are listed with their due dates. Sprint 1 holds
   her draft. **History** shows every submission and assessment, dated.
2. Her next empty sprint offers **Start reflection** on its row. Press it: the draft is
   created and opens in the stepper, which goes one competency at a time.
3. For the first competency: write two sentences of narrative, add evidence with **Add a
   link** (any `https://` address), and choose a self-score. Each level shows its
   descriptor, so the student is scoring against words rather than a number.
4. Do the same for the rest. Saving happens as you go.
5. Press **Submit**. If anything the rubric requires is missing, the screen says what, jumps
   to the first competency at fault and highlights every one, instead of failing
   generically. On success the confirmation names the assessor, and the reflection is now
   in their review queue. Nothing is emailed: notifications are worked out from the queue,
   not sent.

## 3. Assessing it (Sam, 4 minutes)

The point to make: the assessor scores the same entries, and a lower score has to be
explained.

1. Switch to Sam, in either tab. His **Review queue** lists what is waiting, including
   Noor's reflection from step 2.
2. Open Noor's. Her narrative and evidence are read-only; her self-score is shown next to
   the assessor's choice.
3. Score one competency below Noor's self-score and try to save without a comment. It is
   refused: a lower counter-score needs a comment. Add one.
4. Score the rest and press **Save all scores**. With every entry counter-scored, the
   reflection becomes assessed by itself.
5. Point out that Sam sees only the La Trobe gig. He is not on the SFIA gig, so it does
   not exist for him. Roles are worked out per gig on the server, not sent by the browser.

Switch back to Noor in her tab: her radar now includes the sprint she just wrote.

## 4. The rubric is data (Dr Lee, 3 minutes)

The point to make: a new competency framework needs no code change.

1. Switch to Dr Lee and open **Frameworks**. La Trobe's six competencies and SFIA 9 sit
   side by side.
2. Both are in use, so both are read-only. Changing a rubric that students have already
   been scored against would rewrite their past.
3. Open La Trobe and **Edit a copy**: rename the copy and reword a level
   descriptor. Copies are editable until a reflection references them.
4. Open any rubric: under **Assign to a gig**, each gig says which rubric it already
   uses. A gig holds one rubric for good, so on the demo data none can be picked.

`docs/Framework-Swap-Verification.md` is the evidence behind this section if the client
asks for it.

## Questions to expect

| Question | Short answer |
| --- | --- |
| Where do users sign in? | Through Alumable. The diary has no login of its own (ADR #15). Today seeded accounts stand in for Alumable's: pasted as tokens, or picked on the Alumable sign-in when the demo runs inside the shell (CAP-51). Wired to the real platform, sign-in comes through the `external_ref` columns |
| Is this live inside Alumable? | Not yet. The Alumable sign-in, My Gigs and the header around the diary are a demo surround (ADR #60). The gigs, roles, reflections and scores inside it are the diary's real data. Running it inside Alumable's own app is the next step, with Alumable's API and their go-ahead |
| Can an assessor change a score later? | No. A submitted counter-score is final, by design |
| What happens when a student graduates? | The record stays theirs, and export is the guarantee (`docs/Retention-and-Erasure.md`) |
| Can we add our own framework? | Yes, by copying a seeded one and rewording it. Adding or removing competencies was cut from scope |
| Is it live on the internet? | Not yet. The deploy kit is built (`docs/Deployment.md`) but has not been run on the server, so today it runs from a laptop against the shared database |

## After the demo

Each run uses up one of Noor's empty sprints, and the app cannot give it back: a submitted
reflection is part of the student's record. Run the check above before the next demo, and
move to Priya or Tom when Noor has none left. Nothing else changes the seeded data.

## Running it inside the Alumable shell (CAP-51)

The script above runs the diary on its own, opening on the token prompt. For the client
demo to David Yip there is an optional Alumable-branded wrapper (ADR #60) that makes the
diary read as a feature inside Alumable: an Alumable sign-in, a "My Gigs" home, and the
Alumable chrome around them. It is the same diary and the same data underneath, just
entered through Alumable's skin.

Turn it on with two lines in `web/.env.local` (git-ignored), then `./run dev`:

```
VITE_DEMO_SHELL=1
VITE_DEMO_TOKENS=[{"id":"jane","name":"Jane N","role_hint":"Student","slot":"student","token":"<Jane's token>"}, ...]
```

Use the same four seeded tokens the script already needs (`docs/Runbook.md`, Issue a token),
one per persona. The app now opens on **Sign in with Alumable**: pick a profile and it lands
on **My Gigs**, where each gig card opens that gig's diary exactly as in the main script. The
back-arrow out of a gig returns to the Alumable home. Everything from step 1 onward is
unchanged once a persona is chosen. Without `VITE_DEMO_TOKENS` the welcome falls back to the
seeded-token paste, so the shell still works on a machine that has not set the personas up.

Moving between people works differently in the shell. Where the script says to switch user,
press **Switch profile** at the top right of My Gigs, or **Switch user** in the diary's ⋮
menu. Both return to the Alumable sign-in, whose cards name each person, which matters
because Jane and Noor share the student token slot. For Sam and Dr Lee, My Gigs shows a
**Review queue** button (and **Frameworks** for Dr Lee) above their gigs: that is the way
into sections 3 and 4. The review queue's back-arrow returns to My Gigs.

The wrapper is demo-only and flag-gated: with `VITE_DEMO_SHELL` unset the app is the diary as
it ships, which is what every other document here describes.
