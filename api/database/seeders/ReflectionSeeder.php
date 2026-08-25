<?php

namespace Database\Seeders;

use App\Models\Competency;
use App\Models\Gig;
use App\Models\Level;
use App\Models\Reflection;
use App\Models\ReflectionEntry;
use App\Models\Sprint;
use App\Models\User;
use App\Services\ReflectionCreator;
use App\Services\RoleResolver;
use App\Services\Scoring;
use App\Services\SubmitGate;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The record itself: nine reflections across draft, submitted and
 * assessed, with shaped scores and written narratives.
 *
 * Separate from DemoSeeder on purpose. DemoSeeder is the cast — people,
 * gigs, sprints, roles, rubrics and the three tokens — and ten feature
 * tests use it as their fixture, building the reflection they are about
 * to assert on themselves. Reflections seeded into that fixture would
 * collide with every one of them on the one-reflection-per-context
 * unique index. So the cast stays where the tests can rely on it and the
 * record lives here, where only the demo and the screens need it.
 * `php artisan db:seed` runs both. See ADR #37.
 *
 * Nothing here writes gig_key or sprint_key. Reflections are built by
 * calling ReflectionCreator, SubmitGate and Scoring rather than by
 * inserting rows, so the seed obeys the submit gate, the comment rule
 * and the level-in-competency rule by construction, and follows them if
 * they change. It also means every reflection arrives with its events
 * already written, so the history sheet has something to show.
 *
 * Idempotent. A reflection that already exists for a student and sprint
 * is left alone, and each one is built inside a transaction so a run
 * that fails halfway leaves nothing for the next run to trip over.
 */
class ReflectionSeeder extends Seeder
{
    private const LATROBE_GIG = 'Develop AI use cases';

    private const SFIA_GIG = 'Data migration audit';

    /**
     * The three classmates. Jane, Sam and Dr Lee come from DemoSeeder;
     * these exist so the cohort views have a cohort and so the three
     * calibration shapes below have three people to belong to.
     *
     * On the La Trobe gig only. Sam assesses that gig and not the other,
     * which is what makes GET /gigs provably scoped to the caller, and
     * putting everyone on everything would quietly undo it.
     */
    private const CLASSMATES = ['Priya R', 'Tom H', 'Noor A'];

