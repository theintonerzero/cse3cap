<?php

namespace Tests\Feature;

use App\Models\Framework;
use App\Models\Gig;
use App\Models\GigParticipant;
use App\Models\Reflection;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GigsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoSeeder::class);
    }

    private function firstGig(): Gig
    {
        return Gig::where('title', 'Develop AI use cases')->firstOrFail();
    }

    public function test_it_lists_only_the_gigs_the_caller_is_on(): void
    {
        Sanctum::actingAs(User::where('display_name', 'Jane N')->firstOrFail());

        $this->getJson('/api/v1/gigs')
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.my_role', 'student')
            ->assertJsonStructure([['id', 'title', 'org_name', 'starts_on', 'ends_on',
                'my_role', 'sprints' => [['id', 'ordinal', 'opens_on', 'due_on']],
                'framework' => ['id', 'fw_key', 'name', 'version'],
                'reflection_summary' => ['draft', 'submitted', 'assessed']]]);
    }

    /**
     * Sam is an assessor on one gig only. Jane is on both. If the list
     * were not scoped, both would see two, and the assertion above would
     * pass for the wrong reason.
     */
    public function test_the_list_is_scoped_per_caller_not_global(): void
    {
        Sanctum::actingAs(User::where('display_name', 'Sam O')->firstOrFail());

        $this->getJson('/api/v1/gigs')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.title', 'Develop AI use cases')
            ->assertJsonPath('0.my_role', 'assessor');
    }

    public function test_a_stranger_sees_no_gigs(): void
    {
        Sanctum::actingAs(User::create(['display_name' => 'Nobody']));

        $this->getJson('/api/v1/gigs')->assertOk()->assertJsonCount(0);
    }

    public function test_it_shows_one_gig_with_participants(): void
    {
        Sanctum::actingAs(User::where('display_name', 'Sam O')->firstOrFail());

        $this->getJson("/api/v1/gigs/{$this->firstGig()->id}")
            ->assertOk()
            ->assertJsonPath('my_role', 'assessor')
            ->assertJsonCount(3, 'participants');
    }

    public function test_a_non_participant_gets_404_not_403(): void
    {
        Sanctum::actingAs(User::create(['display_name' => 'Nobody']));

        $this->getJson("/api/v1/gigs/{$this->firstGig()->id}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'NOT_FOUND');
    }

    /**
     * A student may see their own reflections and nobody else's, so
     * reflection_summary has to be their own count. Counting every
     * reflection on the gig would tell them how many their classmates
     * have written.
     */
    public function test_reflection_summary_shows_a_student_only_their_own(): void
    {
        $gig = $this->firstGig();
        $jane = User::where('display_name', 'Jane N')->firstOrFail();
        $classmate = $this->addStudent($gig, 'Other Student');

        $this->writeReflection($gig, $jane, 'draft');
        $this->writeReflection($gig, $classmate, 'submitted');

        Sanctum::actingAs($jane);

        $this->getJson('/api/v1/gigs')
            ->assertOk()
            ->assertJsonPath('0.reflection_summary.draft', 1)
            ->assertJsonPath('0.reflection_summary.submitted', 0)
            ->assertJsonPath('0.reflection_summary.assessed', 0);
    }

    /**
     * The other half of the same rule: an assessor, supervisor or employer
     * may view every reflection on a gig they are on, so their summary
     * counts all of them.
     */
    public function test_reflection_summary_shows_an_assessor_the_whole_gig(): void
    {
        $gig = $this->firstGig();
        $jane = User::where('display_name', 'Jane N')->firstOrFail();
        $classmate = $this->addStudent($gig, 'Other Student');

        $this->writeReflection($gig, $jane, 'draft');
        $this->writeReflection($gig, $classmate, 'submitted');

        Sanctum::actingAs(User::where('display_name', 'Sam O')->firstOrFail());

        $this->getJson('/api/v1/gigs')
            ->assertOk()
            ->assertJsonPath('0.reflection_summary.draft', 1)
            ->assertJsonPath('0.reflection_summary.submitted', 1);
    }

    private function addStudent(Gig $gig, string $name): User
    {
        $user = User::create(['display_name' => $name]);

        GigParticipant::create([
            'gig_id' => $gig->id,
            'user_id' => $user->id,
            'role' => 'student',
        ]);

        return $user;
    }

    private function writeReflection(Gig $gig, User $user, string $status): Reflection
    {
        $framework = Framework::where('fw_key', 'latrobe6')->firstOrFail();

        return Reflection::create([
            'user_id' => $user->id,
            'gig_id' => $gig->id,
            'sprint_id' => $gig->sprints()->firstOrFail()->id,
            'framework_id' => $framework->id,
            'framework_version' => $framework->version,
            'status' => $status,
        ]);
    }
}
