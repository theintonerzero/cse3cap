# API Foundation and Read Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Laravel 13 API with its conventions, auth and error handling, and ship the five read-only endpoints that prove the stack works end to end against the live database.

**Architecture:** A Laravel 13 application in `api/`, layered as route → FormRequest → Policy → Service → Controller. The database schema already exists and is applied centrally; Laravel adopts it via a baseline migration recorded as already-run on the shared instance. Every response, success or failure, goes through one serialisation path so the error envelope is impossible to bypass.

**Tech Stack:** PHP 8.5.9, Laravel 13, Sanctum 4, MySQL 9.7.2 over TLS, PHPUnit via `php artisan test`.

## Global Constraints

- PHP 8.5, Laravel 13, Sanctum 4. Do not add packages beyond these without asking.
- Primary keys are `char(36)` UUIDs. Every model needs `HasUuids`, `$keyType = 'string'`, `$incrementing = false`.
- snake_case in the database, in JSON, and in frontend types. There is no mapping layer. Never camelCase an API field.
- Never write to `reflections.gig_key` or `reflections.sprint_key`. They are database-generated and must stay out of `$fillable`.
- Never accept a role from the client. Roles resolve server-side from `gig_participants`.
- Every non-2xx response uses the envelope `{ "error": { "code", "message", "details" } }`.
- 400 validation or rule failure, 401 bad token, 403 wrong role, 404 not found or not yours, 409 conflict.
- Never weaken a database constraint. Never run `migrate` against `reflection_diary` on the shared host.
- All timestamps are `DATETIME(6)`, UTC by convention. Never `TIMESTAMP`.
- Update `docs/openapi.yaml` in the same commit as any endpoint change. It stays on OpenAPI 3.1.
- Commit messages follow `<type>(<scope>): <description>`. Types: feat fix refactor chore style docs test ci.

## Prerequisites

Already done, do not redo:

- MySQL 9.7.2 is live at `rddb.darkovski.dev:3306`, database `reflection_diary`, 14 tables applied, two frameworks seeded. Views come to five once the patch below is run.
- `diary_app` holds DML plus DDL on `reflection_diary` and on `reflection\_diary\_test\_%`, verified by creating and dropping a test database.
- `db/letsencrypt-roots.pem` is committed. TLS is mandatory and PDO fails with a misleading `Access denied` without it.
- PHP 8.5.9 and Composer 2.10.2 are installed. `scripts/setup.sh` checks both, and Node 24 for the frontend, so run that rather than a package manager command if anything is missing.

Required before Task 1:

