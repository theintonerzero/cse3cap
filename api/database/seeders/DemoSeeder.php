<?php

namespace Database\Seeders;

use App\Models\Framework;
use App\Models\FrameworkAssignment;
use App\Models\Gig;
use App\Models\GigParticipant;
use App\Models\Sprint;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/**
 * The minimum needed to exercise the read endpoints by hand: three role
 * holders, two gigs on structurally different frameworks, and sprints
 * with real dates.
 *
 * Sam is an assessor on the first gig only, matching the token table in
 * the README and the API specification. That asymmetry is deliberate: if
 * all three people were on both gigs, nothing would demonstrate that
 * GET /gigs is scoped to the caller, and the test asserting it could not
 * fail.
 *
 * Idempotent by design. The database is shared, and a seeder that
 * duplicates rows on a second run changes what everyone else sees.
 *
 * The cast, and only the cast. The reflections, the shaped scores and the
 * written narratives live in ReflectionSeeder, which calls this one first.
 * They are separate because ten feature test classes seed this as their
 * fixture and then write the reflection they are about to assert on, and a
 * seeded reflection for the same student and sprint collides with every one
 * of them on the one-reflection-per-context unique index. See ADR #37.
 *
 * Keep it minimal for that reason. Something added here is added to ten
 * tests. There is no SQL seed file: these two are canonical.
 */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $jane = User::firstOrCreate(['display_name' => 'Jane N']);
        $sam = User::firstOrCreate(['display_name' => 'Sam O']);
        $lee = User::firstOrCreate(['display_name' => 'Dr Lee']);

        $latrobe = Framework::where('fw_key', 'latrobe6')->firstOrFail();
        $sfia = Framework::where('fw_key', 'sfia9')->firstOrFail();

        $gigs = [
            [
                'title' => 'Develop AI use cases',
                'org_name' => 'Alumable',
                'framework' => $latrobe,
                'participants' => [[$jane, 'student'], [$sam, 'assessor'], [$lee, 'supervisor']],
            ],
            [
                'title' => 'Data migration audit',
                'org_name' => 'La Trobe IT',
                'framework' => $sfia,
                'participants' => [[$jane, 'student'], [$lee, 'supervisor']],
            ],
        ];

        // Three fortnightly sprints from the start of semester. Computed
        // with Carbon rather than by formatting a day number, which
        // produces 2026-08-44 for the third sprint and is rejected by
        // MySQL rather than silently rolling over.
        $start = Carbon::parse('2026-08-03');

        foreach ($gigs as $spec) {
            $gig = Gig::firstOrCreate(
                ['title' => $spec['title']],
                [
                    'org_name' => $spec['org_name'],
                    'starts_on' => $start->toDateString(),
                    'ends_on' => $start->copy()->addWeeks(12)->toDateString(),
                ],
            );

            foreach ([1, 2, 3] as $n) {
                $opens = $start->copy()->addWeeks(2 * ($n - 1));

                Sprint::firstOrCreate(
                    ['gig_id' => $gig->id, 'ordinal' => $n],
                    [
                        'opens_on' => $opens->toDateString(),
                        'due_on' => $opens->copy()->addDays(13)->toDateString(),
                    ],
                );
            }

            foreach ($spec['participants'] as [$user, $role]) {
                GigParticipant::firstOrCreate([
                    'gig_id' => $gig->id, 'user_id' => $user->id, 'role' => $role,
                ]);
            }

            FrameworkAssignment::firstOrCreate(
                ['gig_id' => $gig->id, 'framework_id' => $spec['framework']->id],
                ['assigned_by' => $lee->id],
            );
        }

        $this->issueTokens([$jane, $sam, $lee]);
    }

    /**
     * Sanctum stores a hash, so the plain text exists only here. Print it
     * once; it cannot be recovered later.
     *
     * @param  list<User>  $users
     */
    private function issueTokens(array $users): void
    {
        foreach ($users as $user) {
            if ($user->tokens()->exists()) {
                continue;
            }

            $token = $user->createToken('demo')->plainTextToken;
            $this->command?->info(sprintf('%-8s %s', $user->display_name, $token));
        }
    }
}
