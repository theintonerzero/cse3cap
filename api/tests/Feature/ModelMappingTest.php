<?php

namespace Tests\Feature;

use App\Models\Competency;
use App\Models\Framework;
use App\Models\Level;
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
