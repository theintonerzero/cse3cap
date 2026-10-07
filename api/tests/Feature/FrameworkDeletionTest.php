<?php

namespace Tests\Feature;

use App\Models\Competency;
use App\Models\Framework;
use App\Models\FrameworkAssignment;
use App\Models\Gig;
use App\Models\GigParticipant;
use App\Models\Level;
use App\Models\User;
use App\Services\FrameworkEditing;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A copy made by mistake can go, until it is a gig's rubric (ADR #59).
 *
 * As in FrameworkMutationTest, the refusals are the point. A delete that
 * reaches an assigned framework takes the rubric out from under every
 * score on that gig, so each way in has to be shut: someone else's copy,
 * a seeded template, a caller who supervises nothing, and an assignment
 * that arrives while the delete is under way.
 */
class FrameworkDeletionTest extends TestCase
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

    private function lee(): User
    {
        return User::where('display_name', 'Dr Lee')->firstOrFail();
    }

    private function copyFor(User $owner, string $name = 'Made by mistake'): Framework
    {
        return app(FrameworkEditing::class)->copy($this->base(), $owner, $name);
    }

    /**
     * Both seeded gigs already have a rubric and a gig takes one (ADR #35),
     * so assigning a copy needs a gig with none.
     */
    private function assign(Framework $framework, User $by): FrameworkAssignment
    {
        $gig = Gig::create([
            'title' => 'A gig with no rubric yet',
            'org_name' => 'Alumable',
            'starts_on' => '2026-08-03',
            'ends_on' => '2026-10-26',
        ]);

        GigParticipant::create(['gig_id' => $gig->id, 'user_id' => $by->id, 'role' => 'supervisor']);

        return FrameworkAssignment::create([
            'gig_id' => $gig->id,
            'framework_id' => $framework->id,
            'assigned_by' => $by->id,
        ]);
    }

    /**
     * The competencies and levels go by the schema's own cascades
     * (fk_comp_fw, fk_levels_comp). Counted rather than trusted, because a
     * framework row gone with its children left behind would pass a check
     * on the framework alone.
     */
    public function test_an_owner_deletes_an_unassigned_copy_with_its_competencies_and_levels(): void
    {
        $lee = $this->lee();
        $copy = $this->copyFor($lee);
        $competencies = $copy->competencies()->pluck('id');
        $this->assertCount(6, $competencies);
        $this->assertSame(24, Level::whereIn('competency_id', $competencies)->count());

        Sanctum::actingAs($lee);
        $this->deleteJson("/api/v1/frameworks/{$copy->id}")->assertNoContent();

        $this->assertNull(Framework::find($copy->id));
        $this->assertSame(0, Competency::whereIn('id', $competencies)->count());
        $this->assertSame(0, Level::whereIn('competency_id', $competencies)->count());
        $this->assertSame(6, $this->base()->competencies()->count(), 'the base is untouched');
    }

    public function test_an_assigned_copy_cannot_be_deleted(): void
    {
        $lee = $this->lee();
        $copy = $this->copyFor($lee);
        $this->assign($copy, $lee);

        Sanctum::actingAs($lee);
        $this->deleteJson("/api/v1/frameworks/{$copy->id}")
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'FRAMEWORK_ASSIGNED')
            ->assertJsonPath('error.message', 'This framework is assigned to a gig, so it can\'t be deleted. Frameworks assigned to a gig are kept so every score stays readable.')
            ->assertJsonPath('error.details.framework_id', $copy->id);

        $this->assertNotNull(Framework::find($copy->id));
        $this->assertSame(6, $copy->competencies()->count());
    }

    public function test_another_supervisors_copy_cannot_be_deleted(): void
    {
        $other = User::create(['display_name' => 'Another educator']);
        $theirs = $this->copyFor($other);

        Sanctum::actingAs($this->lee());
        $this->deleteJson("/api/v1/frameworks/{$theirs->id}")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'ROLE_FORBIDDEN');

        $this->assertNotNull(Framework::find($theirs->id));
    }

    public function test_a_seeded_base_template_cannot_be_deleted(): void
    {
        Sanctum::actingAs($this->lee());

        $this->deleteJson("/api/v1/frameworks/{$this->base()->id}")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'ROLE_FORBIDDEN');

        $this->assertSame(6, $this->base()->competencies()->count());
    }

    public function test_a_student_cannot_delete_a_framework(): void
    {
        $copy = $this->copyFor($this->lee());

        Sanctum::actingAs(User::where('display_name', 'Jane N')->firstOrFail());
        $this->deleteJson("/api/v1/frameworks/{$copy->id}")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'ROLE_FORBIDDEN');

        $this->assertNotNull(Framework::find($copy->id));
    }

    /**
     * Owning the copy is not enough on its own. Someone who made a copy and
     * no longer supervises any gig is refused, by the same test that would
     * stop them making one now. The copy is made through the service, since
     * the API would not let this user make it.
     */
    public function test_an_owner_who_supervises_nothing_cannot_delete_their_copy(): void
    {
        $former = User::create(['display_name' => 'A former supervisor']);
        $copy = $this->copyFor($former);

        Sanctum::actingAs($former);
        $this->deleteJson("/api/v1/frameworks/{$copy->id}")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'ROLE_FORBIDDEN');

        $this->assertNotNull(Framework::find($copy->id));
    }

    public function test_an_unknown_framework_is_404(): void
    {
        Sanctum::actingAs($this->lee());

        $this->deleteJson('/api/v1/frameworks/ffff9999-0000-4fff-8fff-ffffffffffff')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'NOT_FOUND');
    }

    /**
     * The race. assertDeletable has passed, then someone assigns the copy,
     * then the DELETE runs. Simulated with a deleting listener, which fires
     * after the check and before the statement: the assignment is real, so
     * it is MySQL's fk_fa_fw that refuses with 1451, not anything in PHP,
     * and the caller still sees the one 409 a check would have given.
     */
    public function test_an_assignment_that_lands_mid_delete_is_still_a_409(): void
    {
        $lee = $this->lee();
        $copy = $this->copyFor($lee);

        Framework::deleting(function (Framework $framework) use ($copy, $lee) {
            if ($framework->id === $copy->id) {
                $this->assign($copy, $lee);
            }
        });

        Sanctum::actingAs($lee);
        $this->deleteJson("/api/v1/frameworks/{$copy->id}")
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'FRAMEWORK_ASSIGNED')
            ->assertJsonPath('error.details.framework_id', $copy->id);

        $this->assertNotNull(Framework::find($copy->id));
        $this->assertSame(6, $copy->competencies()->count());
    }

    /**
     * The editor offers the delete on this flag, so it has to be right in
     * both shapes: the list a row is chosen from and the detail it opens.
     */
    public function test_the_resources_say_whether_a_framework_is_assigned(): void
    {
        $lee = $this->lee();
        $copy = $this->copyFor($lee);
        Sanctum::actingAs($lee);

        $row = fn () => collect($this->getJson('/api/v1/frameworks')->assertOk()->json())
            ->firstWhere('id', $copy->id);

        $this->assertFalse($row()['assigned']);
        $this->getJson("/api/v1/frameworks/{$copy->id}")->assertJsonPath('assigned', false);

        $this->assign($copy, $lee);

        $this->assertTrue($row()['assigned']);
        $this->getJson("/api/v1/frameworks/{$copy->id}")->assertJsonPath('assigned', true);
        // Assigned is not in use: nobody has reflected against it yet.
        $this->getJson("/api/v1/frameworks/{$copy->id}")->assertJsonPath('in_use', false);
    }
}