    /**
     * Every reflection, and the shape of the scores on it.
     *
     * `ability` is the student's hidden true level per competency, in
     * rubric position order. `self_bias` is how far above it they rate
     * themselves and `counter_nudge` is where the assessor disagrees
     * with the truth. Self and counter are derived from those, clamped
     * to the levels the competency actually has, so the calibration gap
     * is the difference between the two arrays and is a deliberate
     * shape rather than noise:
     *
     *   Jane   improves across sprints, and her optimism shrinks as she
     *          gets better, which is the story the progress chart tells.
     *   Priya  is well calibrated. Her polygons almost coincide.
     *   Tom    is consistently two levels over-confident.
     *   Noor   has barely started, so she is the coverage-gaps case.
     *
     * `countered` is how many entries carry a counter-score. Six flips
     * the reflection to assessed; anything less leaves it submitted and
     * in somebody's review queue, which is what the worklist needs to
     * have a partly-done row on it.
     */
    private const PLAN = [
        // --- Jane, on the La Trobe rubric. Sprint 3 is deliberately
        // left free: scripts/smoke.sh writes a reflection as Jane on the
        // first free sprint of this gig, and needs one to exist.
        [
            'student' => 'Jane N', 'gig' => self::LATROBE_GIG, 'sprint' => 1,
            'status' => 'assessed', 'counter_by' => 'Sam O',
            'ability' => [2, 2, 2, 1, 2, 1],
            'self_bias' => [1, 1, 1, 1, 0, 1],
            'counter_nudge' => [0, 0, 0, 0, 0, 0],
            'narratives' => 0, 'evidence' => [0, 3],
        ],
        [
            'student' => 'Jane N', 'gig' => self::LATROBE_GIG, 'sprint' => 2,
            'status' => 'assessed', 'counter_by' => 'Sam O',
            'ability' => [3, 3, 2, 2, 3, 2],
            'self_bias' => [0, 1, 0, 1, 0, 0],
            'counter_nudge' => [0, 0, 1, 0, 0, 0],
            'narratives' => 1, 'evidence' => [1],
        ],

        // --- Priya, the calibrated one. Her second sprint is scored by
        // Dr Lee rather than Sam, because a supervisor's counter-score
        // is a counter-score and the radar has to prove it.
        [
            'student' => 'Priya R', 'gig' => self::LATROBE_GIG, 'sprint' => 1,
            'status' => 'assessed', 'counter_by' => 'Sam O',
            'ability' => [3, 2, 3, 2, 2, 2],
            'self_bias' => [0, 0, 0, 1, 0, 0],
            'counter_nudge' => [0, 0, 0, 0, 0, 0],
            'narratives' => 1, 'evidence' => [2],
        ],
        [
            'student' => 'Priya R', 'gig' => self::LATROBE_GIG, 'sprint' => 2,
            'status' => 'assessed', 'counter_by' => 'Dr Lee',
            'ability' => [3, 3, 3, 3, 2, 2],
            'self_bias' => [0, 0, 0, 0, 0, 1],
            'counter_nudge' => [0, 0, 0, 0, 1, 0],
            'narratives' => 2, 'evidence' => [],
        ],

        // --- Tom, the over-confident one. Every counter-score on his
        // first sprint is below his own, so every one of them carries
        // the comment the rule demands.
        [
            'student' => 'Tom H', 'gig' => self::LATROBE_GIG, 'sprint' => 1,
            'status' => 'assessed', 'counter_by' => 'Sam O',
            'ability' => [2, 1, 2, 2, 1, 1],
            'self_bias' => [2, 2, 1, 2, 2, 2],
            'counter_nudge' => [0, 0, 0, 0, 0, 0],
            'narratives' => 2, 'evidence' => [0],
        ],
        [
            'student' => 'Tom H', 'gig' => self::LATROBE_GIG, 'sprint' => 2,
            'status' => 'submitted', 'counter_by' => 'Sam O', 'countered' => 2,
            'ability' => [2, 2, 2, 2, 1, 1],
            'self_bias' => [2, 1, 2, 1, 2, 2],
            'counter_nudge' => [0, 0, 0, 0, 0, 0],
            'narratives' => 0, 'evidence' => [],
        ],

        // --- Noor, three days in. Three narratives written, two of them
        // scored, nothing submitted. Four competencies she has never
        // been scored on, which is what v_coverage_gaps exists to find.
        [
            'student' => 'Noor A', 'gig' => self::LATROBE_GIG, 'sprint' => 1,
            'status' => 'draft', 'written' => 3, 'self_scored' => 2,
            'ability' => [2, 2, 1, 1, 1, 1],
            'self_bias' => [1, 0, 0, 0, 0, 0],
            'counter_nudge' => [0, 0, 0, 0, 0, 0],
            'narratives' => 1, 'evidence' => [0],
        ],

        // --- Jane again, on SFIA. Seven-point scale, different axis
        // labels, no assessor on the gig, so Dr Lee counter-scores as
        // supervisor. This is the pair that proves the radar is driven
        // by the framework rather than hardcoded to six axes and four
        // levels.
        [
            'student' => 'Jane N', 'gig' => self::SFIA_GIG, 'sprint' => 1,
            'status' => 'assessed', 'counter_by' => 'Dr Lee',
            'ability' => [4, 3, 3, 4, 3, 4],
            'self_bias' => [1, 1, 0, 1, 1, 0],
            'counter_nudge' => [0, 0, 0, -1, 0, 0],
            'narratives' => 0, 'evidence' => [0, 2],
        ],
        [
            'student' => 'Jane N', 'gig' => self::SFIA_GIG, 'sprint' => 2,
            'status' => 'submitted', 'countered' => 0,
            'ability' => [4, 4, 3, 4, 4, 4],
            'self_bias' => [1, 0, 1, 0, 1, 0],
            'counter_nudge' => [0, 0, 0, 0, 0, 0],
            'narratives' => 1, 'evidence' => [4],
        ],
    ];

