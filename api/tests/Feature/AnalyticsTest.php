<?php

namespace Tests\Feature;

use App\Models\Framework;
use App\Models\Gig;
use App\Models\Reflection;
use App\Models\Sprint;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Analytics reads the views, so these tests are as much about the SQL as
 * about the controllers. Fixtures are built through the API wherever
 * possible, so a rule broken upstream shows up here too.
 */
class AnalyticsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoSeeder::class);
    }

    private function user(string $name): User
    {
        return User::where('display_name', $name)->firstOrFail();
    }

    /**
     * A submitted reflection on one sprint, self-scored at $self, with an
     * optional counter-score from $counterAs at $counter.
     */
    private function scoredSprint(Sprint $sprint, int $self, ?int $counter = null, string $counterAs = 'Sam O'): Reflection
    {
        Sanctum::actingAs($this->user('Jane N'));

        $reflection = Reflection::findOrFail(
            $this->postJson('/api/v1/reflections', ['sprint_id' => $sprint->id])->json('id')
        );

        foreach ($reflection->entries()->with('competency.levels')->get() as $entry) {
            $this->patchJson("/api/v1/entries/{$entry->id}", ['narrative' => 'Done.']);
            $this->putJson("/api/v1/entries/{$entry->id}/scores/self", [
                'level_id' => $entry->competency->levels->firstWhere('level_value', $self)->id,
            ])->assertOk();
        }

        $this->postJson("/api/v1/reflections/{$reflection->id}/submit")->assertOk();

        if ($counter !== null) {
            Sanctum::actingAs($this->user($counterAs));
            foreach ($reflection->entries()->with('competency.levels')->get() as $entry) {
                $this->postJson("/api/v1/entries/{$entry->id}/scores", [
                    'level_id' => $entry->competency->levels->firstWhere('level_value', $counter)->id,
                    'comment' => 'Noted.',
                ])->assertStatus(201);
            }
            Sanctum::actingAs($this->user('Jane N'));
        }

        return $reflection->fresh();
    }

    private function sprint(int $ordinal, string $gig = 'Develop AI use cases'): Sprint
    {
        return Gig::where('title', $gig)->firstOrFail()
            ->sprints()->where('ordinal', $ordinal)->firstOrFail();
    }

    public function test_the_radar_shows_every_axis_even_before_anything_is_scored(): void
    {
        Sanctum::actingAs($this->user('Jane N'));
        $this->postJson('/api/v1/reflections', ['sprint_id' => $this->sprint(1)->id])->assertStatus(201);

        $this->getJson('/api/v1/me/radar')
            ->assertOk()
            ->assertJsonPath('framework.fw_key', 'latrobe6')
            ->assertJsonPath('framework.scale_min', 1)
            ->assertJsonPath('framework.scale_max', 4)
            ->assertJsonCount(6, 'axes')
            ->assertJsonPath('axes.0.self', null)
            ->assertJsonPath('axes.0.counter', null);
    }

    public function test_the_radar_reports_self_and_counter_with_the_role_that_gave_it(): void
    {
        $this->scoredSprint($this->sprint(1), self: 4, counter: 2);

        $body = $this->getJson('/api/v1/me/radar')->assertOk()->json();

        $this->assertCount(6, $body['axes']);
        foreach ($body['axes'] as $axis) {
            $this->assertSame(4, $axis['self']);
            $this->assertSame(2, $axis['counter']);
            $this->assertSame('assessor', $axis['counter_role'], 'the class is counter, the role names who');
        }
    }

    /**
     * ADR #23. A supervisor's counter-score is a counter-score, and the
     * old view discarded it entirely.
     */
    public function test_a_supervisors_counter_score_counts_as_much_as_an_assessors(): void
    {
        $this->scoredSprint($this->sprint(1), self: 4, counter: 2, counterAs: 'Dr Lee');

        $axis = $this->getJson('/api/v1/me/radar')->assertOk()->json('axes.0');

        $this->assertSame(2, $axis['counter']);
        $this->assertSame('supervisor', $axis['counter_role']);
    }

    public function test_a_sprint_scope_shows_that_sprint_rather_than_the_latest(): void
    {
        $first = $this->scoredSprint($this->sprint(1), self: 2, counter: 2);
        $this->scoredSprint($this->sprint(2), self: 4, counter: 4);

        // Unscoped: the most recent reflection wins.
        $this->getJson('/api/v1/me/radar')->assertOk()->assertJsonPath('axes.0.self', 4);

        // Scoped to the first sprint: the earlier numbers.
        $this->getJson("/api/v1/me/radar?sprint_id={$first->sprint_id}")
            ->assertOk()
            ->assertJsonPath('axes.0.self', 2)
            ->assertJsonPath('scope.sprint_id', $first->sprint_id);
    }

    /**
     * A student on two gigs can be scored against two rubrics whose codes
     * do not overlap, so an unscoped radar has to pick one framework or
     * draw twelve meaningless axes.
     */
    public function test_an_unscoped_radar_picks_one_framework_and_says_which(): void
    {
        $this->scoredSprint($this->sprint(1), self: 3, counter: 3);

        // A later reflection on the SFIA gig.
        Sanctum::actingAs($this->user('Jane N'));
        $sfiaGig = Gig::where('title', 'Data migration audit')->firstOrFail();
        $this->postJson('/api/v1/reflections', ['sprint_id' => $sfiaGig->sprints()->where('ordinal', 1)->firstOrFail()->id])
            ->assertStatus(201);

        $body = $this->getJson('/api/v1/me/radar')->assertOk()->json();

        $this->assertSame('sfia9', $body['framework']['fw_key'], 'the most recent reflection decides');
        $this->assertSame(7, $body['framework']['scale_max'], 'and brings its own scale');
        $this->assertCount(6, $body['axes']);

        // Scoping to the other gig gets the other rubric back.
        $latrobeGig = Gig::where('title', 'Develop AI use cases')->firstOrFail();
        $this->getJson("/api/v1/me/radar?gig_id={$latrobeGig->id}")
            ->assertOk()
            ->assertJsonPath('framework.fw_key', 'latrobe6')
            ->assertJsonPath('framework.scale_max', 4);
    }

    public function test_progress_returns_one_series_per_competency_across_sprints(): void
    {
        $this->scoredSprint($this->sprint(1), self: 2, counter: 2);
        $this->scoredSprint($this->sprint(2), self: 4, counter: 3);

        $gig = Gig::where('title', 'Develop AI use cases')->firstOrFail();
        $body = $this->getJson("/api/v1/me/progress?gig_id={$gig->id}")->assertOk()->json();

        $this->assertCount(6, $body['competencies']);
        $series = $body['competencies'][0]['series'];
        $this->assertSame([1, 2], array_column($series, 'sprint_ordinal'), 'ordered by sprint');
        $this->assertSame([2, 4], array_column($series, 'self'));
        $this->assertSame([2, 3], array_column($series, 'counter'));
    }

    public function test_progress_needs_a_gig(): void
    {
        Sanctum::actingAs($this->user('Jane N'));

        $this->getJson('/api/v1/me/progress')
            ->assertStatus(400)->assertJsonPath('error.code', 'VALIDATION_FAILED');
    }

    public function test_calibration_reports_the_gap_and_who_caused_it(): void
    {
        $this->scoredSprint($this->sprint(1), self: 4, counter: 2);

        $rows = $this->getJson('/api/v1/me/calibration')->assertOk()->json();

        $this->assertCount(6, $rows);
        $this->assertSame(4, $rows[0]['self_level']);
        $this->assertSame(2, $rows[0]['counter_level']);
        $this->assertSame('assessor', $rows[0]['counter_role']);
        $this->assertSame(2, $rows[0]['gap'], 'positive means the student rated themselves higher');
    }

    public function test_the_gap_is_null_until_both_sides_have_scored(): void
    {
        $this->scoredSprint($this->sprint(1), self: 3);

        $rows = $this->getJson('/api/v1/me/calibration')->assertOk()->json();

        $this->assertSame(3, $rows[0]['self_level']);
        $this->assertNull($rows[0]['counter_level']);
        $this->assertNull($rows[0]['gap']);
    }

    public function test_coverage_lists_only_what_has_never_been_scored(): void
    {
        $reflection = $this->scoredSprint($this->sprint(1), self: 3);
        $framework = Framework::where('fw_key', 'latrobe6')->firstOrFail();

        // Self-scored counts as scored, so nothing is missing.
        $this->getJson("/api/v1/me/coverage?framework_id={$framework->id}")
            ->assertOk()->assertJsonCount(0);

        // Remove the scores from two entries and they reappear as gaps.
        $entries = $reflection->entries()->orderBy('id')->take(2)->get();
        foreach ($entries as $entry) {
            $entry->scores()->delete();
        }

        $gaps = $this->getJson("/api/v1/me/coverage?framework_id={$framework->id}")
            ->assertOk()->assertJsonCount(2)->json();

        $this->assertArrayHasKey('short_label', $gaps[0]);
        $this->assertLessThan($gaps[1]['position'], $gaps[0]['position'], 'ordered by rubric position');
    }

    /**
     * ADR #24. The old view crossed every user against every framework and
     * told an assessor they had six gaps in a rubric nobody scores them on.
     */
    public function test_a_non_student_has_no_coverage_gaps(): void
    {
        $framework = Framework::where('fw_key', 'latrobe6')->firstOrFail();

        Sanctum::actingAs($this->user('Sam O'));
        $this->getJson("/api/v1/me/coverage?framework_id={$framework->id}")
            ->assertOk()->assertJsonCount(0);
    }

    public function test_analytics_never_leak_another_students_numbers(): void
    {
        $this->scoredSprint($this->sprint(1), self: 4, counter: 2);

        // A second student on the same gig, with nothing written.
        $classmate = User::create(['display_name' => 'Another student']);
        Gig::where('title', 'Develop AI use cases')->firstOrFail()
            ->participants()->create(['user_id' => $classmate->id, 'role' => 'student']);

        Sanctum::actingAs($classmate);

        $this->getJson('/api/v1/me/calibration')->assertOk()->assertJsonCount(0);
        $this->getJson('/api/v1/me/radar')->assertStatus(404);
    }
}