- The analytics-view and export-status fix (ADR #23, #24, #25) is merged to `dev` and
  `db/patches/2026-08-18-analytics-views-and-export-status.sql` has been run against
  `reflection_diary`. Task 2 baselines `db/01-schema.sql` verbatim, so a shared instance
  still on the old views would be recorded as matching a schema it does not match.

---

### Task 1: Scaffold Laravel and prove the database connection

**Files:**
- Create: `api/` (whole Laravel skeleton)
- Create: `api/.env` (not committed)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: a bootable Laravel app in `api/` whose default connection reaches `reflection_diary` over TLS.

- [ ] **Step 1: Create the project**

```bash
cd "$(git rev-parse --show-toplevel)"
composer create-project laravel/laravel api
cd api
php artisan --version    # expect "Laravel Framework 13.x"
```

- [ ] **Step 2: Install the API scaffolding and Sanctum**

```bash
php artisan install:api
```

Answer no if it offers to run migrations. We are not migrating yet.

- [ ] **Step 3: Write the environment file**

```bash
cp ../.env.example .env
php artisan key:generate
```

Then open `api/.env` and set `DB_PASSWORD` to the `diary_app` password from the team channel. Confirm these lines are present and correct:

```
DB_CONNECTION=mysql
DB_HOST=rddb.darkovski.dev
DB_PORT=3306
DB_DATABASE=reflection_diary
DB_USERNAME=diary_app
MYSQL_ATTR_SSL_CA=../db/letsencrypt-roots.pem
```

- [ ] **Step 4: Prove the connection reaches the real data**

```bash
php artisan tinker --execute="echo DB::table('frameworks')->pluck('fw_key')->implode(',');"
```

Expected output: `latrobe6,sfia9`

If this returns `Access denied`, `MYSQL_ATTR_SSL_CA` is wrong or missing. That error does not mean the password is wrong.

- [ ] **Step 5: Ignore the vendor tree and local env**

Confirm `.gitignore` at the repository root already covers `/vendor` and `.env`. Add `api/vendor` and `api/.env` if the existing patterns do not match from the root.

- [ ] **Step 6: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add api .gitignore
git commit -m "feat(api): scaffold Laravel 13 with Sanctum"
```

---

### Task 2: Baseline the schema as a migration

**Files:**
- Create: `api/database/migrations/0001_01_01_000000_create_reflection_diary_schema.php`
- Delete: the three stock Laravel migrations in `api/database/migrations/` (users, cache, jobs)
- Modify: `api/config/database.php`
- Modify: `api/phpunit.xml`

**Interfaces:**
- Consumes: `db/01-schema.sql`.
- Produces: `php artisan migrate:fresh` builds the entire schema in a test database. The shared instance records the migration as already-run.

- [ ] **Step 1: Remove the stock migrations**

Laravel ships migrations for `users`, `cache` and `jobs`. Our `users` table already exists with a different shape and we do not use the others.

```bash
cd api
rm database/migrations/0001_01_01_000000_create_users_table.php
rm database/migrations/0001_01_01_000001_create_cache_table.php
rm database/migrations/0001_01_01_000002_create_jobs_table.php
```

- [ ] **Step 2: Write the baseline migration**

Create `api/database/migrations/0001_01_01_000000_create_reflection_diary_schema.php`. The `up()` method reads `db/01-schema.sql` and executes it statement by statement. Do not hand-translate the DDL into the Schema builder: the CHECK constraints, generated columns and views have no fluent equivalent, and a second hand-written copy of the schema would drift from the first.

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Baseline. db/01-schema.sql is the reviewed source of truth and this
 * migration executes it verbatim rather than restating it, because a
 * second copy of the schema would drift from the first. On the shared
 * instance this migration is recorded as already run and never executes.
 */
return new class extends Migration
{
    public function up(): void
    {
        $path = base_path('../db/01-schema.sql');
        $sql = file_get_contents($path);

        if ($sql === false) {
            throw new RuntimeException("Cannot read schema at {$path}");
        }

        foreach ($this->statements($sql) as $statement) {
            DB::unprepared($statement);
        }
    }

    public function down(): void
    {
        $tables = [
            'exports', 'events', 'evidence', 'scores', 'reflection_entries',
            'reflections', 'framework_assignments', 'levels', 'competencies',
            'frameworks', 'gig_participants', 'sprints', 'gigs', 'users',
        ];

        DB::statement('SET FOREIGN_KEY_CHECKS=0');
        foreach (['v_coverage_gaps', 'v_calibration_gap', 'v_radar', 'v_entry_score', 'v_framework_scale'] as $view) {
            DB::statement("DROP VIEW IF EXISTS {$view}");
        }
        foreach ($tables as $table) {
            DB::statement("DROP TABLE IF EXISTS {$table}");
        }
        DB::statement('SET FOREIGN_KEY_CHECKS=1');
    }

    /**
     * Split on semicolons that end a statement, ignoring those inside
     * quoted strings and line comments. The seed block contains
     * semicolons inside descriptor text, so a naive explode breaks it.
     *
     * @return list<string>
     */
    private function statements(string $sql): array
    {
        $out = [];
        $buf = '';
        $inSingle = false;
        $inComment = false;
        $len = strlen($sql);

        for ($i = 0; $i < $len; $i++) {
            $ch = $sql[$i];
            $next = $i + 1 < $len ? $sql[$i + 1] : '';

            if ($inComment) {
                $buf .= $ch;
                if ($ch === "\n") {
                    $inComment = false;
                }
                continue;
            }

            if (! $inSingle && $ch === '-' && $next === '-') {
                $inComment = true;
                $buf .= $ch;
                continue;
            }

            if ($ch === "'" && ($i === 0 || $sql[$i - 1] !== '\\')) {
                $inSingle = ! $inSingle;
            }

            if ($ch === ';' && ! $inSingle) {
                $trimmed = trim($buf);
                if ($trimmed !== '' && ! $this->isOnlyComments($trimmed)) {
                    $out[] = $trimmed;
                }
                $buf = '';
                continue;
            }

            $buf .= $ch;
        }

        $trimmed = trim($buf);
        if ($trimmed !== '' && ! $this->isOnlyComments($trimmed)) {
            $out[] = $trimmed;
        }

        return $out;
    }

    private function isOnlyComments(string $chunk): bool
    {
        foreach (explode("\n", $chunk) as $line) {
            $line = trim($line);
            if ($line !== '' && ! str_starts_with($line, '--')) {
                return false;
            }
        }

        return true;
    }
};
```

- [ ] **Step 3: Add the test connection**

In `api/config/database.php`, inside the `connections` array, add a `mysql_test` entry that copies `mysql` but takes its database name from `DB_TEST_DATABASE`:

```php
'mysql_test' => array_merge(
    require __DIR__.'/database_mysql_defaults.php',
    ['database' => env('DB_TEST_DATABASE', 'reflection_diary_test_local')],
),
```

If extracting shared defaults into another file feels heavy, duplicate the `mysql` block and change only `database`. Keep `MYSQL_ATTR_SSL_CA` in the options either way, or the test connection will fail with `Access denied`.

- [ ] **Step 4: Point PHPUnit at the test connection**

In `api/phpunit.xml`, inside `<php>`, add:

```xml
<env name="DB_CONNECTION" value="mysql_test"/>
<env name="DB_TEST_DATABASE" value="reflection_diary_test_jesse"/>
```

Every developer changes the suffix to their own name. Two people sharing one test database will fight over `migrate:fresh`.

- [ ] **Step 5: Create your test database**

```bash
php artisan tinker --execute="DB::connection('mysql')->statement('CREATE DATABASE IF NOT EXISTS reflection_diary_test_jesse');"
```

- [ ] **Step 6: Prove the baseline builds the whole schema**

```bash
php artisan migrate:fresh --database=mysql_test
php artisan tinker --execute="
  \$c = DB::connection('mysql_test');
  echo 'tables=', \$c->table('information_schema.tables')->where('table_schema','reflection_diary_test_jesse')->where('table_type','BASE TABLE')->count();
  echo ' views=', \$c->table('information_schema.tables')->where('table_schema','reflection_diary_test_jesse')->where('table_type','VIEW')->count();
"
```

Expected: `tables=14 views=4`

- [ ] **Step 7: Record the baseline as already applied on the shared instance**

This is the step that makes `migrate` safe for everyone else. It inserts the migration row without executing the migration.

```bash
php artisan migrate --pretend    # confirm it would only run the baseline
php artisan tinker --execute="
  DB::table('migrations')->insertOrIgnore([
    'migration' => '0001_01_01_000000_create_reflection_diary_schema',
    'batch' => 1,
  ]);
"
php artisan migrate:status
```

Expected: the baseline shows as `Ran`. If `migrations` does not exist yet, run `php artisan migrate:install` first, which creates only that bookkeeping table.

- [ ] **Step 8: Confirm migrate is now a no-op against the shared database**

```bash
php artisan migrate
```

Expected: `Nothing to migrate.`

- [ ] **Step 9: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add api/database api/config/database.php api/phpunit.xml
git commit -m "feat(api): baseline the reviewed schema as a migration"
```

---

### Task 3: Base model and the fourteen Eloquent models

**Files:**
- Create: `api/app/Models/Concerns/HasUuidPrimaryKey.php`
- Create: fourteen model files in `api/app/Models/`
- Test: `api/tests/Feature/ModelMappingTest.php`

**Interfaces:**
- Consumes: the schema from Task 2.
- Produces: `App\Models\{User, Gig, Sprint, GigParticipant, Framework, Competency, Level, FrameworkAssignment, Reflection, ReflectionEntry, Score, Evidence, Event, Export}`, each with `$table`, correct timestamp handling, `$fillable`, and relationships.

- [ ] **Step 1: Write the failing test**

Create `api/tests/Feature/ModelMappingTest.php`:

```php
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd api && php artisan test --filter=ModelMappingTest
```

Expected: FAIL, `Class "App\Models\Framework" not found`.

- [ ] **Step 3: Write the shared trait**

Create `api/app/Models/Concerns/HasUuidPrimaryKey.php`:

```php
<?php

namespace App\Models\Concerns;

use Illuminate\Database\Eloquent\Concerns\HasUuids;

/**
 * Ids are char(36) uuids, not auto-increment integers. They appear in
 * exported records and URLs, where sequential integers would leak row
 * counts and let someone enumerate other students' reflections.
 */
trait HasUuidPrimaryKey
{
    use HasUuids;

    public function initializeHasUuidPrimaryKey(): void
    {
        $this->keyType = 'string';
        $this->incrementing = false;
    }
}
```

- [ ] **Step 4: Write the four framework-engine models**

The schema gives `frameworks`, `competencies` and `levels` no timestamp columns at all, so `$timestamps` is false. `framework_assignments` has `assigned_at` only.

Create `api/app/Models/Framework.php`:

```php
<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Framework extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'frameworks';

    public $timestamps = false;

    protected $fillable = [
        'created_by', 'fw_key', 'version', 'name', 'is_active',
        'comment_required', 'evidence_required',
        'accepted_file_types', 'max_file_bytes',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'comment_required' => 'boolean',
        'evidence_required' => 'boolean',
        'accepted_file_types' => 'array',
        'max_file_bytes' => 'integer',
    ];

    public function competencies(): HasMany
    {
        return $this->hasMany(Competency::class)->orderBy('position');
    }

    public function reflections(): HasMany
    {
        return $this->hasMany(Reflection::class);
    }
}
```

Create `api/app/Models/Competency.php`:

```php
<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Competency extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'competencies';

    public $timestamps = false;

    protected $fillable = ['framework_id', 'code', 'name', 'category', 'position', 'short_label'];

    protected $casts = ['position' => 'integer'];

    public function framework(): BelongsTo
    {
        return $this->belongsTo(Framework::class);
    }

    /**
     * Levels hang off competencies, not frameworks, because a SFIA skill
     * is only valid across part of the seven-point scale.
     */
    public function levels(): HasMany
    {
        return $this->hasMany(Level::class)->orderBy('level_value');
    }
}
```

Create `api/app/Models/Level.php`:

```php
<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Level extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'levels';

    public $timestamps = false;

    protected $fillable = ['competency_id', 'level_value', 'descriptor'];

    protected $casts = ['level_value' => 'integer'];

    public function competency(): BelongsTo
    {
        return $this->belongsTo(Competency::class);
    }
}
```

Create `api/app/Models/FrameworkAssignment.php`:

```php
<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FrameworkAssignment extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'framework_assignments';

    public const CREATED_AT = 'assigned_at';
    public const UPDATED_AT = null;

    protected $fillable = ['framework_id', 'gig_id', 'assigned_by'];

    protected $casts = ['assigned_at' => 'datetime'];

    public function framework(): BelongsTo
    {
        return $this->belongsTo(Framework::class);
    }

    public function gig(): BelongsTo
    {
        return $this->belongsTo(Gig::class);
    }
}
```

- [ ] **Step 5: Write the four integration-seam models**

Create `api/app/Models/User.php`, replacing the stock Laravel model entirely. Our `users` table has `id`, `external_ref`, `display_name`, `created_at` and nothing else. No email, no password.

```php
<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Laravel\Sanctum\HasApiTokens;

