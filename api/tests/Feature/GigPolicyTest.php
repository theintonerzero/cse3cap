<?php

namespace Tests\Feature;

use App\Models\Gig;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Tests\TestCase;

/**
 * One test per row of the permission matrix that touches a gig. The
 * matrix gives every role "their gigs" and nothing else, so the rows are
 * the four roles plus a non-participant.
 *
 * The denial is the point. A policy that returns true for everybody
 * passes every happy-path test in the suite.
 */
class GigPolicyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoSeeder::class);
    }

    private function gig(string $title): Gig
    {
        return Gig::where('title', $title)->firstOrFail();
    }

    private function user(string $name): User
    {
        return User::where('display_name', $name)->firstOrFail();
    }

    public function test_every_participant_role_may_view_their_own_gig(): void
    {
        $gig = $this->gig('Develop AI use cases');

        foreach (['Jane N' => 'student', 'Sam O' => 'assessor', 'Dr Lee' => 'supervisor'] as $name => $role) {
            $this->assertTrue(
                Gate::forUser($this->user($name))->allows('view', $gig),
                "{$role} must be able to view a gig they are on",
            );
        }
    }

    public function test_a_participant_on_another_gig_is_still_denied_this_one(): void
    {
        // Sam assesses the first gig only. Being a participant somewhere is
        // not being a participant here, which is the whole reason roles sit
        // on gig_participants rather than on users.
        $this->assertFalse(
            Gate::forUser($this->user('Sam O'))->allows('view', $this->gig('Data migration audit')),
        );
    }

    public function test_a_stranger_is_denied(): void
    {
        $this->assertFalse(
            Gate::forUser(User::create(['display_name' => 'Nobody']))
                ->allows('view', $this->gig('Develop AI use cases')),
        );
    }

    /**
     * The denial has to be not-found rather than forbidden, or the status
     * code tells the caller which gigs exist.
     */
    public function test_the_denial_is_not_found_and_not_forbidden(): void
    {
        $response = Gate::forUser($this->user('Sam O'))
            ->inspect('view', $this->gig('Data migration audit'));

        $this->assertTrue($response->denied());
        $this->assertSame(404, $response->status());
    }
}
