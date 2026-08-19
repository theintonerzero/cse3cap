<?php

namespace Tests\Feature;

use App\Models\Gig;
use App\Models\User;
use App\Services\RoleResolver;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuthMeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoSeeder::class);
    }

    public function test_it_returns_the_caller_and_their_participations(): void
    {
        $jane = User::where('display_name', 'Jane N')->firstOrFail();
        Sanctum::actingAs($jane);

        $this->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('display_name', 'Jane N')
            ->assertJsonCount(2, 'participations')
            ->assertJsonPath('participations.0.role', 'student')
            ->assertJsonStructure(['id', 'display_name', 'participations' => [['gig_id', 'gig_title', 'role']]]);
    }

    public function test_it_rejects_an_anonymous_caller(): void
    {
        $this->getJson('/api/v1/auth/me')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'UNAUTHENTICATED');
    }

    public function test_role_resolves_per_gig_and_is_null_for_a_stranger(): void
    {
        $sam = User::where('display_name', 'Sam O')->firstOrFail();
        $stranger = User::create(['display_name' => 'Nobody']);

        // Named rather than taken by position. Sam is on one gig and not
        // the other, which is the whole point of the assertion, so a test
        // that took whichever row came back first would pass or fail on
        // insertion order.
        $his = Gig::where('title', 'Develop AI use cases')->firstOrFail();
        $notHis = Gig::where('title', 'Data migration audit')->firstOrFail();

        $resolver = app(RoleResolver::class);

        $this->assertSame('assessor', $resolver->for($sam, $his));
        $this->assertNull($resolver->for($sam, $notHis), 'a role must not carry across gigs');
        $this->assertNull($resolver->for($stranger, $his));
    }
}
