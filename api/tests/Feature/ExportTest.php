<?php

namespace Tests\Feature;

use App\Jobs\BuildExport;
use App\Models\Export;
use App\Models\Gig;
use App\Models\Reflection;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoSeeder::class);
        Storage::fake('local');
    }

    private function user(string $name): User
    {
        return User::where('display_name', $name)->firstOrFail();
    }

    /** A submitted, counter-scored reflection, so the file has something in it. */
    private function assessedReflection(): Reflection
    {
        Sanctum::actingAs($this->user('Jane N'));
        $gig = Gig::where('title', 'Develop AI use cases')->firstOrFail();

        $reflection = Reflection::findOrFail(
            $this->postJson('/api/v1/reflections', [
                'sprint_id' => $gig->sprints()->where('ordinal', 1)->firstOrFail()->id,
            ])->json('id')
        );

        foreach ($reflection->entries()->with('competency.levels')->get() as $entry) {
            $this->patchJson("/api/v1/entries/{$entry->id}", ['narrative' => 'Paired on the importer.']);
            $this->putJson("/api/v1/entries/{$entry->id}/scores/self", [
                'level_id' => $entry->competency->levels->firstWhere('level_value', 3)->id,
            ])->assertOk();
        }

        $this->postJson("/api/v1/entries/{$reflection->entries()->firstOrFail()->id}/evidence", [
            'kind' => 'link', 'label' => 'The pull request', 'uri' => 'https://example.org/pr/4',
        ])->assertStatus(201);

        $this->postJson("/api/v1/reflections/{$reflection->id}/submit")->assertOk();

        Sanctum::actingAs($this->user('Sam O'));
        foreach ($reflection->entries()->with('competency.levels')->get() as $entry) {
            $this->postJson("/api/v1/entries/{$entry->id}/scores", [
                'level_id' => $entry->competency->levels->firstWhere('level_value', 2)->id,
                'comment' => 'Good, with more to do on testing.',
            ])->assertStatus(201);
        }

        Sanctum::actingAs($this->user('Jane N'));

        return $reflection->fresh();
    }

    public function test_requesting_an_export_returns_202_and_something_to_poll(): void
    {
        $this->assessedReflection();

        $body = $this->postJson('/api/v1/exports', ['format' => 'json'])
            ->assertStatus(202)
            ->assertJsonStructure(['id', 'format', 'status', 'requested_at'])
            ->json();

        $this->assertSame('json', $body['format']);
        $this->assertContains($body['status'], ['pending', 'complete']);

        $this->getJson("/api/v1/exports/{$body['id']}")
            ->assertOk()
            ->assertJsonPath('status', 'complete')
            ->assertJsonPath('summary.reflections', 1)
            ->assertJsonPath('summary.scores', 12)
            ->assertJsonPath('summary.files', 1);
    }

    public function test_the_file_holds_the_record_including_both_sides_of_every_score(): void
    {
        $this->assessedReflection();

        $id = $this->postJson('/api/v1/exports', ['format' => 'json'])->json('id');
        $export = Export::findOrFail($id);

        $payload = json_decode(Storage::disk('local')->get($export->uri), true);

        $this->assertSame(1, $payload['summary']['reflections']);
        $reflection = $payload['reflections'][0];

        $this->assertSame('assessed', $reflection['status']);
        $this->assertSame('Develop AI use cases', $reflection['gig']);
        $this->assertSame('latrobe6', $reflection['framework']['fw_key']);
        $this->assertCount(6, $reflection['entries']);

        $entry = $reflection['entries'][0];
        $this->assertSame('Paired on the importer.', $entry['narrative']);
        $this->assertCount(2, $entry['scores'], 'the self-score and the counter-score both travel');
        $this->assertSame(['self', 'counter'], array_column($entry['scores'], 'scorer_class'));
        $this->assertSame('Good, with more to do on testing.', $entry['scores'][1]['comment']);
    }

    public function test_the_version_in_the_file_is_the_snapshot_not_the_current_one(): void
    {
        $reflection = $this->assessedReflection();

        // The framework is frozen once used, so this can only be done
        // behind the API. It proves the export reports what the student
        // was scored against rather than what the rubric says today.
        $reflection->framework->forceFill(['version' => 'v9'])->save();

        $id = $this->postJson('/api/v1/exports', ['format' => 'json'])->json('id');
        $payload = json_decode(Storage::disk('local')->get(Export::findOrFail($id)->uri), true);

        $this->assertSame('v1', $payload['reflections'][0]['framework']['version']);
    }

    public function test_one_reflection_can_be_exported_on_its_own(): void
    {
        $reflection = $this->assessedReflection();

        // A second reflection that must not appear.
        $gig = Gig::where('title', 'Develop AI use cases')->firstOrFail();
        $this->postJson('/api/v1/reflections', [
            'sprint_id' => $gig->sprints()->where('ordinal', 2)->firstOrFail()->id,
        ])->assertStatus(201);

        $id = $this->postJson('/api/v1/exports', [
            'format' => 'json', 'reflection_id' => $reflection->id,
        ])->assertStatus(202)->json('id');

        $this->getJson("/api/v1/exports/{$id}")->assertJsonPath('summary.reflections', 1);

        $whole = $this->postJson('/api/v1/exports', ['format' => 'json'])->json('id');
        $this->getJson("/api/v1/exports/{$whole}")->assertJsonPath('summary.reflections', 2);
    }

    public function test_the_download_streams_the_file_to_its_owner_only(): void
    {
        $this->assessedReflection();
        $id = $this->postJson('/api/v1/exports', ['format' => 'json'])->json('id');

        $this->get("/api/v1/exports/{$id}/download")
            ->assertOk()
            ->assertDownload("reflection-diary-{$id}.json");

        // Not even a supervisor on the gig. Export is "own" for every role.
        Sanctum::actingAs($this->user('Dr Lee'));
        $this->getJson("/api/v1/exports/{$id}")->assertStatus(404);
        $this->get("/api/v1/exports/{$id}/download")->assertStatus(404);
    }

    public function test_a_failed_export_says_so_rather_than_polling_for_ever(): void
    {
        $this->assessedReflection();

        $export = Export::create([
            'user_id' => $this->user('Jane N')->id,
            'format' => 'json',
            'status' => 'failed',
        ]);

        $this->getJson("/api/v1/exports/{$export->id}")
            ->assertOk()
            ->assertJsonPath('status', 'failed')
            ->assertJsonPath('completed_at', null);

        $this->get("/api/v1/exports/{$export->id}/download")
            ->assertStatus(404)
            ->assertJsonPath('error.details.status', 'failed');
    }

    public function test_a_job_that_throws_marks_the_row_failed(): void
    {
        $export = Export::create([
            'user_id' => $this->user('Jane N')->id,
            // Not a real reflection id, so assembling throws when it
            // tries to build the file.
            'format' => 'json',
            'status' => 'pending',
        ]);

        Storage::shouldReceive('disk')->andThrow(new \RuntimeException('disk is gone'));

        try {
            (new BuildExport($export->id))->handle();
        } catch (\Throwable) {
            // The job rethrows so the queue can retry; the row is what
            // the student sees, and it has to say failed either way.
        }

        $this->assertSame('failed', $export->fresh()->status);
    }

    public function test_pdf_is_refused_clearly_rather_than_quietly_producing_json(): void
    {
        Sanctum::actingAs($this->user('Jane N'));

        $this->postJson('/api/v1/exports', ['format' => 'pdf'])
            ->assertStatus(400)
            ->assertJsonPath('error.code', 'VALIDATION_FAILED');
    }

    public function test_the_history_lists_only_your_own_exports(): void
    {
        $this->assessedReflection();
        $this->postJson('/api/v1/exports', ['format' => 'json'])->assertStatus(202);
        $this->postJson('/api/v1/exports', ['format' => 'json'])->assertStatus(202);

        $this->getJson('/api/v1/exports')->assertOk()->assertJsonCount(2);

        Sanctum::actingAs($this->user('Sam O'));
        $this->getJson('/api/v1/exports')->assertOk()->assertJsonCount(0);
    }

    public function test_exporting_someone_elses_reflection_is_not_found(): void
    {
        $reflection = $this->assessedReflection();

        Sanctum::actingAs($this->user('Sam O'));
        $this->postJson('/api/v1/exports', ['format' => 'json', 'reflection_id' => $reflection->id])
            ->assertStatus(404);
    }
}
