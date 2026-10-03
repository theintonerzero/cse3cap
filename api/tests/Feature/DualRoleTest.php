<?php

namespace Tests\Feature;

use App\Models\Gig;
use App\Models\GigParticipant;
use App\Models\Reflection;
use App\Models\User;
use App\Services\RoleResolver;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * One person holding two roles on one gig (ADR #47). The schema allows it,
 * because participants come from Alumable, and the answer must not depend
 * on which row the index returns first. The student role wins, and the
 * lists say what the policy says.
 */
class DualRoleTest extends TestCase
{
    use RefreshDatabase;

    private Gig $gig;

    private User $dual;

    private Reflection $classmates;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoSeeder::class);
        $this->gig = Gig::where('title', 'Develop AI use cases')->firstOrFail();

        $classmate = User::create(['display_name' => 'Classmate']);
        GigParticipant::create(['gig_id' => $this->gig->id, 'user_id' => $classmate->id, 'role' => 'student']);
        $this->classmates = $this->submittedReflectionOf($classmate);

        // Assessor first, so alphabetical index order and insertion order
        // agree on the wrong answer.
        $this->dual = User::create(['display_name' => 'Dual']);
        foreach (['assessor', 'student'] as $role) {
            GigParticipant::create(['gig_id' => $this->gig->id, 'user_id' => $this->dual->id, 'role' => $role]);
        }

        // A new request starts with a new RoleResolver. Inside one test the
        // app persists, so forget the one setUp's requests memoised.
        $this->app->forgetScopedInstances();
    }

    /** A reflection with every narrative and self-score in place, submitted. */
    private function submittedReflectionOf(User $student): Reflection
    {
        Sanctum::actingAs($student);

        $id = $this->postJson('/api/v1/reflections', [
            'sprint_id' => $this->gig->sprints()->orderBy('ordinal')->firstOrFail()->id,
        ])->assertStatus(201)->json('id');

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

    public function test_a_dual_role_user_resolves_to_student_whichever_row_came_first(): void
    {
        foreach ([['assessor', 'student'], ['student', 'assessor'], ['supervisor', 'employer', 'student']] as $i => $order) {
            $user = User::create(['display_name' => "Dual {$i}"]);
            foreach ($order as $role) {
                GigParticipant::create(['gig_id' => $this->gig->id, 'user_id' => $user->id, 'role' => $role]);
            }

            $this->assertSame('student', (new RoleResolver)->for($user, $this->gig), implode(' then ', $order));
        }
    }

    public function test_the_least_privileged_reviewer_role_wins_when_there_is_no_student_role(): void
    {
        $user = User::create(['display_name' => 'Two reviewer roles']);
        foreach (['supervisor', 'employer', 'assessor'] as $role) {
            GigParticipant::create(['gig_id' => $this->gig->id, 'user_id' => $user->id, 'role' => $role]);
        }

        $this->assertSame('assessor', (new RoleResolver)->for($user, $this->gig));
    }

    public function test_a_dual_role_user_cannot_open_a_classmates_reflection(): void
    {
        Sanctum::actingAs($this->dual);

        $this->getJson("/api/v1/reflections/{$this->classmates->id}")
            ->assertStatus(404)->assertJsonPath('error.code', 'NOT_FOUND');
    }

    public function test_a_dual_role_user_does_not_list_a_classmates_reflection(): void
    {
        Sanctum::actingAs($this->dual);

        $ids = collect($this->getJson('/api/v1/reflections')->assertOk()->json())->pluck('id');

        $this->assertNotContains($this->classmates->id, $ids);
    }

    public function test_a_dual_role_user_has_nothing_to_review_on_that_gig(): void
    {
        Sanctum::actingAs($this->dual);

        $this->getJson('/api/v1/review-queue')->assertOk()->assertJsonCount(0);
    }

    public function test_a_dual_role_user_can_start_their_own_reflection(): void
    {
        Sanctum::actingAs($this->dual);

        $this->postJson('/api/v1/reflections', [
            'sprint_id' => $this->gig->sprints()->orderBy('ordinal')->firstOrFail()->id,
        ])->assertStatus(201);
    }

    public function test_my_role_is_student_for_a_dual_role_user(): void
    {
        Sanctum::actingAs($this->dual);

        $this->getJson("/api/v1/gigs/{$this->gig->id}")
            ->assertOk()->assertJsonPath('my_role', 'student');
    }
}
