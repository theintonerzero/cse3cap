<?php

namespace Tests\Feature;

use App\Models\Framework;
use App\Models\Gig;
use App\Models\Reflection;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FrameworksTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoSeeder::class);
        Sanctum::actingAs(User::where('display_name', 'Dr Lee')->firstOrFail());
    }

    public function test_it_lists_both_seeded_frameworks(): void
    {
        $this->getJson('/api/v1/frameworks')
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonStructure([['id', 'fw_key', 'version', 'name', 'is_active', 'created_by', 'in_use']]);
    }

    public function test_a_framework_no_reflection_references_is_not_in_use(): void
    {
        $this->getJson('/api/v1/frameworks')
            ->assertOk()
            ->assertJsonPath('0.in_use', false)
            ->assertJsonPath('1.in_use', false);
    }

    /**
     * The assertion that matters. in_use is what makes a framework
     * permanently read-only, and a flag that is always false locks
     * nothing. One reflection is enough to flip it, and only for the
     * framework that reflection references.
     */
    public function test_one_reflection_makes_its_framework_in_use(): void
    {
        $gig = Gig::where('title', 'Develop AI use cases')->firstOrFail();
        $latrobe = Framework::where('fw_key', 'latrobe6')->firstOrFail();

        Reflection::create([
            'user_id' => User::where('display_name', 'Jane N')->firstOrFail()->id,
            'gig_id' => $gig->id,
            'sprint_id' => $gig->sprints()->firstOrFail()->id,
            'framework_id' => $latrobe->id,
            'framework_version' => $latrobe->version,
            'status' => 'draft',
        ]);

        $body = $this->getJson('/api/v1/frameworks')->assertOk()->json();
        $byKey = collect($body)->keyBy('fw_key');

        $this->assertTrue($byKey['latrobe6']['in_use'], 'the referenced framework must lock');
        $this->assertFalse($byKey['sfia9']['in_use'], 'an unreferenced one must not');

        $this->getJson("/api/v1/frameworks/{$latrobe->id}")
            ->assertOk()
            ->assertJsonPath('in_use', true);
    }

    public function test_latrobe_returns_six_axes_on_a_one_to_four_scale(): void
    {
        $latrobe = Framework::where('fw_key', 'latrobe6')->firstOrFail();

        $this->getJson("/api/v1/frameworks/{$latrobe->id}")
            ->assertOk()
            ->assertJsonPath('scale.min', 1)
            ->assertJsonPath('scale.max', 4)
            ->assertJsonCount(6, 'competencies')
            ->assertJsonCount(4, 'competencies.0.levels');
    }

    public function test_sfia_returns_a_seven_point_scale_through_the_same_endpoint(): void
    {
        $sfia = Framework::where('fw_key', 'sfia9')->firstOrFail();

        $this->getJson("/api/v1/frameworks/{$sfia->id}")
            ->assertOk()
            ->assertJsonPath('scale.max', 7)
            ->assertJsonCount(7, 'competencies.0.levels');
    }

    public function test_it_rejects_an_anonymous_caller(): void
    {
        app('auth')->forgetGuards();

        $this->getJson('/api/v1/frameworks')->assertStatus(401);
    }
}