    public function run(): void
    {
        // The cast this depends on, and idempotent, so seeding the
        // record on a fresh database is one command rather than two.
        $this->call(DemoSeeder::class);

        $this->enrolClassmates();

        foreach (self::PLAN as $spec) {
            $this->build($spec);
        }
    }

    private function enrolClassmates(): void
    {
        $gig = Gig::where('title', self::LATROBE_GIG)->firstOrFail();

        foreach (self::CLASSMATES as $name) {
            $user = User::firstOrCreate(['display_name' => $name]);

            $gig->participants()->firstOrCreate(['user_id' => $user->id, 'role' => 'student']);
        }
    }

    /**
     * @param  array<string, mixed>  $spec
     */
    private function build(array $spec): void
    {
        $student = User::where('display_name', $spec['student'])->firstOrFail();
        $gig = Gig::where('title', $spec['gig'])->firstOrFail();
        $sprint = $gig->sprints()->where('ordinal', $spec['sprint'])->firstOrFail();

        // The one-reflection-per-context rule means this is the whole of
        // idempotency: if she has written on this sprint, this spec has
        // already run. Checked before anything is created, and the build
        // is a transaction, so the two states are "absent" and "whole".
        $exists = Reflection::where('user_id', $student->id)
            ->where('sprint_id', $sprint->id)
            ->exists();

        if ($exists) {
            return;
        }

        DB::transaction(fn () => $this->write($spec, $student, $gig, $sprint));

        $this->command?->info(sprintf(
            '%-8s %-22s sprint %d  %s',
            $student->display_name, $gig->title, $sprint->ordinal, $spec['status'],
        ));
    }

    /**
     * @param  array<string, mixed>  $spec
     */
    private function write(array $spec, User $student, Gig $gig, Sprint $sprint): void
    {
        $reflection = app(ReflectionCreator::class)->create($student, null, $sprint->id);

        // ReflectionCreator creates one entry per competency; sorting by
        // rubric position is what lines them up with the ability arrays.
        $entries = $reflection->entries()->with('competency.levels')->get()
            ->sortBy(fn (ReflectionEntry $e) => $e->competency->position)
            ->values();

        $written = $spec['written'] ?? $entries->count();
        $scored = $spec['self_scored'] ?? $entries->count();

        foreach ($entries as $i => $entry) {
            if ($i < $written) {
                $entry->update([
                    'narrative' => $this->narrative($entry->competency->code, $spec['narratives']),
                ]);
            }

            if (in_array($i, $spec['evidence'], true) && $i < $written) {
                $this->attachEvidence($entry, $i);
            }

            if ($i < $scored) {
                app(Scoring::class)->selfScore(
                    $entry, $student, $this->levelAt($entry->competency, $this->selfLevel($spec, $i)),
                );
            }
        }

        if ($spec['status'] !== 'draft') {
            app(SubmitGate::class)->submit($reflection, $student);

            $this->counterScore($spec, $gig, $entries);
        }

        $this->backdate($reflection->fresh(), $sprint);
    }

    /**
     * @param  array<string, mixed>  $spec
     * @param  Collection<int, ReflectionEntry>  $entries
     */
    private function counterScore(array $spec, Gig $gig, $entries): void
    {
        $countered = $spec['countered'] ?? $entries->count();

        if ($countered === 0) {
            return;
        }

        $scorer = User::where('display_name', $spec['counter_by'])->firstOrFail();

        // Resolved from gig_participants, never chosen here. A seeder
        // that named the role would be the one place in the codebase
        // where a role is asserted rather than looked up, and the first
        // place it would go stale.
        $role = app(RoleResolver::class)->for($scorer, $gig);

        foreach ($entries->take($countered) as $i => $entry) {
            $self = $this->selfLevel($spec, $i);
            $counter = $spec['ability'][$i] + $spec['counter_nudge'][$i];

            app(Scoring::class)->counterScore(
                $entry,
                $scorer,
                $role,
                $this->levelAt($entry->competency, $counter),
                $this->comment($self, $counter, $i),
            );
        }
    }

