<?php

namespace Tests\Feature;

use App\Models\Gig;
use App\Models\Reflection;
use App\Models\ReflectionEntry;
use App\Models\Score;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReflectionWritePathTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoSeeder::class);
    }

    private function gig(string $title = 'Develop AI use cases'): Gig
    {
        return Gig::where('title', $title)->firstOrFail();
    }

    private function user(string $name): User
    {
        return User::where('display_name', $name)->firstOrFail();
    }

    private function draftForJane(): Reflection
    {
        Sanctum::actingAs($this->user('Jane N'));
        $gig = $this->gig();

        $id = $this->postJson('/api/v1/reflections', [
            'sprint_id' => $gig->sprints()->orderBy('ordinal')->firstOrFail()->id,
        ])->assertStatus(201)->json('id');

        return Reflection::findOrFail($id);
    }

    /** Fill every entry so only the rule under test can fail. */
    private function complete(Reflection $reflection): void
    {
        foreach ($reflection->entries()->with('competency.levels')->get() as $entry) {
            $entry->update(['narrative' => 'What I did, and what I would do differently.']);
            Score::create([
                'reflection_entry_id' => $entry->id,
                'scorer_user_id' => $reflection->user_id,
                'scorer_role' => 'self',
                'level_id' => $entry->competency->levels->first()->id,
            ]);
        }
    }

    public function test_creating_a_reflection_makes_one_entry_per_competency(): void
    {
        $body = $this->draftForJane()->refresh();

        $this->assertSame('draft', $body->status);
        $this->assertSame(6, $body->entries()->count(), 'six competencies, six entries, created eagerly');
        $this->assertSame('v1', $body->framework_version, 'the version is snapshotted at creation');
        $this->assertNotNull($body->gig_id, 'the gig is derived from the sprint');
    }

    public function test_the_gig_is_derived_from_the_sprint(): void
    {
        Sanctum::actingAs($this->user('Jane N'));
        $sprint = $this->gig()->sprints()->orderBy('ordinal')->firstOrFail();

        $this->postJson('/api/v1/reflections', ['sprint_id' => $sprint->id])
            ->assertStatus(201)
            ->assertJsonPath('gig_id', $sprint->gig_id);
    }

    public function test_no_context_is_refused(): void
    {
        Sanctum::actingAs($this->user('Jane N'));

        $this->postJson('/api/v1/reflections', [])
            ->assertStatus(400)
            ->assertJsonPath('error.code', 'CONTEXT_REQUIRED');
    }

    public function test_a_sprint_from_another_gig_is_refused(): void
    {
        Sanctum::actingAs($this->user('Jane N'));

        $this->postJson('/api/v1/reflections', [
            'gig_id' => $this->gig()->id,
            'sprint_id' => $this->gig('Data migration audit')->sprints()->firstOrFail()->id,
        ])->assertStatus(400)->assertJsonPath('error.code', 'CONTEXT_REQUIRED');
    }

    public function test_only_a_student_may_write_one(): void
    {
        Sanctum::actingAs($this->user('Sam O'));

        $this->postJson('/api/v1/reflections', ['gig_id' => $this->gig()->id])
            ->assertStatus(403)->assertJsonPath('error.code', 'ROLE_FORBIDDEN');

        Sanctum::actingAs(User::create(['display_name' => 'Nobody']));
        $this->postJson('/api/v1/reflections', ['gig_id' => $this->gig()->id])
            ->assertStatus(404)->assertJsonPath('error.code', 'NOT_FOUND');
    }

    public function test_a_gig_with_no_rubric_cannot_be_reflected_on(): void
    {
        $gig = $this->gig();
        $gig->assignment->delete();

        Sanctum::actingAs($this->user('Jane N'));

        $this->postJson('/api/v1/reflections', ['gig_id' => $gig->id])
            ->assertStatus(400)->assertJsonPath('error.code', 'FRAMEWORK_NOT_ASSIGNED');
    }

    public function test_two_reflections_for_one_context_is_a_conflict(): void
    {
        $first = $this->draftForJane();

        $this->postJson('/api/v1/reflections', ['sprint_id' => $first->sprint_id])
            ->assertStatus(409)->assertJsonPath('error.code', 'DUPLICATE_REFLECTION');
    }

    public function test_the_owner_autosaves_a_narrative(): void
    {
        $reflection = $this->draftForJane();
        $entry = $reflection->entries()->firstOrFail();

        $this->patchJson("/api/v1/entries/{$entry->id}", ['narrative' => 'Paired on the parser.'])
            ->assertOk()->assertJsonPath('narrative', 'Paired on the parser.');
    }

    public function test_nobody_else_writes_on_someone_elses_reflection(): void
    {
        $reflection = $this->draftForJane();
        $entry = $reflection->entries()->firstOrFail();

        // An assessor can read it but not write it.
        Sanctum::actingAs($this->user('Sam O'));
        $this->patchJson("/api/v1/entries/{$entry->id}", ['narrative' => 'Not mine to write.'])
            ->assertStatus(403)->assertJsonPath('error.code', 'ROLE_FORBIDDEN');

        // A stranger cannot even learn it exists.
        Sanctum::actingAs(User::create(['display_name' => 'Nobody']));
        $this->patchJson("/api/v1/entries/{$entry->id}", ['narrative' => 'Nor mine.'])
            ->assertStatus(404)->assertJsonPath('error.code', 'NOT_FOUND');
    }

    public function test_the_gate_refuses_an_empty_narrative_and_names_the_entries(): void
    {
        $reflection = $this->draftForJane();

        $details = $this->postJson("/api/v1/reflections/{$reflection->id}/submit")
            ->assertStatus(400)
            ->assertJsonPath('error.code', 'NARRATIVE_REQUIRED')
            ->json('error.details.entry_ids');

        $this->assertCount(6, $details, 'all six are blank, so all six are named');
        $this->assertSame('draft', $reflection->fresh()->status);
    }

    public function test_the_gate_refuses_a_missing_self_score(): void
    {
        $reflection = $this->draftForJane();
        foreach ($reflection->entries as $entry) {
            $entry->update(['narrative' => 'Written.']);
        }

        $this->postJson("/api/v1/reflections/{$reflection->id}/submit")
            ->assertStatus(400)
            ->assertJsonPath('error.code', 'SELF_SCORE_MISSING')
            ->assertJsonCount(6, 'error.details.entry_ids');
    }

    public function test_the_gate_refuses_missing_evidence_only_when_the_rubric_asks(): void
    {
        $reflection = $this->draftForJane();
        $this->complete($reflection);

        // La Trobe does not require evidence, so this passes as it stands.
        $reflection->framework->update(['evidence_required' => true]);

        $this->postJson("/api/v1/reflections/{$reflection->id}/submit")
            ->assertStatus(400)
            ->assertJsonPath('error.code', 'EVIDENCE_REQUIRED');

        $reflection->framework->update(['evidence_required' => false]);

        $this->postJson("/api/v1/reflections/{$reflection->id}/submit")->assertOk();
    }

    public function test_a_complete_reflection_submits_and_is_logged(): void
    {
        $reflection = $this->draftForJane();
        $this->complete($reflection);

        $this->postJson("/api/v1/reflections/{$reflection->id}/submit")
            ->assertOk()
            ->assertJsonPath('status', 'submitted');

        $fresh = $reflection->fresh();
        $this->assertNotNull($fresh->submitted_at);

        $this->getJson("/api/v1/reflections/{$reflection->id}/events")
            ->assertOk()
            ->assertJsonPath('0.event_type', 'reflection_submitted')
            ->assertJsonPath('1.event_type', 'reflection_created');
    }

    public function test_submitting_twice_is_a_conflict_and_editing_afterwards_is_refused(): void
    {
        $reflection = $this->draftForJane();
        $this->complete($reflection);
        $this->postJson("/api/v1/reflections/{$reflection->id}/submit")->assertOk();

        $this->postJson("/api/v1/reflections/{$reflection->id}/submit")
            ->assertStatus(409)->assertJsonPath('error.code', 'NOT_DRAFT');

        $entry = $reflection->entries()->firstOrFail();
        $this->patchJson("/api/v1/entries/{$entry->id}", ['narrative' => 'Second thoughts.'])
            ->assertStatus(409)->assertJsonPath('error.code', 'NOT_DRAFT');

        $this->deleteJson("/api/v1/reflections/{$reflection->id}")
            ->assertStatus(409)->assertJsonPath('error.code', 'NOT_DRAFT');
    }

    public function test_a_draft_can_be_deleted_and_takes_its_entries_with_it(): void
    {
        $reflection = $this->draftForJane();
        $entryId = $reflection->entries()->firstOrFail()->id;

        $this->deleteJson("/api/v1/reflections/{$reflection->id}")->assertStatus(204);

        $this->assertNull(Reflection::find($reflection->id));
        $this->assertNull(ReflectionEntry::find($entryId), 'entries cascade with the reflection');
    }

    public function test_a_link_and_a_file_both_attach_as_evidence(): void
    {
        Storage::fake('local');
        $reflection = $this->draftForJane();
        $entry = $reflection->entries()->firstOrFail();

        $this->postJson("/api/v1/entries/{$entry->id}/evidence", [
            'kind' => 'link',
            'label' => 'The pull request',
            'uri' => 'https://github.com/theintonerzero/cse3cap/pull/4',
        ])->assertStatus(201)->assertJsonPath('kind', 'link');

        $this->post("/api/v1/entries/{$entry->id}/evidence", [
            'label' => 'Burndown chart',
            'file' => UploadedFile::fake()->image('burndown.png'),
        ])->assertStatus(201)->assertJsonPath('kind', 'image');

        $this->assertSame(2, $entry->evidence()->count());
    }

    public function test_a_file_the_rubric_refuses_is_rejected_by_type_and_by_size(): void
    {
        Storage::fake('local');
        $reflection = $this->draftForJane();
        $entry = $reflection->entries()->firstOrFail();
        $reflection->framework->update(['accepted_file_types' => ['pdf'], 'max_file_bytes' => 2048]);

        $this->post("/api/v1/entries/{$entry->id}/evidence", [
            'label' => 'Screenshot',
            'file' => UploadedFile::fake()->image('shot.png'),
        ])->assertStatus(400)->assertJsonPath('error.code', 'FILE_TYPE_NOT_ACCEPTED');

        $this->post("/api/v1/entries/{$entry->id}/evidence", [
            'label' => 'A large report',
            'file' => UploadedFile::fake()->create('report.pdf', 64),
        ])->assertStatus(400)->assertJsonPath('error.code', 'FILE_TOO_LARGE');
    }

    public function test_evidence_can_be_removed_while_the_reflection_is_a_draft(): void
    {
        $reflection = $this->draftForJane();
        $entry = $reflection->entries()->firstOrFail();

        $id = $this->postJson("/api/v1/entries/{$entry->id}/evidence", [
            'kind' => 'link', 'label' => 'A link', 'uri' => 'https://example.org/x',
        ])->json('id');

        $this->deleteJson("/api/v1/evidence/{$id}")->assertStatus(204);
        $this->assertSame(0, $entry->evidence()->count());
    }

    public function test_an_assessor_reads_a_reflection_on_their_gig_and_a_classmate_cannot(): void
    {
        $reflection = $this->draftForJane();

        Sanctum::actingAs($this->user('Sam O'));
        $this->getJson("/api/v1/reflections/{$reflection->id}")
            ->assertOk()
            ->assertJsonPath('owner.display_name', 'Jane N')
            ->assertJsonCount(6, 'entries');

        $classmate = User::create(['display_name' => 'Another student']);
        $this->gig()->participants()->create(['user_id' => $classmate->id, 'role' => 'student']);
        Sanctum::actingAs($classmate);

        $this->getJson("/api/v1/reflections/{$reflection->id}")
            ->assertStatus(404)->assertJsonPath('error.code', 'NOT_FOUND');
    }

    public function test_the_list_is_scoped_the_same_way(): void
    {
        $this->draftForJane();

        Sanctum::actingAs($this->user('Jane N'));
        $this->getJson('/api/v1/reflections')->assertOk()->assertJsonCount(1);

        // Sam assesses the first gig, so he sees the reflection on it.
        Sanctum::actingAs($this->user('Sam O'));
        $this->getJson('/api/v1/reflections')->assertOk()->assertJsonCount(1);

        Sanctum::actingAs(User::create(['display_name' => 'Nobody']));
        $this->getJson('/api/v1/reflections')->assertOk()->assertJsonCount(0);
    }
}
