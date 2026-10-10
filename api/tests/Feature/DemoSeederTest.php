<?php

namespace Tests\Feature;

use App\Models\Gig;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DemoSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_creates_three_role_holders_across_two_gigs(): void
    {
        $this->seed(DemoSeeder::class);

        $this->assertSame(3, User::count());
        $this->assertSame(2, Gig::count());

        $jane = User::where('display_name', 'Jane N')->firstOrFail();
        $this->assertSame(['student', 'student'], $jane->participations->pluck('role')->sort()->values()->all());

        $lee = User::where('display_name', 'Dr Lee')->firstOrFail();
        $this->assertContains('supervisor', $lee->participations->pluck('role')->all());

        // Sam is on the first gig only. Without that asymmetry nothing in
        // the suite can prove GET /gigs is scoped to the caller, because
        // every token would see every gig.
        $sam = User::where('display_name', 'Sam O')->firstOrFail();
        $this->assertSame(['assessor'], $sam->participations->pluck('role')->all());
        $this->assertSame(
            'Develop AI use cases',
            $sam->participations->first()->gig->title,
        );
    }

    public function test_sprint_dates_are_real_dates(): void
    {
        $this->seed(DemoSeeder::class);

        foreach (Gig::with('sprints')->get() as $gig) {
            foreach ($gig->sprints as $sprint) {
                $this->assertNotNull($sprint->opens_on, 'sprint has no opens_on');
                $this->assertNotNull($sprint->due_on, 'sprint has no due_on');
                $this->assertTrue(
                    $sprint->due_on->greaterThan($sprint->opens_on),
                    "sprint {$sprint->ordinal} closes before it opens",
                );
            }
        }
    }

    public function test_every_gig_has_a_framework_and_sprints(): void
    {
        $this->seed(DemoSeeder::class);

        foreach (Gig::with(['sprints', 'assignment'])->get() as $gig) {
            $this->assertNotNull($gig->assignment, "{$gig->title} has no framework assigned");
            $this->assertGreaterThanOrEqual(2, $gig->sprints->count());
        }
    }

    public function test_it_is_idempotent(): void
    {
        $this->seed(DemoSeeder::class);
        $this->seed(DemoSeeder::class);

        $this->assertSame(3, User::count());
        $this->assertSame(2, Gig::count());
    }
}
