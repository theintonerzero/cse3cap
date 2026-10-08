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
- [ ] A fallback if the network refuses port 3306. First a phone hotspot: check
      `nc -z rddb.darkovski.dev 3306` on it beforehand. Then the recorded walk-through
      video, on the laptop and playable offline. Not `./run mock`: its data is generated
      from the contract, so titles read "string", every profile signs in as the same
      person, and sections 3 and 4 cannot run.

On first load the app asks for a token. Paste each one into its slot: **Student** for
Jane, **Assessor** for Sam, **Supervisor** for Dr Lee. Pick Jane's to start. Switch later
from the ⋮ menu at the top right: **Switch user**. Tokens are kept per tab, so Noor gets a
second tab of her own in step 2.

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
4. **Export record**, the floating button at the bottom right. Pick **PDF** or **JSON**, press
   **Request a PDF export** (or JSON), then **Download** when it is ready: the whole record,
   every gig and every sprint, in one file. That is the guarantee the record is hers, not
   the platform's.
5. **Gig details ›**, then **History**: every submission and assessment on that gig, dated.
   Show it here on Jane: Noor's reflections are still drafts, and a draft has no history yet.

## 2. Writing a reflection (Noor, 4 minutes)

Open a second tab at `http://localhost:5173` and paste Noor's token into **Student**. She is
Jane's classmate on the La Trobe gig, part-way through the course.

1. Open the **La Trobe** gig. The sprints are listed with their due dates. Sprint 1 holds
   her draft. (Her **History** is empty, because drafts are not events. Section 1 showed it
   on Jane.)
2. Her next empty sprint offers **Start reflection** on its row. Press it: the draft is
   created and opens in the stepper, which goes one competency at a time.
3. For the first competency: write two sentences of narrative, add evidence with **Add a
   link** (give it a label and any `https://` address, then **Add link**), and choose a
   self-score. Each level shows its descriptor, so the student is scoring against words
   rather than a number.
4. Do the same for the rest. Saving happens as you go. Until CAP-52 is merged, let each
   narrative show **Saved** before pressing **Next** or **Submit**, and don't type while a
   score is saving. Both can lose words in the current build. Delete this sentence once
   CAP-52 is on `dev`.
5. Press **Submit**. If anything the rubric requires is missing, the screen says what and
   jumps to the first competency at fault, instead of failing generically. It reports one
   kind of gap at a time: writing first, then self-scores, then evidence. On success the
   confirmation names the assessor, and the reflection is now in their review queue.
   Nothing is emailed: notifications are worked out from the queue, not sent.

## 3. Assessing it (Sam, 4 minutes)

The point to make: the assessor scores the same entries, and a lower score has to be
explained.

1. Switch to Sam, in either tab. His **Review queue** lists what is waiting, including
   Noor's reflection from step 2.
2. Open Noor's. Her narrative and evidence are read-only; her self-score is shown next to
   the assessor's choice.
3. Score every competency, one of them below Noor's self-score, and leave that one's
   comment empty. Press **Submit scores**. Nothing is sent: a pop-up names the competency
   that "needs a comment to go with its score", because a lower counter-score has to be
   explained. **Okay** takes you to it. Add the comment.
4. Press **Submit scores** again. With every entry counter-scored, the reflection becomes
   assessed by itself.
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
   descriptor. Copies are editable until a reflection references them. After a rehearsal,
   open that copy and press **Delete framework**, so the shared database doesn't collect a
   "La Trobe (n)" for every run. A copy can be deleted until it is assigned.
4. Open any rubric: under **Assign to a gig**, each gig says which rubric it already
   uses. A gig holds one rubric for good, so on the demo data none can be picked.

`docs/Framework-Swap-Verification.md` is the evidence behind this section if the client
asks for it.

## Rehearsal checklist

Run this end to end at least once before the demo, as Priya R or Tom H for section 2 so
Noor's last empty sprint is kept. Tick it again an hour before.

**Pre-flight**
- [ ] Demo sign-in on or off decided (see "Presenting without it"), and everyone
      presenting knows which
- [ ] `dev` pulled, `npm ci` in `web/` and `composer install` in `api/`
- [ ] Port 3306 reachable on the venue network or the hotspot
- [ ] `./run api` and `./run dev` running, and the shell's four personas in
      `web/.env.development.local`
- [ ] Noor (or Priya or Tom) has an empty sprint, using the query above
- [ ] The team has agreed no reseed, no migration and no token revoke on demo day
- [ ] Video on the laptop, browser at 100 % zoom, window at least 1280 wide, theme chosen

