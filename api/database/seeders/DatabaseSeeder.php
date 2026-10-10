<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

/**
 * `php artisan db:seed`, and the whole demo behind one command.
 *
 * ReflectionSeeder calls DemoSeeder itself, so the cast is in place
 * before the record that references it. Both are idempotent, so this is
 * safe to run against a database that already has some of it.
 *
 * DemoSeeder is still worth running on its own when all you want is the
 * people, the gigs and the three tokens:
 *
 *     php artisan db:seed --class=DemoSeeder
 */
class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $this->call(ReflectionSeeder::class);
    }
}