/**
 * A thin local mirror of an Alumable user. external_ref holds their id
 * for the same person and is the entire coupling surface. There is no
 * password column: identity belongs to the host platform, and the MVP
 * authenticates with three seeded tokens.
 */
class User extends Authenticatable
{
    use HasApiTokens, HasUuidPrimaryKey;

    protected $table = 'users';

    public const CREATED_AT = 'created_at';
    public const UPDATED_AT = null;

    protected $fillable = ['external_ref', 'display_name'];

    protected $casts = ['created_at' => 'datetime'];

    public function participations(): HasMany
    {
        return $this->hasMany(GigParticipant::class);
    }

    public function reflections(): HasMany
    {
        return $this->hasMany(Reflection::class);
    }
}
```

Create `api/app/Models/Gig.php`:

```php
<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Gig extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'gigs';

    public const CREATED_AT = 'created_at';
    public const UPDATED_AT = null;

    protected $fillable = ['external_ref', 'title', 'org_name', 'starts_on', 'ends_on'];

    protected $casts = [
        'starts_on' => 'date',
        'ends_on' => 'date',
        'created_at' => 'datetime',
    ];

    public function sprints(): HasMany
    {
        return $this->hasMany(Sprint::class)->orderBy('ordinal');
    }

    public function participants(): HasMany
    {
        return $this->hasMany(GigParticipant::class);
    }

    public function assignment(): HasOne
    {
        return $this->hasOne(FrameworkAssignment::class);
    }

    public function reflections(): HasMany
    {
        return $this->hasMany(Reflection::class);
    }
}
```

Create `api/app/Models/Sprint.php`:

```php
<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Sprint extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'sprints';

    public $timestamps = false;

    protected $fillable = ['gig_id', 'ordinal', 'opens_on', 'due_on'];

    protected $casts = [
        'ordinal' => 'integer',
        'opens_on' => 'date',
        'due_on' => 'date',
    ];

    public function gig(): BelongsTo
    {
        return $this->belongsTo(Gig::class);
    }
}
```

Create `api/app/Models/GigParticipant.php`:

```php
<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Role lives here, not on users, because the same person can be a
 * student on one gig and an assessor on another. Every authorisation
 * decision resolves through this table.
 */
