<?php

namespace Tests\Feature;

use App\Exceptions\ApiException;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Route;
use PDOException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * No RefreshDatabase on purpose. The envelope is the one thing every
 * other test depends on, so it is worth being able to prove it works
 * before the database is reachable.
 */
class ErrorEnvelopeTest extends TestCase
{
    public function test_a_domain_error_renders_the_envelope(): void
    {
        Route::get('/_t/domain', fn () => throw new ApiException(
            'COMMENT_REQUIRED', 'A comment is required.', ['entry_ids' => ['abc']], 400
        ));

        $this->getJson('/_t/domain')
            ->assertStatus(400)
            ->assertExactJson(['error' => [
                'code' => 'COMMENT_REQUIRED',
                'message' => 'A comment is required.',
                'details' => ['entry_ids' => ['abc']],
            ]]);
    }

    /**
     * The regression that getJson() cannot catch: it always sets an
     * Accept header, so a renderer gated on expectsJson() alone looks
     * fine in tests and serves an HTML error page to curl.
     */
    public function test_an_api_path_gets_the_envelope_without_an_accept_header(): void
    {
        Route::get('/api/_t/plain', fn () => throw new ApiException('NOT_DRAFT', 'Not a draft.'));

        $this->get('/api/_t/plain')
            ->assertStatus(400)
            ->assertJsonPath('error.code', 'NOT_DRAFT');
    }

    public function test_an_unauthenticated_request_is_401(): void
    {
        Route::middleware('auth:sanctum')->get('/api/_t/guarded', fn () => ['ok' => true]);

        $this->getJson('/api/_t/guarded')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'UNAUTHENTICATED')
            // Raw, because assertJsonPath decodes to an associative array
            // and cannot tell {} from []. The contract says object, and an
            // empty array here breaks the generated TypeScript type.
            ->assertSee('"details":{}', escape: false);
    }

    /**
     * The 500 that no test caught. Laravel's Authenticate middleware sends
     * a guest to route('login') for any request that did not ask for JSON,
     * and there is no login route here, so a plain curl at a guarded
     * endpoint raised RouteNotFoundException and returned 500. getJson()
     * always sets Accept, so the case above cannot reach it.
     */
    public function test_an_unauthenticated_request_without_an_accept_header_is_still_401(): void
    {
        Route::middleware('auth:sanctum')->get('/api/_t/guarded-plain', fn () => ['ok' => true]);

        $this->get('/api/_t/guarded-plain')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'UNAUTHENTICATED');
    }

    public function test_a_missing_route_is_404_in_the_envelope(): void
    {
        $this->getJson('/api/v1/does-not-exist')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'NOT_FOUND');
    }

    /**
     * @return array<string, array{string, string, string}>
     */
    public static function duplicateIndexes(): array
    {
        return [
            'reflection context' => ['reflections', 'ak_reflections_context', 'DUPLICATE_REFLECTION'],
            'framework assignment' => ['framework_assignments', 'ak_fw_assignments', 'DUPLICATE_ASSIGNMENT'],
            'repeat counter-score' => ['scores', 'ak_scores', 'ALREADY_SCORED'],
        ];
    }

    #[DataProvider('duplicateIndexes')]
    public function test_each_unique_index_maps_to_its_own_conflict_code(
        string $table,
        string $index,
        string $expected
    ): void {
        Route::get('/_t/dupe', fn () => throw $this->duplicateEntry($table, $index));

        $this->getJson('/_t/dupe')
            ->assertStatus(409)
            ->assertJsonPath('error.code', $expected);
    }

    /**
     * A 1062 on an index nobody can reach through ordinary use is a bug in
     * ours, not a client error, and must not be dressed up as a conflict.
     */
    public function test_an_unmapped_duplicate_is_not_turned_into_a_409(): void
    {
        Route::get('/_t/dupe-unmapped', fn () => throw $this->duplicateEntry('users', 'ak_users_external_ref'));

        $this->withoutExceptionHandling()
            ->expectException(QueryException::class);

        $this->getJson('/_t/dupe-unmapped');
    }

    /**
     * Shaped like the real thing. errorInfo is what Laravel populates from
     * PDO and the message is what MySQL actually sends, including the
     * index name, which is the only place the offending constraint is
     * named.
     */
    private function duplicateEntry(string $table, string $index): QueryException
    {
        $pdo = new PDOException(
            'SQLSTATE[23000]: Integrity constraint violation: 1062 '
            ."Duplicate entry 'x-y' for key '{$table}.{$index}'"
        );
        $pdo->errorInfo = ['23000', 1062, "Duplicate entry 'x-y' for key '{$table}.{$index}'"];

        return new QueryException('mysql', "insert into `{$table}` ...", [], $pdo);
    }
}
