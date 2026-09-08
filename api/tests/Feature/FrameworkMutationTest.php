<?php

namespace Tests\Feature;

use App\Models\Framework;
use App\Models\FrameworkAssignment;
use App\Models\Gig;
use App\Models\GigParticipant;
use App\Models\Reflection;
use App\Models\User;
use App\Services\FrameworkEditing;
use Database\Seeders\DemoSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Copy-then-edit, and the guard that makes it the only model.
 *
 * The denials matter more than the permissions here. A framework that can
 * still be edited after somebody was scored against it silently rewrites
 * what their score meant, and nothing downstream would notice.
 */
class FrameworkMutationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoSeeder::class);
    }

    private function base(): Framework
    {
        return Framework::where('fw_key', 'latrobe6')->firstOrFail();
    }

    private function actAsSupervisor(): User
    {
        $lee = User::where('display_name', 'Dr Lee')->firstOrFail();
        Sanctum::actingAs($lee);

        return $lee;
    }

    private function copyFor(User $owner, string $name = 'Alumable Sprint 1'): Framework
    {
        return app(FrameworkEditing::class)->copy($this->base(), $owner, $name);
    }

    public function test_a_supervisor_copies_a_base_template_in_full(): void
    {
        $lee = $this->actAsSupervisor();

        $body = $this->postJson('/api/v1/frameworks', [
            'based_on_framework_id' => $this->base()->id,
            'name' => 'Alumable Sprint 1 Gig template',
        ])->assertStatus(201)
            ->assertJsonPath('name', 'Alumable Sprint 1 Gig template')
            ->assertJsonPath('created_by', $lee->id)
            ->assertJsonPath('in_use', false)
            ->assertJsonPath('version', 'v1')
            ->assertJsonPath('scale.min', 1)
            ->assertJsonPath('scale.max', 4)
            ->assertJsonCount(6, 'competencies')
            ->assertJsonCount(4, 'competencies.0.levels')
            ->json();

        $this->assertNotSame($this->base()->id, $body['id'], 'the copy must be a new row');

        // Every level of every competency, not just the first.
        $copy = Framework::with('competencies.levels')->findOrFail($body['id']);
        $this->assertSame(24, $copy->competencies->sum(fn ($c) => $c->levels->count()));
    }

    public function test_the_base_is_untouched_by_a_copy(): void
    {
        $this->actAsSupervisor();
        $before = $this->base()->only(['name', 'created_by', 'version']);

        $this->postJson('/api/v1/frameworks', [
            'based_on_framework_id' => $this->base()->id,
            'name' => 'A copy',
        ])->assertStatus(201);

        $this->assertSame($before, $this->base()->fresh()->only(['name', 'created_by', 'version']));
        $this->assertSame(6, $this->base()->competencies()->count());
    }

    public function test_a_student_cannot_create_a_framework(): void
    {
        Sanctum::actingAs(User::where('display_name', 'Jane N')->firstOrFail());

        $this->postJson('/api/v1/frameworks', [
            'based_on_framework_id' => $this->base()->id,
            'name' => 'Mine now',
        ])->assertStatus(403)->assertJsonPath('error.code', 'ROLE_FORBIDDEN');
    }

    public function test_a_seeded_base_template_cannot_be_edited(): void
    {
        $this->actAsSupervisor();

        $this->patchJson("/api/v1/frameworks/{$this->base()->id}", ['name' => 'Renamed'])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'ROLE_FORBIDDEN');

        $this->assertSame('La Trobe six-competency', $this->base()->fresh()->name);
    }

    public function test_someone_elses_copy_cannot_be_edited(): void
    {
        $stranger = User::create(['display_name' => 'Another educator']);
        $theirs = $this->copyFor($stranger);

        $this->actAsSupervisor();

        $this->patchJson("/api/v1/frameworks/{$theirs->id}", ['name' => 'Mine now'])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'ROLE_FORBIDDEN');
    }

    public function test_an_owner_renames_their_own_copy(): void
    {
        $lee = $this->actAsSupervisor();
        $copy = $this->copyFor($lee);

        $this->patchJson("/api/v1/frameworks/{$copy->id}", [
            'name' => 'Alumable Sprint 2',
            'evidence_required' => true,
        ])->assertOk()
            ->assertJsonPath('name', 'Alumable Sprint 2')
            ->assertJsonPath('evidence_required', true);
    }

    public function test_an_owner_rewords_a_competency_and_a_descriptor(): void
    {
        $lee = $this->actAsSupervisor();
        $copy = $this->copyFor($lee);
        $competency = $copy->competencies()->orderBy('position')->firstOrFail();
        $level = $competency->levels()->orderBy('level_value')->firstOrFail();

        $this->patchJson("/api/v1/competencies/{$competency->id}", [
            'name' => 'Team contribution',
            'short_label' => 'Team',
        ])->assertOk()->assertJsonPath('name', 'Team contribution');

        $this->patchJson("/api/v1/levels/{$level->id}", [
            'descriptor' => 'Contributes when asked, and asks when unsure.',
        ])->assertOk()->assertJsonPath('descriptor', 'Contributes when asked, and asks when unsure.');
    }

    /**
     * The rule the whole model rests on. Once a reflection points at a
     * framework, its version snapshot is only meaningful while the
     * framework cannot change, so all four edit paths have to refuse.
     */
    public function test_one_reflection_freezes_the_framework_everywhere(): void
    {
        $lee = $this->actAsSupervisor();
        $copy = $this->copyFor($lee);
        $competency = $copy->competencies()->orderBy('position')->firstOrFail();
        $level = $competency->levels()->orderBy('level_value')->firstOrFail();

        $gig = Gig::where('title', 'Develop AI use cases')->firstOrFail();
        Reflection::create([
            'user_id' => User::where('display_name', 'Jane N')->firstOrFail()->id,
            'gig_id' => $gig->id,
            'sprint_id' => $gig->sprints()->firstOrFail()->id,
            'framework_id' => $copy->id,
            'framework_version' => $copy->version,
            'status' => 'draft',
        ]);

        $this->patchJson("/api/v1/frameworks/{$copy->id}", ['name' => 'Too late'])
            ->assertStatus(409)->assertJsonPath('error.code', 'FRAMEWORK_IN_USE');

        $this->patchJson("/api/v1/competencies/{$competency->id}", ['name' => 'Too late'])
            ->assertStatus(409)->assertJsonPath('error.code', 'FRAMEWORK_IN_USE');

        $this->patchJson("/api/v1/levels/{$level->id}", ['descriptor' => 'Too late'])
            ->assertStatus(409)->assertJsonPath('error.code', 'FRAMEWORK_IN_USE');

        $this->assertSame('Alumable Sprint 1', $copy->fresh()->name);
    }

    public function test_in_use_is_reported_before_anyone_tries_to_edit(): void
    {
        $lee = $this->actAsSupervisor();
        $copy = $this->copyFor($lee);

        $this->getJson("/api/v1/frameworks/{$copy->id}")->assertJsonPath('in_use', false);

        $gig = Gig::where('title', 'Develop AI use cases')->firstOrFail();
        Reflection::create([
            'user_id' => User::where('display_name', 'Jane N')->firstOrFail()->id,
            'gig_id' => $gig->id,
            'sprint_id' => $gig->sprints()->firstOrFail()->id,
            'framework_id' => $copy->id,
            'framework_version' => $copy->version,
            'status' => 'draft',
        ]);

        $this->getJson("/api/v1/frameworks/{$copy->id}")->assertJsonPath('in_use', true);
    }

    public function test_two_copies_of_one_base_get_distinct_keys(): void
    {
        $lee = $this->actAsSupervisor();

        foreach (['Shared name', 'Shared name'] as $name) {
            $this->postJson('/api/v1/frameworks', [
                'based_on_framework_id' => $this->base()->id,
                'name' => $name,
            ])->assertStatus(201);
        }

        $keys = Framework::where('created_by', $lee->id)->pluck('fw_key');
        $this->assertCount(2, $keys);
        $this->assertCount(2, $keys->unique(), 'fw_key is unique, so two copies cannot share one');
    }

    /**
     * Both seeded gigs already carry a rubric, and since ADR #33 that is
     * enough to refuse another, so the happy path needs a gig with none.
     */
    private function unassignedGig(User $participant, string $role = 'supervisor'): Gig
    {
        $gig = Gig::create([
            'title' => 'A gig with no rubric yet',
            'org_name' => 'Alumable',
            'starts_on' => '2026-08-03',
            'ends_on' => '2026-10-26',
        ]);

        GigParticipant::create([
            'gig_id' => $gig->id,
            'user_id' => $participant->id,
            'role' => $role,
        ]);

        return $gig;
    }

    public function test_a_supervisor_assigns_a_framework_to_their_gig(): void
    {
        $lee = $this->actAsSupervisor();
        $copy = $this->copyFor($lee);
        $gig = $this->unassignedGig($lee);

        $this->postJson('/api/v1/framework-assignments', [
            'framework_id' => $copy->id,
            'gig_id' => $gig->id,
        ])->assertStatus(201)->assertJsonPath('framework_id', $copy->id);

        $this->assertSame($copy->id, $gig->fresh()->assignment->framework_id);
    }

    /**
     * The matrix gives this row to a supervisor or an employer. Nothing in
     * the seed carries an employer, so this is the only place that role is
     * exercised against this endpoint at all.
     */
    public function test_an_employer_can_also_assign_a_framework_to_their_gig(): void
    {
        $lee = $this->actAsSupervisor();
        $copy = $this->copyFor($lee);

        $employer = User::create(['display_name' => 'An Employer']);
        $gig = $this->unassignedGig($employer, 'employer');

        Sanctum::actingAs($employer);
        $this->postJson('/api/v1/framework-assignments', [
            'framework_id' => $copy->id,
            'gig_id' => $gig->id,
        ])->assertStatus(201)->assertJsonPath('framework_id', $copy->id);
    }

    public function test_assigning_the_same_framework_twice_is_a_conflict(): void
    {
        $lee = $this->actAsSupervisor();
        $gig = Gig::where('title', 'Develop AI use cases')->firstOrFail();
        $already = $gig->assignment->framework_id;

        $this->postJson('/api/v1/framework-assignments', [
            'framework_id' => $already,
            'gig_id' => $gig->id,
        ])->assertStatus(409)->assertJsonPath('error.code', 'DUPLICATE_ASSIGNMENT');
    }

    /**
     * The case the old key let through. ak_fw_assignments was unique on
     * (gig_id, framework_id), which a second, *different* rubric
     * satisfies, and everything downstream assumes there is one:
     * Gig::assignment is a hasOne, the contract gives a gig one
     * framework, and ReflectionCreator snapshots whatever that resolves
     * to. ADR #33 put the rule in the service, ADR #35 put it in the key.
     */
    public function test_a_gig_refuses_a_second_different_rubric(): void
    {
        $lee = $this->actAsSupervisor();
        $gig = Gig::where('title', 'Develop AI use cases')->firstOrFail();
        $already = $gig->assignment->framework_id;
        $other = $this->copyFor($lee, 'A rubric this gig is not scored against');

        $this->postJson('/api/v1/framework-assignments', [
            'framework_id' => $other->id,
            'gig_id' => $gig->id,
        ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'DUPLICATE_ASSIGNMENT')
            ->assertJsonPath('error.details.framework_id', $already);

        $this->assertSame(1, FrameworkAssignment::where('gig_id', $gig->id)->count());
        $this->assertSame($already, $gig->fresh()->assignment->framework_id);
    }

    /**
     * The key, not the service. FrameworkAssigner explains the refusal
     * and ak_fw_assignments is what makes it true for every writer, so
     * this goes around the service entirely: a second row for a gig has
     * to be impossible even when nothing in PHP is looking. ADR #35.
     */
    public function test_the_database_itself_holds_a_gig_to_one_rubric(): void
    {
        $lee = User::where('display_name', 'Dr Lee')->firstOrFail();
        $gig = Gig::where('title', 'Develop AI use cases')->firstOrFail();
        $other = $this->copyFor($lee, 'Not this gig\'s rubric');

        $this->expectException(QueryException::class);

        try {
            FrameworkAssignment::create([
                'gig_id' => $gig->id,
                'framework_id' => $other->id,
                'assigned_by' => $lee->id,
            ]);
        } catch (QueryException $e) {
            $this->assertSame(1062, $e->errorInfo[1] ?? null);
            $this->assertStringContainsString('ak_fw_assignments', $e->getMessage());
            $this->assertSame(1, FrameworkAssignment::where('gig_id', $gig->id)->count());

            throw $e;
        }
    }

    /**
     * Also the ordering: this gig already has a rubric, so a 409 here
     * would mean the conflict was decided before the role was, and a
     * student would learn something about a gig by being refused.
     */
    public function test_a_student_cannot_assign_and_a_stranger_gets_404(): void
    {
        $gig = Gig::where('title', 'Develop AI use cases')->firstOrFail();
        $copy = $this->copyFor(User::where('display_name', 'Dr Lee')->firstOrFail());

        Sanctum::actingAs(User::where('display_name', 'Jane N')->firstOrFail());
        $this->postJson('/api/v1/framework-assignments', ['framework_id' => $copy->id, 'gig_id' => $gig->id])
            ->assertStatus(403)->assertJsonPath('error.code', 'ROLE_FORBIDDEN');

        Sanctum::actingAs(User::create(['display_name' => 'Nobody']));
        $this->postJson('/api/v1/framework-assignments', ['framework_id' => $copy->id, 'gig_id' => $gig->id])
            ->assertStatus(404)->assertJsonPath('error.code', 'NOT_FOUND');
    }
}