class GigParticipant extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'gig_participants';

    public $timestamps = false;

    protected $fillable = ['gig_id', 'user_id', 'role'];

    public function gig(): BelongsTo
    {
        return $this->belongsTo(Gig::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
```

- [ ] **Step 6: Write the record and audit models**

Create `api/app/Models/Reflection.php`:

```php
<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Reflection extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'reflections';

    /**
     * gig_key and sprint_key are database-generated and deliberately
     * absent from $fillable. Writing to them is an error; a duplicate
     * context surfaces as MySQL 1062 and is rendered as
     * 409 DUPLICATE_REFLECTION.
     */
    protected $fillable = [
        'user_id', 'sprint_id', 'gig_id',
        'framework_id', 'framework_version', 'status', 'submitted_at',
    ];

    protected $casts = [
        'submitted_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function gig(): BelongsTo
    {
        return $this->belongsTo(Gig::class);
    }

    public function sprint(): BelongsTo
    {
        return $this->belongsTo(Sprint::class);
    }

    public function framework(): BelongsTo
    {
        return $this->belongsTo(Framework::class);
    }

    public function entries(): HasMany
    {
        return $this->hasMany(ReflectionEntry::class);
    }
}
```

Create `api/app/Models/ReflectionEntry.php`:

```php
<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReflectionEntry extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'reflection_entries';

    protected $fillable = ['reflection_id', 'competency_id', 'narrative'];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function reflection(): BelongsTo
    {
        return $this->belongsTo(Reflection::class);
    }

    public function competency(): BelongsTo
    {
        return $this->belongsTo(Competency::class);
    }

    public function scores(): HasMany
    {
        return $this->hasMany(Score::class);
    }

    public function evidence(): HasMany
    {
        return $this->hasMany(Evidence::class);
    }
}
```

Create `api/app/Models/Score.php`:

```php
<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Scores are rows, not self_score and assessor_score columns. Each row
 * is one scorer's opinion tagged with scorer_role, so the radar is one
 * query grouped by role and a new scorer type needs no migration.
 */
class Score extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'scores';

    public const CREATED_AT = 'scored_at';
    public const UPDATED_AT = null;

    protected $fillable = [
        'reflection_entry_id', 'scorer_user_id', 'scorer_role', 'level_id', 'comment',
    ];

    protected $casts = ['scored_at' => 'datetime'];

    public function entry(): BelongsTo
    {
        return $this->belongsTo(ReflectionEntry::class, 'reflection_entry_id');
    }

    public function level(): BelongsTo
    {
        return $this->belongsTo(Level::class);
    }

    public function scorer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'scorer_user_id');
    }
}
```

Create `api/app/Models/Evidence.php`:

```php
<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Evidence extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'evidence';

    public const CREATED_AT = 'uploaded_at';
    public const UPDATED_AT = null;

    protected $fillable = ['reflection_entry_id', 'kind', 'label', 'uri', 'size_bytes'];

    protected $casts = [
        'size_bytes' => 'integer',
        'uploaded_at' => 'datetime',
    ];

    public function entry(): BelongsTo
    {
        return $this->belongsTo(ReflectionEntry::class, 'reflection_entry_id');
    }
}
```

Create `api/app/Models/Event.php`:

```php
<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Event extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'events';

    public const CREATED_AT = 'occurred_at';
    public const UPDATED_AT = null;

    protected $fillable = ['reflection_id', 'actor_user_id', 'event_type', 'metadata'];

    protected $casts = [
        'metadata' => 'array',
        'occurred_at' => 'datetime',
    ];

    public function reflection(): BelongsTo
    {
        return $this->belongsTo(Reflection::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
```

Create `api/app/Models/Export.php`:

```php
<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Export extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'exports';

    public const CREATED_AT = 'requested_at';
    public const UPDATED_AT = null;

    protected $fillable = ['user_id', 'reflection_id', 'format', 'status', 'uri', 'summary', 'completed_at'];

    protected $casts = [
        'summary' => 'array',
        'requested_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
```

- [ ] **Step 7: Run the test and watch it pass**

```bash
cd api && php artisan test --filter=ModelMappingTest
```

Expected: 3 passing tests. `RefreshDatabase` runs the baseline migration against your test database, which includes the seeded frameworks.

- [ ] **Step 8: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add api/app/Models api/tests/Feature/ModelMappingTest.php
git commit -m "feat(api): add uuid base model and the fourteen eloquent models"
```

---

### Task 4: The error envelope

**Files:**
- Create: `api/app/Exceptions/ApiException.php`
- Modify: `api/bootstrap/app.php`
- Test: `api/tests/Feature/ErrorEnvelopeTest.php`

**Interfaces:**
- Consumes: nothing.
- Produces: `App\Exceptions\ApiException::__construct(string $code, string $message, array $details = [], int $status = 400)`. Every non-2xx JSON response carries `{"error": {"code","message","details"}}`.

- [ ] **Step 1: Write the failing test**

Create `api/tests/Feature/ErrorEnvelopeTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Exceptions\ApiException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class ErrorEnvelopeTest extends TestCase
{
    use RefreshDatabase;

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

    public function test_an_unauthenticated_request_is_401(): void
    {
        $this->getJson('/api/v1/auth/me')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'UNAUTHENTICATED');
    }

    public function test_a_missing_route_is_404_in_the_envelope(): void
    {
        $this->getJson('/api/v1/does-not-exist')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'NOT_FOUND');
    }

    public function test_a_duplicate_reflection_becomes_409(): void
    {
        Route::get('/_t/dupe', function () {
            throw new \Illuminate\Database\QueryException(
                'mysql', 'insert into reflections', [],
                new \PDOException('SQLSTATE[23000]: Integrity constraint violation: 1062 Duplicate entry')
            );
        });

        $this->getJson('/_t/dupe')
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'DUPLICATE_REFLECTION');
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd api && php artisan test --filter=ErrorEnvelopeTest
```

Expected: FAIL, `Class "App\Exceptions\ApiException" not found`.

- [ ] **Step 3: Write the exception**

Create `api/app/Exceptions/ApiException.php`:

```php
<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * A business-rule or domain failure that the client is expected to
 * handle by switching on the code. Codes are enumerated in
 * docs/openapi.yaml; do not invent one without adding it there.
 */
class ApiException extends RuntimeException
{
    public function __construct(
        public readonly string $code,
        string $message,
        public readonly array $details = [],
        public readonly int $status = 400,
    ) {
        parent::__construct($message);
    }
}
```

- [ ] **Step 4: Register the renderer**

In `api/bootstrap/app.php`, replace the `->withExceptions(...)` closure body with:

```php
->withExceptions(function (Illuminate\Foundation\Configuration\Exceptions $exceptions) {
    // One envelope for every non-2xx JSON response. Registered centrally
    // so no controller can bypass it by returning its own shape.
    $envelope = fn (string $code, string $message, array $details, int $status)
        => response()->json(['error' => compact('code', 'message', 'details')], $status);

    $exceptions->render(function (App\Exceptions\ApiException $e) use ($envelope) {
        return $envelope($e->code, $e->getMessage(), $e->details, $e->status);
    });

    $exceptions->render(function (Illuminate\Validation\ValidationException $e, $request) use ($envelope) {
        if (! $request->expectsJson()) {
            return null;
        }

        return $envelope('VALIDATION_FAILED', 'The request payload is invalid.', $e->errors(), 400);
    });

    $exceptions->render(function (Illuminate\Auth\AuthenticationException $e, $request) use ($envelope) {
        if (! $request->expectsJson()) {
            return null;
        }

        return $envelope('UNAUTHENTICATED', 'A valid bearer token is required.', [], 401);
    });

    $exceptions->render(function (Illuminate\Auth\Access\AuthorizationException $e, $request) use ($envelope) {
        if (! $request->expectsJson()) {
            return null;
        }

        return $envelope('ROLE_FORBIDDEN', 'Your role on this gig does not permit that.', [], 403);
    });

    // Not found and not yours are deliberately indistinguishable.
    $exceptions->render(function (Symfony\Component\HttpKernel\Exception\NotFoundHttpException $e, $request) use ($envelope) {
        if (! $request->expectsJson()) {
            return null;
        }

        return $envelope('NOT_FOUND', 'No such resource, or it is not yours.', [], 404);
    });

    $exceptions->render(function (Illuminate\Database\Eloquent\ModelNotFoundException $e, $request) use ($envelope) {
        if (! $request->expectsJson()) {
            return null;
        }

        return $envelope('NOT_FOUND', 'No such resource, or it is not yours.', [], 404);
    });

    // The unique index on (user_id, gig_key, sprint_key) is what stops a
    // student creating two reflections for one context. It surfaces as
    // MySQL 1062 and belongs to the contract as a 409.
    $exceptions->render(function (Illuminate\Database\QueryException $e, $request) use ($envelope) {
        if (! $request->expectsJson() || ($e->errorInfo[1] ?? null) !== 1062) {
            return null;
        }

        return $envelope('DUPLICATE_REFLECTION', 'A reflection already exists for that context.', [], 409);
    });
})
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
cd api && php artisan test --filter=ErrorEnvelopeTest
```

Expected: 4 passing tests. The 401 case needs the route from Task 6; if it is not yet defined this one test fails with 404. Comment it out and re-enable it in Task 6, or run Task 6 first.

- [ ] **Step 6: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add api/app/Exceptions api/bootstrap/app.php api/tests/Feature/ErrorEnvelopeTest.php
git commit -m "feat(api): render every error through one envelope"
```

---

### Task 5: Demo seeder with the three tokens

**Files:**
- Create: `api/database/seeders/DemoSeeder.php`
- Modify: `api/database/seeders/DatabaseSeeder.php`
- Test: `api/tests/Feature/DemoSeederTest.php`

**Interfaces:**
- Consumes: models from Task 3.
- Produces: three users named `Jane N`, `Sam O`, `Dr Lee`, each with a Sanctum token whose plain text is printed once; two gigs with sprints, participants and a framework assignment.

- [ ] **Step 1: Write the failing test**

Create `api/tests/Feature/DemoSeederTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Gig;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DemoSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_creates_three_role_holders_across_two_gigs(): void
    {
        $this->seed(DemoSeeder::class);

        $this->assertSame(3, User::count());
        $this->assertSame(2, Gig::count());

        $jane = User::where('display_name', 'Jane N')->firstOrFail();
        $this->assertSame(['student', 'student'], $jane->participations->pluck('role')->sort()->values()->all());

        $lee = User::where('display_name', 'Dr Lee')->firstOrFail();
        $this->assertContains('supervisor', $lee->participations->pluck('role')->all());
    }

    public function test_every_gig_has_a_framework_and_sprints(): void
    {
        $this->seed(DemoSeeder::class);

        foreach (Gig::with(['sprints', 'assignment'])->get() as $gig) {
            $this->assertNotNull($gig->assignment, "{$gig->title} has no framework assigned");
            $this->assertGreaterThanOrEqual(2, $gig->sprints->count());
        }
    }

    public function test_it_is_idempotent(): void
    {
        $this->seed(DemoSeeder::class);
        $this->seed(DemoSeeder::class);

        $this->assertSame(3, User::count());
        $this->assertSame(2, Gig::count());
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd api && php artisan test --filter=DemoSeederTest
```

Expected: FAIL, `Class "Database\Seeders\DemoSeeder" not found`.

- [ ] **Step 3: Write the seeder**

Create `api/database/seeders/DemoSeeder.php`:

```php
<?php

namespace Database\Seeders;

use App\Models\Framework;
use App\Models\FrameworkAssignment;
use App\Models\Gig;
use App\Models\GigParticipant;
use App\Models\Sprint;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * The minimum needed to exercise the read endpoints by hand: three role
 * holders, two gigs on different frameworks, and sprints with dates.
 *
 * Idempotent by design. The database is shared, and a seeder that
 * duplicates rows on a second run changes what everyone else sees.
 *
 * This does not yet attempt the shaped score distribution or the written
 * narratives described in the seed-data skill. Those arrive with the
 * reflection and scoring slices, as additions to this seeder. There is
 * no SQL seed file: DemoSeeder is canonical.
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
            ['Develop AI use cases', 'Alumable', $latrobe],
            ['Data migration audit', 'La Trobe IT', $sfia],
        ];

        foreach ($gigs as [$title, $org, $framework]) {
            $gig = Gig::firstOrCreate(
                ['title' => $title],
                ['org_name' => $org, 'starts_on' => '2026-08-03', 'ends_on' => '2026-10-31'],
            );

            foreach ([1, 2, 3] as $n) {
                Sprint::firstOrCreate(
                    ['gig_id' => $gig->id, 'ordinal' => $n],
                    [
                        'opens_on' => sprintf('2026-08-%02d', 3 + ($n - 1) * 14),
                        'due_on' => sprintf('2026-08-%02d', 16 + ($n - 1) * 14),
                    ],
                );
            }

            foreach ([[$jane, 'student'], [$sam, 'assessor'], [$lee, 'supervisor']] as [$user, $role]) {
                GigParticipant::firstOrCreate([
                    'gig_id' => $gig->id, 'user_id' => $user->id, 'role' => $role,
                ]);
            }

            FrameworkAssignment::firstOrCreate(
                ['gig_id' => $gig->id, 'framework_id' => $framework->id],
                ['assigned_by' => $lee->id],
            );
        }

        $this->issueTokens([$jane, $sam, $lee]);
    }

    /**
     * Sanctum stores a hash, so the plain text exists only here. Print
     * it once; it cannot be recovered later.
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
```

- [ ] **Step 4: Register it**

In `api/database/seeders/DatabaseSeeder.php`, replace the body of `run()` with:

```php
$this->call(DemoSeeder::class);
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
cd api && php artisan test --filter=DemoSeederTest
```

Expected: 3 passing tests.

- [ ] **Step 6: Seed the shared database and capture the tokens**

`personal_access_tokens` is a Sanctum table not present in `db/01-schema.sql`. Create it on the shared instance first:

```bash
php artisan migrate --path=vendor/laravel/sanctum/database/migrations
php artisan db:seed --class=DemoSeeder
```

Copy the three printed tokens into the team channel. They cannot be recovered afterwards.

- [ ] **Step 7: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add api/database/seeders api/tests/Feature/DemoSeederTest.php
git commit -m "feat(api): seed three role holders and two gigs for the demo"
```

---

### Task 6: Role resolution and GET /auth/me

**Files:**
- Create: `api/app/Services/RoleResolver.php`
- Create: `api/app/Http/Controllers/Api/V1/AuthController.php`
- Create: `api/app/Http/Resources/MeResource.php`
- Modify: `api/routes/api.php`
- Modify: `docs/openapi.yaml`
- Test: `api/tests/Feature/AuthMeTest.php`

**Interfaces:**
- Consumes: models from Task 3, seeder from Task 5.
- Produces: `App\Services\RoleResolver::for(User $user, Gig $gig): ?string` returning `student|assessor|supervisor|employer|null`. Route `GET /api/v1/auth/me`.

- [ ] **Step 1: Write the failing test**

Create `api/tests/Feature/AuthMeTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Gig;
use App\Models\User;
use App\Services\RoleResolver;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuthMeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoSeeder::class);
    }

    public function test_it_returns_the_caller_and_their_participations(): void
    {
        $jane = User::where('display_name', 'Jane N')->firstOrFail();
        Sanctum::actingAs($jane);

        $this->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('display_name', 'Jane N')
            ->assertJsonCount(2, 'participations')
            ->assertJsonPath('participations.0.role', 'student')
            ->assertJsonStructure(['id', 'display_name', 'participations' => [['gig_id', 'gig_title', 'role']]]);
    }

    public function test_it_rejects_an_anonymous_caller(): void
    {
        $this->getJson('/api/v1/auth/me')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'UNAUTHENTICATED');
    }

    public function test_role_resolves_per_gig_and_is_null_for_a_stranger(): void
    {
        $sam = User::where('display_name', 'Sam O')->firstOrFail();
        $gig = Gig::firstOrFail();
        $stranger = User::create(['display_name' => 'Nobody']);

        $resolver = app(RoleResolver::class);

        $this->assertSame('assessor', $resolver->for($sam, $gig));
        $this->assertNull($resolver->for($stranger, $gig));
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd api && php artisan test --filter=AuthMeTest
```

Expected: FAIL, `Class "App\Services\RoleResolver" not found`.

- [ ] **Step 3: Write the resolver**

Create `api/app/Services/RoleResolver.php`:

```php
<?php

namespace App\Services;

use App\Models\Gig;
use App\Models\User;

/**
 * The one place a role is decided. Roles are per gig, never global,
 * because the same person can be a student on one and an assessor on
 * another. A role is never read from the request: a client-supplied
 * role is a client-supplied permission.
 */
class RoleResolver
{
    /** @var array<string, string|null> */
    private array $memo = [];

    public function for(User $user, Gig $gig): ?string
    {
        $key = $user->id.':'.$gig->id;

        return $this->memo[$key] ??= $gig->participants()
            ->where('user_id', $user->id)
            ->value('role');
    }

    /**
     * Null means not a participant, which callers must treat as 404
     * rather than 403. The caller should not learn the gig exists.
     */
    public function isParticipant(User $user, Gig $gig): bool
    {
        return $this->for($user, $gig) !== null;
    }
}
```

- [ ] **Step 4: Write the resource and controller**

Create `api/app/Http/Resources/MeResource.php`:

```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MeResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'display_name' => $this->display_name,
            'participations' => $this->participations->map(fn ($p) => [
                'gig_id' => $p->gig_id,
                'gig_title' => $p->gig->title,
                'role' => $p->role,
            ])->values(),
        ];
    }
}
```

Create `api/app/Http/Controllers/Api/V1/AuthController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\MeResource;
use Illuminate\Http\Request;