**The shell**
- [ ] The picker reads "Reflection Diary demo", with four named cards and the logo
- [ ] Jane and Noor open on their diary home, Sam and Dr Lee on the review queue
- [ ] ⋮ → **Switch user** shows the picker again, and the next person opens on their page
- [ ] Dark, from the system or from the diary's menu: the picker is dark too

**Each section**
- [ ] §1: two polygons on the radar, a sprint chip redraws it, SFIA shows seven levels,
      export downloads, History lists events, the back-arrow goes gig → diary home
- [ ] §2: Start reflection, narrative saved, link added, self-score picked, the gate refuses
      a blank, then Submit names the assessor
- [ ] §3: the reflection is in Sam's queue, the comment rule refuses, Submit scores marks it
      assessed, and Noor's radar then includes it
- [ ] §4: both rubrics read-only, a copy edited and then deleted, Assign shows each gig's
      rubric

**Failure drills**
- [ ] Network off mid-screen: an error with Retry, and Retry recovers
- [ ] Refresh mid-stepper: the draft is still there
- [ ] Port 3306 refused: the hotspot, then the video

## Questions to expect

| Question | Short answer |
| --- | --- |
| Where do users sign in? | Through Alumable. The diary has no login of its own (ADR #15). Today seeded accounts stand in for Alumable's: pasted as tokens, or picked on the demo sign-in's profile picker (CAP-51). Wired to the real platform, sign-in comes through the `external_ref` columns |
| Is this live inside Alumable? | Not yet. The profile picker is a demo sign-in (ADR #61); everything past it is the diary as it ships. The gigs, roles, reflections and scores inside it are the diary's real data. Running it inside Alumable's own app is the next step, with Alumable's API and their go-ahead |
| Can an assessor change a score later? | No. A submitted counter-score is final, by design |
| What happens when a student graduates? | The record stays theirs, and export is the guarantee (`docs/Retention-and-Erasure.md`) |
| Can we add our own framework? | Yes, by copying a seeded one and rewording it. Adding or removing competencies was cut from scope |
| Is it live on the internet? | Not yet. The deploy kit is built (`docs/Deployment.md`) but has not been run on the server, so today it runs from a laptop against the shared database |

## After the demo

Each run uses up one of Noor's empty sprints, and the app cannot give it back: a submitted
reflection is part of the student's record. Run the check above before the next demo, and
move to Priya or Tom when Noor has none left. Nothing else changes the seeded data.

## Running it with the demo sign-in (CAP-51)

The script above opens on the token prompt. For the client demo there is an optional demo
sign-in (ADR #61): with nobody signed in, the token prompt is replaced by a one-click
picker of named people under the Alumable logo, headed **Reflection Diary demo** and saying
plainly that these are demo profiles, not an Alumable sign-in. It wears the diary's own look
and follows the theme. Past the picker nothing changes: every screen, back-arrow and menu is
the product's.

Turn it on with two lines in `web/.env.development.local` (git-ignored, and read only by the
development server, never by a production build), then `./run dev`:

```
VITE_DEMO_SHELL=1
VITE_DEMO_TOKENS=[{"id":"jane","name":"Jane N","role_hint":"Student","slot":"student","token":"<Jane's token>"}, ...]
```

Use the same four seeded tokens the script already needs (`docs/Runbook.md`, Issue a token),
one per person. Pick a person and the app opens where it would after pasting their token:
Jane and Noor on their diary home, Sam and Dr Lee on the review queue. Without
`VITE_DEMO_TOKENS` the picker falls back to the seeded-token paste, which signs in the same
way.

Moving between people is the one difference. Where the script says to switch user, open the
⋮ menu and press **Switch user**: the picker appears again, and picking someone else opens
their start page. That is why nobody needs a second tab in the shell: Jane and Noor share
the Student token slot, and the picker's cards tell them apart where the slot sheet can't.

With `VITE_DEMO_SHELL` unset the app is the diary as it ships, which is what every other
document here describes.

### Presenting without it

The demo sign-in is a convenience, not the product, and the demo does not depend on it. If
it is not solid on the day (the team's call, 8 Oct: decide by the end of the rehearsal),
turn it off. Delete the `VITE_DEMO_SHELL=1` line from `web/.env.development.local` and
restart `./run dev`. Nothing else changes: no revert, no rebuild of anything else, and a production
build never had it. The script above then runs exactly as written, from the token prompt,
with Noor in a second tab because she and Jane share the Student slot. To show where the
diary lives inside Alumable, put the Figma frames in the slides before the live demo: the
Home feed's Reflection Diary card, the My gigs sheet, the Learn tab and the Profile's Record
tab (`docs/Design-Inventory.md`, the `host app` rows).
