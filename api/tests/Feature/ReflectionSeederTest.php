<?php

namespace Tests\Feature;

use App\Models\Gig;
use App\Models\Reflection;
use App\Models\ReflectionEntry;
use App\Models\User;
use Database\Seeders\ReflectionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The demo data is what the client sees and what every screen ticket is
 * built against, so the properties it is supposed to have are asserted
 * here rather than eyeballed once and assumed forever.
 *
 * Deliberately few tests for the number of assertions. The seeder makes
 * around three hundred writes and setUp re-runs it for every test in the
 * class, so one test per property would add three minutes to a suite
 * people run all day. They are grouped by theme instead.
 */
class ReflectionSeederTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ReflectionSeeder::class);
    }

    private function user(string $name): User
    {
        return User::where('display_name', $name)->firstOrFail();
    }

    /**
     * Every state a screen has to render, in one place. A screen with no
     * row behind it gets built against an empty state and nothing else,
     * which is how the loading and error paths end up as the only ones
     * anybody has seen.
     */
    public function test_it_seeds_every_state_a_screen_has_to_render(): void
    {
        $byStatus = Reflection::query()
            ->selectRaw('status, COUNT(*) AS n')
            ->groupBy('status')
            ->pluck('n', 'status');

        foreach (['draft', 'submitted', 'assessed'] as $status) {
            $this->assertGreaterThan(0, $byStatus[$status] ?? 0, "nothing is $status");
        }

        // Both rubrics, and their two different scales. The radar takes
        // axes and scale as props, and this is what proves it has to.
        $scales = DB::table('v_radar')->distinct()->pluck('scale_max', 'framework_key');
        $this->assertSame(4, (int) $scales['latrobe6']);
        $this->assertSame(7, (int) $scales['sfia9']);

        $this->assertGreaterThan(0, ReflectionEntry::has('evidence')->count());
        $this->assertGreaterThan(0, ReflectionEntry::doesntHave('evidence')->count());

        // scripts/smoke.sh writes a reflection as Jane on the first
        // sprint of this gig she has not used. Filling all three would
        // turn its whole write path into a skipped warning, and the run
        // would still say it passed.
        $gig = Gig::where('title', 'Develop AI use cases')->firstOrFail();
        $used = Reflection::where('user_id', $this->user('Jane N')->id)->pluck('sprint_id');
        $this->assertGreaterThan(0, $gig->sprints()->whereNotIn('id', $used)->count());
    }

    /**
     * The whole point of a hidden ability profile. Uniform random levels
     * give a radar that says nothing, and these three shapes are what
     * makes the calibration view worth opening at all.
     */
    public function test_the_scores_are_shaped_rather_than_random(): void
    {
        $gap = fn (string $name) => (float) DB::table('v_calibration_gap')
            ->where('user_id', $this->user($name)->id)
            ->whereNotNull('gap')
            ->avg('gap');

        $this->assertGreaterThanOrEqual(1.5, $gap('Tom H'), 'Tom is meant to be the over-confident one');
        $this->assertLessThanOrEqual(0.5, abs($gap('Priya R')), 'Priya is meant to be well calibrated');

        // Jane improves, and her optimism shrinks as she does. Sprint 2
        // sits closer to her assessor than sprint 1 did.
        $janeBySprint = DB::table('v_calibration_gap')
            ->join('sprints', 'sprints.id', '=', 'v_calibration_gap.sprint_id')
            ->join('gigs', 'gigs.id', '=', 'v_calibration_gap.gig_id')
            ->where('v_calibration_gap.user_id', $this->user('Jane N')->id)
            ->where('gigs.title', 'Develop AI use cases')
            ->whereNotNull('gap')
            ->groupBy('sprints.ordinal')
            ->orderBy('sprints.ordinal')
            ->pluck(DB::raw('AVG(gap)'), 'sprints.ordinal');

        $this->assertCount(2, $janeBySprint);
        $this->assertLessThan(
            (float) $janeBySprint[1],
            (float) $janeBySprint[2],
            'Jane is meant to be calibrating better as she goes',
        );
    }

    /**
     * Not lorem, and not a placeholder. These are read aloud at the
     * client demo, so the bar is that they are sentences somebody wrote.
     */
    public function test_the_narratives_are_written_prose(): void
    {
        $narratives = ReflectionEntry::whereNotNull('narrative')->pluck('narrative');

        $this->assertGreaterThan(40, $narratives->count());

        foreach ($narratives as $narrative) {
            $this->assertGreaterThan(100, strlen($narrative), "too short to be a reflection: $narrative");
            $this->assertStringNotContainsStringIgnoringCase('lorem', $narrative);
            $this->assertMatchesRegularExpression('/\.$/', trim($narrative), 'not a finished sentence');
        }

        $this->assertGreaterThan(20, $narratives->unique()->count(), 'the same paragraph everywhere is one narrative');
    }

    /**
     * The seed is built by calling ReflectionCreator, SubmitGate and
     * Scoring rather than by inserting rows, so the rules should be
     * legible in what came out. If any of these fail, the seeder has
     * started writing rows the API could not have produced.
     */
    public function test_the_rules_that_wrote_it_are_visible_in_the_rows(): void
    {
        // Being marked down without a reason is the one thing this
        // product must not do, so the seed has to exercise it rather
        // than only a test that constructs it.
        $this->assertGreaterThan(
            0,
            DB::table('v_calibration_gap')->where('gap', '>', 0)->count(),
            'nothing was marked down, so the comment rule is never seen',
        );

        $this->assertSame(0, DB::table('scores')
            ->where('scorer_role', '!=', 'self')
            ->where(fn ($q) => $q->whereNull('comment')->orWhere('comment', ''))
            ->count(), 'both seeded rubrics require a comment on every counter-score');

        // gig_key and sprint_key are database-generated, and MySQL
        // refuses a write to either with error 3105, so a seeder that
        // touched them would not have got this far. The assertion is on
        // $fillable, which is the thing that would let it happen.
        foreach (['gig_key', 'sprint_key'] as $column) {
            $this->assertNotContains($column, (new Reflection)->getFillable());
        }

        $this->assertSame(0, DB::table('reflections')
            ->whereColumn('gig_key', '!=', 'gig_id')
            ->orWhereColumn('sprint_key', '!=', 'sprint_id')
            ->count(), 'a generated key disagrees with the column it is generated from');

        // A record created, submitted and assessed in the same second
        // reads as fake the moment anyone opens the history sheet.
        $timeline = DB::table('reflections')
            ->join('reflection_entries', 'reflection_entries.reflection_id', '=', 'reflections.id')
            ->join('scores', 'scores.reflection_entry_id', '=', 'reflection_entries.id')
            ->where('reflections.status', 'assessed')
            ->where('scores.scorer_role', '!=', 'self')
            ->select('reflections.created_at', 'reflections.submitted_at', 'scores.scored_at')
            ->get();

        $this->assertNotEmpty($timeline);
        $now = now()->format('Y-m-d H:i:s');

        foreach ($timeline as $row) {
            $this->assertLessThan($row->submitted_at, $row->created_at, 'submitted before it was written');
            $this->assertLessThan($row->scored_at, $row->submitted_at, 'scored before it was submitted');
            $this->assertLessThan($now, $row->scored_at, 'scored in the future');
        }
    }

    /**
     * The two views that have nothing to show unless somebody is at an
     * awkward stage: a worklist needs a part-scored row and coverage
     * needs a student who has barely started. Everyone with an assessed
     * reflection has been scored on all six.
     */
    public function test_the_worklist_and_the_coverage_view_have_something_to_show(): void
    {
        Sanctum::actingAs($this->user('Sam O'));
        $queue = $this->getJson('/api/v1/review-queue')->assertOk()->json();

        $this->assertNotEmpty($queue, "the assessor's worklist is empty, so the screen has nothing to show");

        $partial = array_filter($queue, fn ($row) => $row['progress']['scored_by_me'] > 0
            && $row['progress']['scored_by_me'] < $row['progress']['entries']);

        $this->assertNotEmpty($partial, 'nothing is part-way through, so the progress column is always 0 of 6');

        $this->assertGreaterThan(0, DB::table('v_coverage_gaps')->where('user_id', $this->user('Noor A')->id)->count());
        $this->assertSame(0, DB::table('v_coverage_gaps')->where('user_id', $this->user('Tom H')->id)->count());
    }

    /**
     * Five people share the instance, so a second run has to be a no-op
     * rather than a second copy of the demo.
     */
    public function test_it_is_idempotent(): void
    {
        $before = [Reflection::count(), ReflectionEntry::count(), DB::table('scores')->count(), DB::table('evidence')->count()];

        $this->seed(ReflectionSeeder::class);

        $after = [Reflection::count(), ReflectionEntry::count(), DB::table('scores')->count(), DB::table('evidence')->count()];

        $this->assertSame($before, $after);
    }
}