class AuthController extends Controller
{
    public function me(Request $request): MeResource
    {
        return new MeResource(
            $request->user()->load('participations.gig')
        );
    }
}
```

- [ ] **Step 5: Add the route**

Replace the contents of `api/routes/api.php` with:

```php
<?php

use App\Http\Controllers\Api\V1\AuthController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->middleware('auth:sanctum')->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);
});
```

- [ ] **Step 6: Run the test and watch it pass**

```bash
cd api && php artisan test --filter=AuthMeTest
```

Expected: 3 passing tests. Re-enable the 401 test in `ErrorEnvelopeTest` if you commented it out in Task 4, and run `php artisan test` to confirm the whole suite is green.

- [ ] **Step 7: Write the contract for this endpoint**

In `docs/openapi.yaml`, replace `paths: {}` with the security scheme, the error envelope and this path:

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
  schemas:
    Error:
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [code, message, details]
          properties:
            code:
              type: string
              enum: [VALIDATION_FAILED, UNAUTHENTICATED, ROLE_FORBIDDEN, NOT_FOUND,
                     DUPLICATE_REFLECTION]
            message: { type: string }
            details: { type: object, additionalProperties: true }
    Me:
      type: object
      required: [id, display_name, participations]
      properties:
        id: { type: string, format: uuid }
        display_name: { type: string }
        participations:
          type: array
          items:
            type: object
            required: [gig_id, gig_title, role]
            properties:
              gig_id: { type: string, format: uuid }
              gig_title: { type: string }
              role: { type: string, enum: [student, assessor, supervisor, employer] }

security:
  - bearerAuth: []

paths:
  /auth/me:
    get:
      summary: The caller and their role on each gig
      responses:
        '200':
          description: The caller
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Me' }
        '401':
          description: Missing or invalid token
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
```

