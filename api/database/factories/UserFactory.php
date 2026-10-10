<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A throwaway user, for a test that needs somebody who is not one of the
 * seeded people.
 *
 * Users here are a thin mirror of an Alumable account: a display name and
 * the host platform's id for the same person. There is no name, no email
 * and no password, because identity belongs to the host platform and the
 * MVP authenticates with three seeded tokens. See ADR #15.
 *
 * Laravel's default factory set name, email, email_verified_at, password
 * and remember_token, none of which are columns in this schema. It never
 * failed on them, because User did not use HasFactory and the call died
 * one step earlier. Both are fixed; ModelMappingTest holds it that way.
 *
 * The seeded people are fixed reference data and are not made here.
 * DemoSeeder owns those.
 *
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /** @var class-string<User> */
    protected $model = User::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'display_name' => fake()->name(),
            // Unique when set and nullable, so it has to be unique here.
            // Prefixed because these rows are indistinguishable from real
            // ones otherwise, and the database is shared.
            'external_ref' => 'test-'.fake()->unique()->uuid(),
        ];
    }
}