    /**
     * @param  array<string, mixed>  $spec
     */
    private function selfLevel(array $spec, int $i): int
    {
        return $spec['ability'][$i] + $spec['self_bias'][$i];
    }

    /**
     * Clamped to the levels this competency actually carries. SFIA
     * skills are meant to span part of the seven-point scale rather
     * than all of it, so a profile that reaches past the top of one is
     * a scale the rubric does not offer, not a score.
     */
    private function levelAt(Competency $competency, int $value): Level
    {
        $levels = $competency->levels;
        $clamped = max($levels->min('level_value'), min($levels->max('level_value'), $value));

        return $levels->firstWhere('level_value', $clamped);
    }

    private function attachEvidence(ReflectionEntry $entry, int $i): void
    {
        if ($entry->evidence()->exists()) {
            return;
        }

        $entry->evidence()->create(self::EVIDENCE[$i % count(self::EVIDENCE)]);
    }

    /**
     * Everything happening in the same second reads as fake the moment
     * anyone opens the history sheet, so each reflection is dated
     * against its own sprint. Clamped to the past: sprint 2 is still
     * open, and a reflection assessed next Tuesday is worse than one
     * assessed this second.
     *
     * Written through the query builder rather than the model because
     * created_at is not fillable and should not become fillable for
     * this. Only the four timestamp columns are named, so the generated
     * gig_key and sprint_key are not touched.
     */
    private function backdate(Reflection $reflection, Sprint $sprint): void
    {
        $opens = Carbon::parse($sprint->opens_on)->setTime(9, 30);
        $closes = Carbon::parse($sprint->due_on)->setTime(17, 0);

        // Spread across however much of the sprint has actually
        // happened, rather than at fixed day offsets. Sprint 2 is still
        // open, and a fixed eleven days puts its submission next
        // Tuesday. Clamping those offsets instead collapses created,
        // submitted and scored onto the same second, which is the thing
        // this method exists to avoid.
        $elapsed = max(0, (int) $opens->diffInSeconds($closes->min(now()->subHour())));

        // Nudged per student, so four people do not submit in the same
        // second and the worklist has a real order to sort by. Derived
        // from the name rather than the id, because ids differ per
        // database and everyone's copy of the demo should look the same.
        // At most 0.05, which keeps the last step below the clamp above.
        $nudge = (crc32($reflection->owner->display_name) % 100) / 2000;
        $at = fn (float $through) => $opens->copy()->addSeconds((int) round($elapsed * ($through + $nudge)));

        $created = $at(0.10);
        $submitted = $reflection->submitted_at === null ? null : $at(0.85);

        DB::table('reflections')->where('id', $reflection->id)->update([
            'created_at' => $created,
            'updated_at' => $submitted ?? $created,
            'submitted_at' => $submitted,
        ]);

        DB::table('scores')
            ->whereIn('reflection_entry_id', $reflection->entries()->select('id'))
            ->where('scorer_role', 'self')
            ->update(['scored_at' => $at(0.70)]);

        DB::table('scores')
            ->whereIn('reflection_entry_id', $reflection->entries()->select('id'))
            ->where('scorer_role', '!=', 'self')
            ->update(['scored_at' => $at(0.95)]);

        DB::table('events')->where('reflection_id', $reflection->id)->update([
            'occurred_at' => $submitted ?? $created,
        ]);
    }

    private function narrative(string $code, int $offset): string
    {
        $pool = self::NARRATIVES[$code];

        return $pool[$offset % count($pool)];
    }

    /**
     * Both seeded rubrics set comment_required, so every counter-score
     * carries one. Shaped by the gap rather than by the competency,
     * because that is what an assessor is actually writing about: why
     * their number differs from the student's.
     */
    private function comment(int $self, int $counter, int $i): string
    {
        $pool = match (true) {
            $counter < $self => self::COMMENTS_LOWER,
            $counter > $self => self::COMMENTS_HIGHER,
            default => self::COMMENTS_LEVEL,
        };

        return $pool[$i % count($pool)];
    }

