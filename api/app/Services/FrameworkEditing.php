<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Framework;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Copy-then-edit, and the guard that makes it the only model.
 *
 * "A framework in use is read-only" is one rule with four entry points:
 * renaming the framework, renaming a competency, rewording a level, and
 * changing the file policy. It is implemented once, here, and each of
 * those endpoints calls it.
 */
class FrameworkEditing
{
    /**
     * A framework any reflection references is frozen, for good.
     *
     * Not a policy check, because this is a conflict rather than a
     * permission: the caller owns the thing and would ordinarily be
     * allowed to edit it. What stopped them is that somebody has already
     * been scored against it.
     */
    public function assertEditable(Framework $framework): void
    {
        if (! $framework->reflections()->exists()) {
            return;
        }

        throw new ApiException(
            'FRAMEWORK_IN_USE',
            'This framework has been used to score a reflection and can no longer be changed. Copy it and edit the copy.',
            ['framework_id' => $framework->id],
            409,
        );
    }

    /**
     * Deep copy: the framework row, every competency, every level.
     *
     * The base is untouched, which is the point. Levels hang off
     * competencies rather than off the framework, so a SFIA skill valid
     * over part of the seven-point scale copies with exactly the levels
     * it had, not with seven.
     */
    public function copy(Framework $base, User $creator, string $name): Framework
    {
        return DB::transaction(function () use ($base, $creator, $name) {
            $copy = Framework::create([
                'created_by' => $creator->id,
                'fw_key' => $this->uniqueKey($name),
                // v1 of the copy, not of the base. The copy has its own
                // history from here and the two never converge again.
                'version' => 'v1',
                'name' => $name,
                'is_active' => true,
                'comment_required' => $base->comment_required,
                'evidence_required' => $base->evidence_required,
                'accepted_file_types' => $base->accepted_file_types,
                'max_file_bytes' => $base->max_file_bytes,
            ]);

            foreach ($base->competencies()->with('levels')->get() as $competency) {
                $new = $copy->competencies()->create([
                    'code' => $competency->code,
                    'name' => $competency->name,
                    'category' => $competency->category,
                    'position' => $competency->position,
                    'short_label' => $competency->short_label,
                ]);

                foreach ($competency->levels as $level) {
                    $new->levels()->create([
                        'level_value' => $level->level_value,
                        'descriptor' => $level->descriptor,
                    ]);
                }
            }

            return $copy;
        });
    }

    /**
     * fw_key is unique with version, and every copy is v1, so the key has
     * to be unique on its own. Derived from the name so it stays readable
     * in a query, then suffixed until it is free.
     */
    private function uniqueKey(string $name): string
    {
        $base = Str::slug($name) ?: 'framework';
        $base = Str::limit($base, 48, '');
        $key = $base;

        for ($n = 2; Framework::where('fw_key', $key)->exists(); $n++) {
            $key = $base.'-'.$n;
        }

        return $key;
    }
}
