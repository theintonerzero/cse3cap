<?php

namespace Tests\Feature;

use App\Models\Competency;
use App\Models\Framework;
use App\Models\Level;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ModelMappingTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeded_frameworks_load_with_their_rubric(): void
    {
        $latrobe = Framework::where('fw_key', 'latrobe6')->firstOrFail();

        $this->assertSame('La Trobe six-competency', $latrobe->name);
        $this->assertCount(6, $latrobe->competencies);
        $this->assertCount(4, $latrobe->competencies->first()->levels);
    }

    public function test_sfia_has_a_seven_point_scale(): void
    {
        $sfia = Framework::where('fw_key', 'sfia9')->firstOrFail();

        $this->assertCount(6, $sfia->competencies);
        $this->assertCount(7, $sfia->competencies->first()->levels);
    }

    /**
     * Same failure as the one below, in the other direction: the default
     * Laravel factory wrote name, email, email_verified_at, password and
     * remember_token, and this schema has none of them. It never got far
     * enough to fail on that, because User did not use HasFactory, so
     * User::factory() was an undefined method. Either half of that is a
     * trap for the first person who reaches for the standard idiom.
     */
    public function test_the_user_factory_writes_columns_that_exist(): void
    {
        $user = User::factory()->create();

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'display_name' => $user->display_name,
        ]);

        // external_ref is unique where it is set, so a factory that does
        // not vary it works once and fails on the second call.
        $pair = User::factory()->count(2)->create();
        $this->assertCount(2, $pair->pluck('external_ref')->unique());
    }

    public function test_models_without_laravel_timestamps_do_not_claim_them(): void
    {
        // These tables have no created_at or updated_at at all. If a model
        // leaves $timestamps on, Eloquent writes to columns that do not
        // exist and every insert fails.
        foreach ([Framework::class, Competency::class, Level::class] as $class) {
            $this->assertFalse((new $class)->usesTimestamps(), $class.' must not use timestamps');
        }
    }
}