    // -----------------------------------------------------------------
    // The prose. Kept at the bottom because it is the longest part of
    // the file and the least interesting to read while following the
    // logic above.
    //
    // Written by hand, one pool per competency, because these are read
    // aloud at the client demo and shown in screenshots. Generated text
    // undermines every screen it appears on, and a narrative that does
    // not match the competency it sits under is worse than none. The
    // pools are reused across students, which is what the seed-data
    // skill asks for: enough of them that no two neighbouring
    // reflections read the same, not one per entry.
    // -----------------------------------------------------------------

    /** @var array<string, list<string>> */
    private const NARRATIVES = [
        // La Trobe six-competency.
        'contribution' => [
            'I took the reflection importer from a stub to something that runs nightly. The part I misjudged was the encoding: three of the exports came out of the host platform as UTF-16 and I lost most of a day before I thought to check the byte order mark rather than the parser.',
            'My share of the sprint was the scoring endpoint and its tests. The endpoint was done on Tuesday and the tests took two more days, which felt slow at the time, except that two of them caught a level from the wrong competency being accepted.',
            'I picked up the two tickets nobody wanted, the export polling and the error envelope, because both were blocking someone else. Neither was interesting and both were finished on time.',
        ],
        'communication' => [
            'I wrote the client update this sprint. My first draft was a list of what we had done, and Priya pointed out that the client cannot tell from a list whether we are on track, so I rewrote it around the two dates they actually care about.',
            'When I could not reproduce the bug Tom reported I stopped messaging back and forth and asked him to share his screen for ten minutes. It was a stale token in his environment, which no amount of writing would have found.',
            'I explained the framework-copy rule to the client badly the first time, as a restriction on what they could do. Rephrasing it as "a rubric someone has already been scored against cannot change underneath them" got agreement in one sentence.',
        ],
        'collaboration' => [
            'Sam and I disagreed about whether a counter-score should be editable. Rather than argue it in the standup I wrote both cases down as two short paragraphs and we picked one in five minutes.',
            'I paired with Noor on the radar for an afternoon. She was faster than me at the layout and I knew the shape of the data, so we swapped the keyboard at the point where the two met rather than splitting it into two tickets.',
            'I reviewed three pull requests and left comments on all three. On one of them I was wrong about the cause, and I said so in the thread instead of quietly deleting the comment.',
        ],
        'agile' => [
            'We were carrying four half-finished tickets into every sprint. I proposed we start nothing new until two of them closed. It was uncomfortable for about a week and then it stopped being a problem.',
            'Our estimates were consistently half of what the work took. I logged actual hours against three tickets and the pattern was clear: we were estimating the writing and never the review and the rework.',
            'The retro kept producing actions nobody owned. I started writing each one on the board as a name and a date, and the next retro was the first one where we could say what had actually changed.',
        ],
        'continuous' => [
            'When the tagger kept mis-classifying reflections I stopped tuning prompts and checked the rubric mapping instead, which turned out to be the real fault.',
            'I had been running the same four commands before every push and getting one of them wrong about half the time. Putting them in a script took twenty minutes and has already caught two failures before CI did.',
            'I read back through my own reflections from the first two sprints. The thing I keep writing down and not fixing is that I start changing code before I have read what is already there.',
        ],
        'leadership' => [
            'Nobody owned the shared database and everybody was slightly afraid of it. I wrote down the three rules we were all half-following and put them where the others would see them. That is not leadership exactly, but the migrations stopped colliding.',
            'I noticed a week out that the client demo had no data behind it, and raised it then rather than the day before. It was not my ticket and I did not end up doing the work, but it got done in time.',
            'I chaired the standup for the fortnight our supervisor was away. My mistake was letting the first one run to twenty minutes; holding it to ten after that meant cutting people off, which I found harder than the work.',
        ],

        // SFIA 9, on the data migration audit.
        'PROG' => [
            'I wrote the reconciliation script that compares row counts and checksums between the old schema and the new one. It is not clever code, but it runs in eleven minutes over four million rows and it has already found two silent truncations.',
            'I rewrote the migration batcher after the first version held a transaction open for forty minutes. Chunking at ten thousand rows made it slower overall and made it safe to stop halfway, which was the property that mattered.',
        ],
        'DESN' => [
            'I argued for keeping the legacy identifiers as a column on the new tables rather than mapping them in a side table. It costs storage, and it takes one join out of every reconciliation query we will run for the next two years.',
            'My first design had the audit log writing synchronously inside the migration, which made the migration throughput a function of the log throughput. I moved it out and accepted that the log can lag behind by a few seconds.',
        ],
        'TEST' => [
            'I wrote the test for the case we actually hit in staging: a row present in both databases with a different collation, which MySQL compares as equal and the reconciliation script compares as different.',
            'I stopped testing only the happy path. Half of what I added this sprint asserts what happens when the source row is missing, which the old importer handled by logging and carrying on.',
        ],
        'DATM' => [
            'I catalogued which of the forty-one tables carry personal data and which do not, because the retention rules differ and nobody had written it down. Six of them were not what the previous team had assumed.',
            'The archived tables turned out to have no retention date at all, only a created date. That is the difference between "we delete this after seven years" and "we have never deleted anything".',
        ],
        'RLMT' => [
            'The records office asked for a guarantee that we would not lose a row. What they needed was to be able to prove afterwards that we had not, which is a different thing and much cheaper to build.',
            'I gave the weekly update to a group who did not want the technical detail. Leading with the one number they cared about, rows still to migrate, made the rest of the update optional rather than ignored.',
        ],
        'METL' => [
            'I moved the migration runbook out of a chat thread and into the repository so the steps travel with the code they describe. The first person to use it found two steps that had only ever existed in somebody\'s head.',
            'I added a dry-run flag to the migration tool. It has been used more often than the real run, which is the point of it.',
        ],
    ];