- [ ] **Step 8: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add api/app api/routes/api.php api/tests/Feature/AuthMeTest.php docs/openapi.yaml
git commit -m "feat(api): resolve roles per gig and add GET /auth/me"
```

---

### Task 7: GET /gigs and GET /gigs/{gig}

**Files:**
- Create: `api/app/Http/Controllers/Api/V1/GigController.php`
- Create: `api/app/Http/Resources/GigResource.php`
- Modify: `api/routes/api.php`
- Modify: `docs/openapi.yaml`
- Test: `api/tests/Feature/GigsTest.php`

**Interfaces:**
- Consumes: `RoleResolver::for()` from Task 6.
- Produces: routes `GET /api/v1/gigs` and `GET /api/v1/gigs/{gig}`.

- [ ] **Step 1: Write the failing test**

Create `api/tests/Feature/GigsTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Gig;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GigsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoSeeder::class);
    }

    public function test_it_lists_only_the_gigs_the_caller_is_on(): void
    {
        Sanctum::actingAs(User::where('display_name', 'Jane N')->firstOrFail());

        $this->getJson('/api/v1/gigs')
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.my_role', 'student')
            ->assertJsonStructure([['id', 'title', 'org_name', 'starts_on', 'ends_on',
                'my_role', 'sprints' => [['id', 'ordinal', 'opens_on', 'due_on']],
                'framework' => ['id', 'fw_key', 'name', 'version'],
                'reflection_summary' => ['draft', 'submitted', 'assessed']]]);
    }

    public function test_a_stranger_sees_no_gigs(): void
    {
        Sanctum::actingAs(User::create(['display_name' => 'Nobody']));

        $this->getJson('/api/v1/gigs')->assertOk()->assertJsonCount(0);
    }

    public function test_it_shows_one_gig_with_participants(): void
    {
        Sanctum::actingAs(User::where('display_name', 'Sam O')->firstOrFail());
        $gig = Gig::firstOrFail();

        $this->getJson("/api/v1/gigs/{$gig->id}")
            ->assertOk()
            ->assertJsonPath('my_role', 'assessor')
            ->assertJsonCount(3, 'participants');
    }

    public function test_a_non_participant_gets_404_not_403(): void
    {
        Sanctum::actingAs(User::create(['display_name' => 'Nobody']));
        $gig = Gig::firstOrFail();

        $this->getJson("/api/v1/gigs/{$gig->id}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'NOT_FOUND');
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd api && php artisan test --filter=GigsTest
```

Expected: FAIL with 404 on `/api/v1/gigs`, because the route does not exist.

- [ ] **Step 3: Write the resource**

Create `api/app/Http/Resources/GigResource.php`:

```php
<?php

namespace App\Http\Resources;

use App\Services\RoleResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class GigResource extends JsonResource
{
    public static $wrap = null;

    public function __construct($resource, private bool $withParticipants = false)
    {
        parent::__construct($resource);
    }

    public function toArray(Request $request): array
    {
        $framework = $this->assignment?->framework;

        $data = [
            'id' => $this->id,
            'title' => $this->title,
            'org_name' => $this->org_name,
            'starts_on' => $this->starts_on?->toDateString(),
            'ends_on' => $this->ends_on?->toDateString(),
            'my_role' => app(RoleResolver::class)->for($request->user(), $this->resource),
            'sprints' => $this->sprints->map(fn ($s) => [
                'id' => $s->id,
                'ordinal' => $s->ordinal,
                'opens_on' => $s->opens_on?->toDateString(),
                'due_on' => $s->due_on?->toDateString(),
            ])->values(),
            'framework' => $framework ? [
                'id' => $framework->id,
                'fw_key' => $framework->fw_key,
                'name' => $framework->name,
                'version' => $framework->version,
            ] : null,
            'reflection_summary' => [
                'draft' => $this->reflections->where('status', 'draft')->count(),
                'submitted' => $this->reflections->where('status', 'submitted')->count(),
                'assessed' => $this->reflections->where('status', 'assessed')->count(),
            ],
        ];

        // Only the single-gig endpoint returns participants. Do not use
        // array_filter to strip the key when absent: a gig with no
        // org_name or no dates would lose those keys too, and the
        // frontend types are generated from a fixed shape.
        if ($this->withParticipants) {
            $data['participants'] = $this->participants->map(fn ($p) => [
                'id' => $p->user_id,
                'display_name' => $p->user->display_name,
                'role' => $p->role,
            ])->values();
        }

        return $data;
    }
}
```

- [ ] **Step 4: Write the controller**

Create `api/app/Http/Controllers/Api/V1/GigController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\GigResource;
use App\Models\Gig;
use App\Services\RoleResolver;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class GigController extends Controller
{
    public function __construct(private RoleResolver $roles) {}

    public function index(Request $request)
    {
        $gigs = Gig::query()
            ->whereHas('participants', fn ($q) => $q->where('user_id', $request->user()->id))
            ->with(['sprints', 'assignment.framework', 'reflections'])
            ->orderBy('starts_on')
            ->get();

        return GigResource::collection($gigs);
    }

    public function show(Request $request, Gig $gig): GigResource
    {
        // Not a participant is a 404, never a 403. The caller must not
        // learn that a gig they have no part in exists.
        if (! $this->roles->isParticipant($request->user(), $gig)) {
            throw new NotFoundHttpException;
        }

        $gig->load(['sprints', 'assignment.framework', 'reflections', 'participants.user']);

        return new GigResource($gig, withParticipants: true);
    }
}
```

- [ ] **Step 5: Add the routes**

In `api/routes/api.php`, inside the existing `v1` group:

```php
Route::get('/gigs', [GigController::class, 'index']);
Route::get('/gigs/{gig}', [GigController::class, 'show']);
```

Add `use App\Http\Controllers\Api\V1\GigController;` at the top.

- [ ] **Step 6: Run the test and watch it pass**

```bash
cd api && php artisan test --filter=GigsTest
```

Expected: 4 passing tests.

- [ ] **Step 7: Add both paths to the contract**

In `docs/openapi.yaml`, add to `components.schemas`:

```yaml
    Sprint:
      type: object
      required: [id, ordinal, opens_on, due_on]
      properties:
        id: { type: string, format: uuid }
        ordinal: { type: integer }
        opens_on: { type: string, format: date, nullable: true }
        due_on: { type: string, format: date, nullable: true }
    Gig:
      type: object
      required: [id, title, org_name, starts_on, ends_on, my_role, sprints, framework, reflection_summary]
      properties:
        id: { type: string, format: uuid }
        title: { type: string }
        org_name: { type: string, nullable: true }
        starts_on: { type: string, format: date, nullable: true }
        ends_on: { type: string, format: date, nullable: true }
        my_role: { type: string, enum: [student, assessor, supervisor, employer] }
        sprints:
          type: array
          items: { $ref: '#/components/schemas/Sprint' }
        framework:
          nullable: true
          type: object
          required: [id, fw_key, name, version]
          properties:
            id: { type: string, format: uuid }
            fw_key: { type: string }
            name: { type: string }
            version: { type: string }
        reflection_summary:
          type: object
          required: [draft, submitted, assessed]
          properties:
            draft: { type: integer }
            submitted: { type: integer }
            assessed: { type: integer }
        participants:
          description: Present only on the single-gig endpoint.
          type: array
          items:
            type: object
            required: [id, display_name, role]
            properties:
              id: { type: string, format: uuid }
              display_name: { type: string }
              role: { type: string, enum: [student, assessor, supervisor, employer] }
```

And to `paths`:

```yaml
  /gigs:
    get:
      summary: Gigs the caller participates in, in any role
      responses:
        '200':
          description: The caller's gigs
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/Gig' }
        '401':
          description: Missing or invalid token
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
  /gigs/{gig_id}:
    get:
      summary: One gig, with its participants
      parameters:
        - name: gig_id
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        '200':
          description: The gig
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Gig' }
        '401':
          description: Missing or invalid token
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '404':
          description: No such gig, or the caller is not a participant
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
```

- [ ] **Step 8: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add api/app api/routes/api.php api/tests/Feature/GigsTest.php docs/openapi.yaml
git commit -m "feat(api): add GET /gigs and GET /gigs/{gig}"
```

---

### Task 8: GET /frameworks and GET /frameworks/{framework}

**Files:**
- Create: `api/app/Http/Controllers/Api/V1/FrameworkController.php`
- Create: `api/app/Http/Resources/FrameworkResource.php`
- Create: `api/app/Http/Resources/FrameworkDetailResource.php`
- Modify: `api/routes/api.php`
- Modify: `docs/openapi.yaml`
- Test: `api/tests/Feature/FrameworksTest.php`

**Interfaces:**
- Consumes: models from Task 3.
- Produces: routes `GET /api/v1/frameworks` and `GET /api/v1/frameworks/{framework}`.

- [ ] **Step 1: Write the failing test**

Create `api/tests/Feature/FrameworksTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Framework;
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
            ->assertJsonPath('0.in_use', false);
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd api && php artisan test --filter=FrameworksTest
```

Expected: FAIL with 404, the route does not exist.

- [ ] **Step 3: Write the list resource**

Create `api/app/Http/Resources/FrameworkResource.php`:

```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FrameworkResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'fw_key' => $this->fw_key,
            'version' => $this->version,
            'name' => $this->name,
            'is_active' => (bool) $this->is_active,
            'created_by' => $this->created_by,
            // in_use is derived, not stored. A framework any reflection
            // references is permanently read only.
            'in_use' => (bool) $this->reflections_exists,
        ];
    }
}
```

- [ ] **Step 4: Write the detail resource**

Create `api/app/Http/Resources/FrameworkDetailResource.php`:

```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

class FrameworkDetailResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        // The scale is computed from the level rows by v_framework_scale
        // rather than stored on the framework, because a SFIA skill is
        // valid over only part of the seven-point scale. Read the view;
        // do not aggregate in PHP.
        $scale = DB::table('v_framework_scale')->where('framework_id', $this->id)->first();

        return [
            'id' => $this->id,
            'fw_key' => $this->fw_key,
            'version' => $this->version,
            'name' => $this->name,
            'created_by' => $this->created_by,
            'in_use' => (bool) $this->reflections_exists,
            'comment_required' => (bool) $this->comment_required,
            'evidence_required' => (bool) $this->evidence_required,
            'accepted_file_types' => $this->accepted_file_types,
            'max_file_bytes' => (int) $this->max_file_bytes,
            'scale' => [
                'min' => (int) ($scale->scale_min ?? 0),
                'max' => (int) ($scale->scale_max ?? 0),
            ],
            'competencies' => $this->competencies->map(fn ($c) => [
                'id' => $c->id,
                'code' => $c->code,
                'name' => $c->name,
                'short_label' => $c->short_label,
                'category' => $c->category,
                'position' => $c->position,
                'levels' => $c->levels->map(fn ($l) => [
                    'id' => $l->id,
                    'level_value' => $l->level_value,
                    'descriptor' => $l->descriptor,
                ])->values(),
            ])->values(),
        ];
    }
}
```

- [ ] **Step 5: Write the controller**

Create `api/app/Http/Controllers/Api/V1/FrameworkController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\FrameworkDetailResource;
use App\Http\Resources\FrameworkResource;
use App\Models\Framework;
use Illuminate\Http\Request;

class FrameworkController extends Controller
{
    public function index(Request $request)
    {
        $frameworks = Framework::query()
            ->when($request->boolean('active'), fn ($q) => $q->where('is_active', true))
            ->withExists('reflections')
            ->orderBy('name')
            ->get();

        return FrameworkResource::collection($frameworks);
    }

    public function show(Framework $framework): FrameworkDetailResource
    {
        $framework->loadExists('reflections');
        $framework->load('competencies.levels');

        return new FrameworkDetailResource($framework);
    }
}
```

- [ ] **Step 6: Add the routes**

In `api/routes/api.php`, inside the `v1` group:

```php
Route::get('/frameworks', [FrameworkController::class, 'index']);
Route::get('/frameworks/{framework}', [FrameworkController::class, 'show']);
```

Add `use App\Http\Controllers\Api\V1\FrameworkController;` at the top.

- [ ] **Step 7: Run the test and watch it pass**

```bash
cd api && php artisan test --filter=FrameworksTest
```

Expected: 5 passing tests. The SFIA case is the one that matters most: it proves the same code serves a structurally different rubric, which is the entire point of the framework engine.

- [ ] **Step 8: Add both paths to the contract**

In `docs/openapi.yaml`, add to `components.schemas`:

```yaml
    Framework:
      type: object
      required: [id, fw_key, version, name, is_active, created_by, in_use]
      properties:
        id: { type: string, format: uuid }
        fw_key: { type: string }
        version: { type: string }
        name: { type: string }
        is_active: { type: boolean }
        created_by:
          type: string
          format: uuid
          nullable: true
          description: Null means a seeded base template, set means someone's copy.
        in_use:
          type: boolean
          description: True when any reflection references it, which makes it permanently read only.
    Level:
      type: object
      required: [id, level_value, descriptor]
      properties:
        id: { type: string, format: uuid }
        level_value: { type: integer }
        descriptor: { type: string }
    Competency:
      type: object
      required: [id, code, name, short_label, category, position, levels]
      properties:
        id: { type: string, format: uuid }
        code: { type: string }
        name: { type: string }
        short_label: { type: string, nullable: true }
        category: { type: string, nullable: true }
        position: { type: integer }
        levels:
          type: array
          items: { $ref: '#/components/schemas/Level' }
    FrameworkDetail:
      allOf:
        - $ref: '#/components/schemas/Framework'
        - type: object
          required: [comment_required, evidence_required, accepted_file_types, max_file_bytes, scale, competencies]
          properties:
            comment_required: { type: boolean }
            evidence_required: { type: boolean }
            accepted_file_types:
              type: array
              nullable: true
              items: { type: string }
            max_file_bytes: { type: integer }
            scale:
              description: Computed from the level rows by v_framework_scale, not stored.
              type: object
              required: [min, max]
              properties:
                min: { type: integer }
                max: { type: integer }
            competencies:
              type: array
              items: { $ref: '#/components/schemas/Competency' }
```

And to `paths`:

```yaml
  /frameworks:
    get:
      summary: Available frameworks
      parameters:
        - name: active
          in: query
          required: false
          schema: { type: boolean }
      responses:
        '200':
          description: Frameworks
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/Framework' }
        '401':
          description: Missing or invalid token
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
  /frameworks/{framework_id}:
    get:
      summary: The full rubric, nested
      parameters:
        - name: framework_id
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        '200':
          description: The framework with its competencies and levels
          content:
            application/json:
              schema: { $ref: '#/components/schemas/FrameworkDetail' }
        '401':
          description: Missing or invalid token
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '404':
          description: No such framework
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
```

- [ ] **Step 9: Run the whole suite and commit**

```bash
cd api && php artisan test
cd "$(git rev-parse --show-toplevel)"
git add api/app api/routes/api.php api/tests/Feature/FrameworksTest.php docs/openapi.yaml
git commit -m "feat(api): add GET /frameworks and GET /frameworks/{framework}"
```

---

### Task 9: Verify the slice against its definition of done

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a verified slice and a README that tells a teammate how to run the API.

- [ ] **Step 1: Confirm migrate is still a no-op on the shared database**

```bash
cd api && php artisan migrate --database=mysql
```

Expected: `Nothing to migrate.` If it tries to run the baseline, Task 2 Step 7 did not take and you must not proceed.

- [ ] **Step 2: Confirm the whole suite passes**

```bash
php artisan test
```

Expected: green, roughly 22 tests.

- [ ] **Step 3: Exercise the API by hand against real data**

```bash
php artisan serve &
TOKEN=<the Jane token printed by DemoSeeder>
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/auth/me | head -20
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/gigs | head -40
curl -s http://localhost:8000/api/v1/gigs | head -5     # expect the 401 envelope
```

- [ ] **Step 4: Confirm the contract serves a mock**

```bash
npx -y @stoplight/prism-cli mock docs/openapi.yaml --port 4010
curl -s http://localhost:4010/auth/me | head -20
```

- [ ] **Step 5: Document how to run it**

In `README.md`, under the backend setup step, add that `php artisan test` requires `DB_TEST_DATABASE` set to a personal database name in `api/phpunit.xml`, and that the three demo tokens come from `php artisan db:seed --class=DemoSeeder`.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: explain how to run the api and its tests"
```

---

## Notes for whoever executes this

**Do not run `php artisan migrate:fresh` with `DB_CONNECTION=mysql`.** That drops the shared schema for all five of you. The test connection is a separate entry precisely so a slip cannot reach the real database, but the guard is a config value, not a wall. Check which connection you are on before any destructive artisan command.

**If a test fails with `Access denied`, suspect TLS before the password.** PDO does not negotiate TLS unless `MYSQL_ATTR_SSL_CA` is set, and MySQL reports the refusal as an authentication failure. This costs an hour if you do not know it.

**`DemoSeeder` is the canonical demo data.** `db/02-seed.sql` has been removed. Frameworks are still seeded by `db/01-schema.sql`, because they are part of the reviewed schema; everything else belongs to the seeder. When the shaped scores and written narratives are needed for the scoring slice, they extend `DemoSeeder` rather than reviving a SQL file.
