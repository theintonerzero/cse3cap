<?php

namespace Tests\Feature;

use App\Models\Competency;
use App\Models\Gig;
use App\Models\Reflection;
use App\Models\ReflectionEntry;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ScoringTest extends TestCase
{
    use RefreshDatabase;

    private Reflection $reflection;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoSeeder::class);
        $this->reflection = $this->submittedReflection();
    }

    private function user(string $name): User
    {
        return User::where('display_name', $name)->firstOrFail();
    }

    /** A reflection with every narrative and self-score in place, submitted. */
    private function submittedReflection(): Reflection
    {
        $jane = $this->user('Jane N');
        Sanctum::actingAs($jane);
        $gig = Gig::where('title', 'Develop AI use cases')->firstOrFail();

        $id = $this->postJson('/api/v1/reflections', [
            'sprint_id' => $gig->sprints()->orderBy('ordinal')->firstOrFail()->id,
        ])->json('id');

        $reflection = Reflection::findOrFail($id);

        foreach ($reflection->entries()->with('competency.levels')->get() as $entry) {
            $this->patchJson("/api/v1/entries/{$entry->id}", ['narrative' => 'What I did this sprint.']);
            $this->putJson("/api/v1/entries/{$entry->id}/scores/self", [
                'level_id' => $entry->competency->levels->firstWhere('level_value', 3)->id,
            ])->assertOk();
        }

        $this->postJson("/api/v1/reflections/{$reflection->id}/submit")->assertOk();

        return $reflection->fresh();
    }

    private function levelOf(ReflectionEntry $entry, int $value): string
    {
        return $entry->competency->levels->firstWhere('level_value', $value)->id;
    }

    private function entries(): Collection
    {
        return $this->reflection->entries()->with('competency.levels')->get();
    }

    public function test_the_self_score_is_an_upsert_not_a_second_row(): void
    {
        $jane = $this->user('Jane N');
        Sanctum::actingAs($jane);

        $gig = Gig::where('title', 'Data migration audit')->firstOrFail();
        $id = $this->postJson('/api/v1/reflections', ['gig_id' => $gig->id])->json('id');
        $entry = Reflection::findOrFail($id)->entries()->with('competency.levels')->firstOrFail();

        $this->putJson("/api/v1/entries/{$entry->id}/scores/self", ['level_id' => $this->levelOf($entry, 2)])
            ->assertOk()->assertJsonPath('level_value', 2);

        $this->putJson("/api/v1/entries/{$entry->id}/scores/self", ['level_id' => $this->levelOf($entry, 5)])
            ->assertOk()->assertJsonPath('level_value', 5);

        $this->assertSame(1, $entry->scores()->where('scorer_role', 'self')->count());
    }

    /**
     * The database cannot express this, so it has to hold in the
     * application or the radar shows a number nobody meant.
     */
    public function test_a_level_from_another_competency_is_refused_on_both_endpoints(): void
    {
        $entry = $this->entries()->first();
        $other = Competency::where('framework_id', $entry->competency->framework_id)
            ->where('id', '!=', $entry->competency_id)
            ->firstOrFail();
        $wrong = $other->levels()->firstOrFail()->id;

        Sanctum::actingAs($this->user('Sam O'));
        $this->postJson("/api/v1/entries/{$entry->id}/scores", ['level_id' => $wrong, 'comment' => 'x'])
            ->assertStatus(400)->assertJsonPath('error.code', 'LEVEL_NOT_IN_COMPETENCY');

        // And on the student's endpoint, via a fresh draft.
        Sanctum::actingAs($this->user('Jane N'));
        $gig = Gig::where('title', 'Data migration audit')->firstOrFail();
        $draft = Reflection::findOrFail($this->postJson('/api/v1/reflections', ['gig_id' => $gig->id])->json('id'));
        $draftEntry = $draft->entries()->with('competency')->firstOrFail();
        $otherInDraft = Competency::where('framework_id', $draft->framework_id)
            ->where('id', '!=', $draftEntry->competency_id)->firstOrFail();

        $this->putJson("/api/v1/entries/{$draftEntry->id}/scores/self", [
            'level_id' => $otherInDraft->levels()->firstOrFail()->id,
        ])->assertStatus(400)->assertJsonPath('error.code', 'LEVEL_NOT_IN_COMPETENCY');
    }

    public function test_a_draft_cannot_be_counter_scored(): void
    {
        Sanctum::actingAs($this->user('Jane N'));
        $gig = Gig::where('title', 'Data migration audit')->firstOrFail();
        $draft = Reflection::findOrFail($this->postJson('/api/v1/reflections', ['gig_id' => $gig->id])->json('id'));
        $entry = $draft->entries()->with('competency.levels')->firstOrFail();

        Sanctum::actingAs($this->user('Dr Lee'));
        $this->postJson("/api/v1/entries/{$entry->id}/scores", [
            'level_id' => $this->levelOf($entry, 3), 'comment' => 'Early.',
        ])->assertStatus(409)->assertJsonPath('error.code', 'NOT_SUBMITTED');
    }

    /**
     * Being marked down without a reason is the most demoralising thing
     * this product could do, and it is cheap to make impossible.
     */
    /**
     * The other end of the same gate. v_entry_score reports the most
     * recent counter-score, so one arriving after the flip would replace
     * the value the record was closed on and move a radar nobody was
     * looking at any more. See ADR #34.
     */
    public function test_an_assessed_reflection_cannot_be_counter_scored(): void
    {
        Sanctum::actingAs($this->user('Sam O'));
        foreach ($this->entries() as $entry) {
            $this->postJson("/api/v1/entries/{$entry->id}/scores", [
                'level_id' => $this->levelOf($entry, 4), 'comment' => 'Agreed.',
            ])->assertStatus(201);
        }
        $this->assertSame('assessed', $this->reflection->fresh()->status);

        $entry = $this->entries()->first();

        Sanctum::actingAs($this->user('Dr Lee'));
        $this->postJson("/api/v1/entries/{$entry->id}/scores", [
            'level_id' => $this->levelOf($entry, 1), 'comment' => 'Late.',
        ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'NOT_SUBMITTED')
            ->assertJsonPath('error.details.status', 'assessed');

        // The number the student was left with is the number that stands.
        Sanctum::actingAs($this->user('Jane N'));
        $this->getJson('/api/v1/me/radar')
            ->assertOk()
            ->assertJsonPath('axes.0.counter', 4);
    }

    public function test_scoring_below_the_student_requires_a_comment(): void
    {
        $entry = $this->entries()->first();
        $this->reflection->framework->update(['comment_required' => false]);

        Sanctum::actingAs($this->user('Sam O'));

        $this->postJson("/api/v1/entries/{$entry->id}/scores", ['level_id' => $this->levelOf($entry, 2)])
            ->assertStatus(400)
            ->assertJsonPath('error.code', 'COMMENT_REQUIRED')
            ->assertJsonPath('error.details.self_level', 3)
            ->assertJsonPath('error.details.counter_level', 2);

        // Level with it, or above it, needs no comment.
        $this->postJson("/api/v1/entries/{$entry->id}/scores", ['level_id' => $this->levelOf($entry, 4)])
            ->assertStatus(201);
    }

    public function test_a_rubric_can_require_a_comment_on_every_counter_score(): void
    {
        $entry = $this->entries()->first();
        $this->reflection->framework->update(['comment_required' => true]);

        Sanctum::actingAs($this->user('Sam O'));

        $this->postJson("/api/v1/entries/{$entry->id}/scores", ['level_id' => $this->levelOf($entry, 4)])
            ->assertStatus(400)->assertJsonPath('error.code', 'COMMENT_REQUIRED');

        $this->postJson("/api/v1/entries/{$entry->id}/scores", [
            'level_id' => $this->levelOf($entry, 4), 'comment' => 'Strong work on the parser.',
        ])->assertStatus(201);
    }

    public function test_one_scorer_cannot_score_the_same_entry_twice(): void
    {
        $entry = $this->entries()->first();
        Sanctum::actingAs($this->user('Sam O'));

        $body = ['level_id' => $this->levelOf($entry, 3), 'comment' => 'Agreed.'];
        $this->postJson("/api/v1/entries/{$entry->id}/scores", $body)->assertStatus(201);
        $this->postJson("/api/v1/entries/{$entry->id}/scores", $body)
            ->assertStatus(409)->assertJsonPath('error.code', 'ALREADY_SCORED');
    }

    public function test_an_assessor_and_a_supervisor_can_both_score_one_entry(): void
    {
        $entry = $this->entries()->first();

        Sanctum::actingAs($this->user('Sam O'));
        $this->postJson("/api/v1/entries/{$entry->id}/scores", ['level_id' => $this->levelOf($entry, 3), 'comment' => 'a'])
            ->assertStatus(201);

        Sanctum::actingAs($this->user('Dr Lee'));
        $this->postJson("/api/v1/entries/{$entry->id}/scores", ['level_id' => $this->levelOf($entry, 4), 'comment' => 'b'])
            ->assertStatus(201);

        $this->assertSame(2, $entry->scores()->where('scorer_role', '!=', 'self')->count());
    }

    public function test_a_student_cannot_counter_score_even_their_own(): void
    {
        $entry = $this->entries()->first();
        Sanctum::actingAs($this->user('Jane N'));

        $this->postJson("/api/v1/entries/{$entry->id}/scores", ['level_id' => $this->levelOf($entry, 4), 'comment' => 'x'])
            ->assertStatus(403)->assertJsonPath('error.code', 'ROLE_FORBIDDEN');
    }

    public function test_a_stranger_gets_404_rather_than_403(): void
    {
        $entry = $this->entries()->first();
        Sanctum::actingAs(User::create(['display_name' => 'Nobody']));

        $this->postJson("/api/v1/entries/{$entry->id}/scores", ['level_id' => $this->levelOf($entry, 4), 'comment' => 'x'])
            ->assertStatus(404)->assertJsonPath('error.code', 'NOT_FOUND');
    }

    public function test_the_last_counter_score_flips_the_reflection_to_assessed(): void
    {
        Sanctum::actingAs($this->user('Sam O'));
        $entries = $this->entries();

        foreach ($entries as $i => $entry) {
            $last = $i === $entries->count() - 1;

            $response = $this->postJson("/api/v1/entries/{$entry->id}/scores", [
                'level_id' => $this->levelOf($entry, 3), 'comment' => 'Agreed.',
            ])->assertStatus(201);

            $response->assertJsonPath('completed_the_reflection', $last);
            $response->assertJsonPath('reflection_status', $last ? 'assessed' : 'submitted');
        }

        $this->assertSame('assessed', $this->reflection->fresh()->status);

        $this->getJson("/api/v1/reflections/{$this->reflection->id}/events")
            ->assertOk()
            ->assertJsonPath('0.event_type', 'reflection_assessed');
    }

    public function test_the_review_queue_shows_only_unscored_work_and_empties_as_it_is_done(): void
    {
        Sanctum::actingAs($this->user('Sam O'));

        $this->getJson('/api/v1/review-queue')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.student.display_name', 'Jane N')
            ->assertJsonPath('0.progress.scored_by_me', 0)
            ->assertJsonPath('0.progress.entries', 6);

        foreach ($this->entries() as $entry) {
            $this->postJson("/api/v1/entries/{$entry->id}/scores", [
                'level_id' => $this->levelOf($entry, 3), 'comment' => 'Agreed.',
            ])->assertStatus(201);
        }

        $this->getJson('/api/v1/review-queue')->assertOk()->assertJsonCount(0);
    }

    /**
     * A gig can have an assessor and a supervisor, and each has their own
     * queue while the reflection is still open.
     */
    public function test_each_scorer_has_their_own_queue(): void
    {
        $entries = $this->entries();
        $exceptLast = $entries->slice(0, -1);

        Sanctum::actingAs($this->user('Sam O'));
        foreach ($exceptLast as $entry) {
            $this->postJson("/api/v1/entries/{$entry->id}/scores", [
                'level_id' => $this->levelOf($entry, 3), 'comment' => 'Agreed.',
            ])->assertStatus(201);
        }

        // Sam has one entry left, so it is still his work.
        $this->getJson('/api/v1/review-queue')
            ->assertJsonCount(1)
            ->assertJsonPath('0.progress.scored_by_me', 5);

        // Dr Lee has not scored any of it, so all six are still hers.
        Sanctum::actingAs($this->user('Dr Lee'));
        $this->getJson('/api/v1/review-queue')
            ->assertJsonCount(1)
            ->assertJsonPath('0.progress.scored_by_me', 0);
    }

    /**
     * The consequence of the flip, asserted rather than assumed.
     *
     * The contract defines the queue as submitted reflections awaiting the
     * caller's score, and defines a reflection as assessed once every
     * entry has one counter-score. Together those mean the first scorer to
     * finish closes the reflection for the second: Dr Lee's queue empties
     * because Sam completed it, not because she did anything.
     *
     * That follows from the specification and is not a bug in the code,
     * but it is a product decision worth putting in front of the client,
     * because a gig with both an assessor and a supervisor probably
     * expects both to be able to score. ADR #34 sharpened it: the second
     * scorer is now refused rather than merely unprompted, so the answer
     * matters more than it did.
     */
    public function test_completing_a_reflection_closes_it_for_every_other_scorer(): void
    {
        Sanctum::actingAs($this->user('Sam O'));
        foreach ($this->entries() as $entry) {
            $this->postJson("/api/v1/entries/{$entry->id}/scores", [
                'level_id' => $this->levelOf($entry, 3), 'comment' => 'Agreed.',
            ])->assertStatus(201);
        }

        $this->assertSame('assessed', $this->reflection->fresh()->status);

        Sanctum::actingAs($this->user('Dr Lee'));
        $this->getJson('/api/v1/review-queue')->assertOk()->assertJsonCount(0);

        // She can still read it. She can no longer score it: the queue and
        // the endpoint give the same answer, which they did not before.
        $this->getJson("/api/v1/reflections/{$this->reflection->id}")->assertOk();

        $entry = $this->entries()->first();
        $this->postJson("/api/v1/entries/{$entry->id}/scores", [
            'level_id' => $this->levelOf($entry, 2), 'comment' => 'Too late.',
        ])->assertStatus(409)->assertJsonPath('error.code', 'NOT_SUBMITTED');
    }

    public function test_a_student_has_no_review_queue(): void
    {
        Sanctum::actingAs($this->user('Jane N'));
        $this->getJson('/api/v1/review-queue')->assertOk()->assertJsonCount(0);
    }
}