    /** @var list<string> */
    private const COMMENTS_LOWER = [
        'What you describe here did happen, but it happened once. The level you have chosen asks for it to be how you usually work, and I did not see that this sprint.',
        'You have written about the outcome rather than about your part in it. On the evidence in front of me this sits a level lower. Tell me what you personally decided next time and I may well disagree with myself.',
        'Close. The level above this one asks you to have lifted someone else\'s work as well as your own, and that is not in the evidence yet.',
        'I am marking this down because the two examples you give are the same example described twice. One instance is genuinely the level below.',
    ];

    /** @var list<string> */
    private const COMMENTS_LEVEL = [
        'Agreed, and the example you picked is the one I would have picked.',
        'This matches what I saw. Keep the specifics in, they are what make the score easy to justify later.',
        'Same level from me. The evidence you attached does most of the work here.',
    ];

    /** @var list<string> */
    private const COMMENTS_HIGHER = [
        'You have undersold this. What you describe is the level above, and the pull request backs it up.',
        'I have put this one higher than you did. Asking for the review before it was finished is exactly what the descriptor above is describing.',
    ];

    /** @var list<array<string, string>> */
    private const EVIDENCE = [
        ['kind' => 'link', 'label' => 'The pull request', 'uri' => 'https://github.com/theintonerzero/cse3cap/pull/13'],
        ['kind' => 'link', 'label' => 'Client update, week 4', 'uri' => 'https://example.org/alumable/updates/week-4'],
        ['kind' => 'link', 'label' => 'Retro board after the change', 'uri' => 'https://example.org/alumable/retro/sprint-2'],
        ['kind' => 'link', 'label' => 'The reconciliation report', 'uri' => 'https://example.org/latrobe-it/audit/reconciliation.html'],
        ['kind' => 'link', 'label' => 'Runbook, in the repository now', 'uri' => 'https://example.org/latrobe-it/runbook'],
    ];
}
