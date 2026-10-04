<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * F2, F3 and F4 in docs/Security-Review.md, as decided in CAP-32 (ADR #46).
 *
 * These go through the real Sanctum guard with a bearer header, not
 * Sanctum::actingAs, because the prefix and the expiry are properties of the
 * token string and its row, which actingAs never looks at.
 */
class TokenPostureTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoSeeder::class);
    }

    private function seeded(): array
    {
        return User::whereIn('display_name', ['Jane N', 'Sam O', 'Dr Lee'])
            ->with('tokens')
            ->get()
            ->flatMap->tokens
            ->all();
    }

    public function test_f4_a_new_token_carries_the_project_prefix_and_still_authenticates(): void
    {
        $jane = User::where('display_name', 'Jane N')->firstOrFail();
        $plain = $jane->createToken('f4')->plainTextToken;

        // Sanctum's plain text is "<id>|<prefix><random><crc32>": the prefix
        // sits after the id, which is where scanners look for it.
        $this->assertMatchesRegularExpression('/^\d+\|rdiary_[A-Za-z0-9]{40}[0-9a-f]{8}$/', $plain);

        $this->withHeader('Authorization', "Bearer {$plain}")
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('display_name', 'Jane N');
    }

    public function test_f2_the_seeded_tokens_expire_rather_than_living_forever(): void
    {
        $tokens = $this->seeded();
        $this->assertCount(3, $tokens);

        foreach ($tokens as $token) {
            $this->assertNotNull($token->expires_at, "{$token->name} token never expires");
            $days = now()->diffInDays($token->expires_at);
            $this->assertEqualsWithDelta(DemoSeeder::TOKEN_LIFETIME_DAYS, $days, 1);
        }
    }

    public function test_f2_an_expired_token_is_refused_in_the_error_envelope(): void
    {
        $jane = User::where('display_name', 'Jane N')->firstOrFail();
        $plain = $jane->createToken('old', ['*'], now()->subMinute())->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$plain}")
            ->getJson('/api/v1/auth/me')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'UNAUTHENTICATED');
    }

    public function test_f3_the_seeded_tokens_keep_every_ability_on_purpose(): void
    {
        // Authorisation is the policies' (CLAUDE.md). Scoping abilities would
        // add a second place it is decided, so the tokens stay ['*'] and a
        // student's token still cannot do an assessor's work (ADR #46).
        foreach ($this->seeded() as $token) {
            $this->assertSame(['*'], $token->abilities);
        }
    }
}
